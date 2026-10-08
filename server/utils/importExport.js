import { getProducts, getProduct, createProduct, updateProduct } from './products.js';
import { getTypes, createType } from './types.js';
import { getFields, createField } from './fields.js';
import { parseCsv, toCsv, toRecords } from './csv.js';
import { parseMoney, formatMoney } from './money.js';
import { slugify } from './slug.js';
import { getCurrency } from './settings.js';
import { STATUSES, AVAILABILITIES, UNLIMITED } from './stock.js';

/*
  Moving a catalog in and out as a file. Two formats:

    csv   one row per product, for a spreadsheet. Columns: slug, name, type, status, availability,
          price (49.99), price_label, stock (blank is unlimited), tags (comma separated),
          description, options (JSON), and one `field.<key>` column per custom field.
    json  everything, including the types and fields themselves, so a catalog can move between sites.

  Images are not exported: a media id means nothing on another site.

  Import matches rows to products by slug (made from the name when there is none), so importing the
  same file twice updates or skips instead of duplicating. In a CSV an empty cell leaves what the
  product has unchanged and uses the default for a new one.
*/
const BASE_COLUMNS = ['slug', 'name', 'type', 'status', 'availability', 'price', 'price_label', 'stock', 'tags', 'description', 'options'];

export const FORMATS = ['csv', 'json'];

const PAGE = 200;

const everyProduct = async () => {
  const items = [];
  for(let offset = 0; ; offset += PAGE){
    const [error, page] = await getProducts({ limit: PAGE, offset, sort: 'oldest' });
    if(error) return [error, null];
    items.push(...page.items);
    if(!page.items.length || items.length >= page.total) return [null, items];
  }
};

const stripOption = option => ({
  key: option.key,
  label: option.label,
  required: option.required,
  priceType: option.priceType,
  choices: option.choices.map(({ key, label, price, available }) => ({ key, label, price, available })),
});

const cell = value => value === undefined || value === null ? '' : Array.isArray(value) ? value.join(', ') : String(value);

/* Resolves to [null, { filename, contentType, body }]. */
export const buildExport = async ({ format = 'csv' } = {}) => {
  if(!FORMATS.includes(format)) return [{ code: 400, msg: `format must be one of: ${FORMATS.join(', ')}` }, null];
  const [productsError, products] = await everyProduct();
  if(productsError) return [productsError, null];
  const [fieldsError, fields] = await getFields();
  if(fieldsError) return [fieldsError, null];
  const [typesError, types] = await getTypes();
  if(typesError) return [typesError, null];
  const currency = await getCurrency();

  if(format === 'json'){
    const body = JSON.stringify({
      format: 'kempo-products',
      version: 1,
      currency,
      types: types.map(({ key, name, description }) => ({ key, name, description })),
      fields: fields.map(({ key, label, type, productType, description, required, listed, filterable, options }) => ({ key, label, type, productType, description, required, listed, filterable, options })),
      products: products.map(product => ({
        slug: product.slug, name: product.name, type: product.type, description: product.description, status: product.status,
        availability: product.availability, price: product.price, priceLabel: product.priceLabel, stock: product.stock,
        tags: product.tags, fields: product.fields, options: product.options.map(stripOption),
      })),
    }, null, 2);
    return [null, { filename: 'products.json', contentType: 'application/json; charset=utf-8', body }];
  }

  const keys = [...new Set(fields.filter(field => field.type !== 'media').map(field => field.key))];
  const rows = [[...BASE_COLUMNS, ...keys.map(key => `field.${key}`)]];
  for(const product of products){
    rows.push([
      product.slug, product.name, product.type, product.status, product.availability,
      product.price === null ? '' : formatMoney(product.price, currency), product.priceLabel,
      product.stock === UNLIMITED ? '' : product.stock, product.tags.join(', '), product.description,
      product.options.length ? JSON.stringify(product.options.map(stripOption)) : '',
      ...keys.map(key => cell(product.fields[key])),
    ]);
  }
  return [null, { filename: 'products.csv', contentType: 'text/csv; charset=utf-8', body: toCsv(rows) }];
};

const fail = (line, message, name = '') => ({ line, name, message });

const splitTags = text => text.split(',').map(tag => tag.trim()).filter(Boolean);

/* One CSV record -> the product data it describes, or an error. Empty cells are left out, so they change nothing. */
const fromRecord = (record, line, { currency, fieldKeys }) => {
  const name = (record.name ?? '').trim();
  if(!name) return { error: fail(line, 'name is required') };
  const data = { name };
  const slug = (record.slug ?? '').trim().toLowerCase() || slugify(name);
  if(!slug) return { error: fail(line, 'a slug could not be made from this name; add a slug column', name) };

  const status = (record.status ?? '').trim().toLowerCase();
  if(status){
    if(!STATUSES.includes(status)) return { error: fail(line, `status must be one of: ${STATUSES.join(', ')}`, name) };
    data.status = status;
  }
  const availability = (record.availability ?? '').trim().toLowerCase();
  if(availability){
    if(!AVAILABILITIES.includes(availability)) return { error: fail(line, `availability must be one of: ${AVAILABILITIES.join(', ')}`, name) };
    data.availability = availability;
  }
  const price = (record.price ?? '').trim();
  if(price){
    const [priceError, minor] = parseMoney(price, currency);
    if(priceError || minor < 0) return { error: fail(line, `price "${price}" is not an amount such as 49.99`, name) };
    data.price = minor;
  }
  if((record.price_label ?? '').trim()) data.priceLabel = record.price_label.trim();
  const stock = (record.stock ?? '').trim().toLowerCase();
  if(stock) data.stock = stock === 'unlimited' ? UNLIMITED : stock;
  if((record.tags ?? '').trim()) data.tags = splitTags(record.tags);
  if((record.description ?? '').trim()) data.description = record.description.trim();
  if((record.options ?? '').trim()){
    try {
      data.options = JSON.parse(record.options);
    } catch {
      return { error: fail(line, 'options is not valid JSON', name) };
    }
  }

  const fields = {};
  for(const [column, value] of Object.entries(record)){
    if(!column.startsWith('field.') || !value.trim()) continue;
    const key = fieldKeys.get(column.slice(6));
    if(key) fields[key] = value.trim();
  }
  if(Object.keys(fields).length) data.fields = fields;
  return { row: { line, slug, typeText: (record.type ?? '').trim(), data } };
};

/* One product object from a JSON file (the shape buildExport writes) -> the same. */
const fromJson = (product, line) => {
  const name = String(product?.name ?? '').trim();
  if(!name) return { error: fail(line, 'name is required') };
  const data = { name };
  for(const property of ['description', 'status', 'availability', 'price', 'priceLabel', 'stock', 'tags', 'fields', 'options']){
    if(product[property] !== undefined) data[property] = product[property];
  }
  const slug = String(product.slug ?? '').trim().toLowerCase() || slugify(name);
  if(!slug) return { error: fail(line, 'a slug could not be made from this name', name) };
  return { row: { line, slug, typeText: String(product.type ?? '').trim(), data } };
};

/*
  Reads a file (the text of a .csv or .json) into rows to import. Resolves to
  [null, { rows, errors, types, fields, format }]; `errors` holds the rows that could not be read,
  and `types` and `fields` (JSON only) are definitions to create when missing.
*/
export const parseImport = async text => {
  const content = String(text ?? '').replace(/^﻿/, '').trim();
  if(!content) return [{ code: 400, msg: 'The file is empty' }, null];
  const rows = [];
  const errors = [];

  if(content.startsWith('{') || content.startsWith('[')){
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      return [{ code: 400, msg: 'The file is not valid JSON' }, null];
    }
    const products = Array.isArray(parsed) ? parsed : parsed?.products;
    if(!Array.isArray(products)) return [{ code: 400, msg: 'The JSON has no list of products' }, null];
    products.forEach((product, index) => {
      const { row, error } = fromJson(product, index + 1);
      if(row) rows.push(row); else errors.push(error);
    });
    return [null, { rows, errors, format: 'json', types: Array.isArray(parsed.types) ? parsed.types : [], fields: Array.isArray(parsed.fields) ? parsed.fields : [] }];
  }

  let records;
  try {
    records = toRecords(parseCsv(content));
  } catch(error) {
    return [{ code: 400, msg: error.message }, null];
  }
  if(!records.length) return [{ code: 400, msg: 'The file has a header but no products' }, null];
  if(!('name' in records[0])) return [{ code: 400, msg: 'The file needs a "name" column' }, null];
  const [fieldsError, fields] = await getFields();
  if(fieldsError) return [fieldsError, null];
  const context = { currency: await getCurrency(), fieldKeys: new Map(fields.map(field => [field.key.toLowerCase(), field.key])) };
  records.forEach((record, index) => {
    const { row, error } = fromRecord(record, index + 2, context);
    if(row) rows.push(row); else errors.push(error);
  });
  return [null, { rows, errors, format: 'csv', types: [], fields: [] }];
};

const resolveType = (text, types) => {
  if(!text) return '';
  const lower = text.toLowerCase();
  return types.find(type => type.key === lower || type.name.toLowerCase() === lower)?.key ?? null;
};

/*
  Brings the types and fields a JSON file carries into existence when the site lacks them, as
  things people manage. One that exists already is left alone, whatever the file says.
*/
const createDefinitions = async ({ types, fields }) => {
  const problems = [];
  const [, existingTypes] = await getTypes();
  for(const type of types){
    if((existingTypes ?? []).some(existing => existing.key === type.key)) continue;
    const [error] = await createType({ key: type.key, name: type.name, description: type.description });
    if(error) problems.push(`Type "${type.name ?? type.key}": ${error.msg}`);
  }
  const [, existingFields] = await getFields();
  for(const field of fields){
    if(field.type === 'media') continue;
    if((existingFields ?? []).some(existing => existing.key === field.key && existing.productType === (field.productType ?? ''))) continue;
    const [error] = await createField({ ...field, productType: field.productType ?? '' });
    if(error) problems.push(`Field "${field.label ?? field.key}": ${error.msg}`);
  }
  return problems;
};

/*
  Imports the rows, or with `dryRun` only reports what would happen. `onMatch` says what to do with a
  row whose slug already exists: 'skip' (the default) or 'update'. Rows are independent: one that
  fails is reported and the rest carry on. Resolves to
  [null, { created, updated, skipped, errors: [{ line, name, message }], total }].
*/
export const applyImport = async ({ rows, errors: readErrors = [], types = [], fields = [] }, { onMatch = 'skip', dryRun = false, userId = '' } = {}) => {
  if(!['skip', 'update'].includes(onMatch)) return [{ code: 400, msg: 'onMatch must be skip or update' }, null];
  const result = { created: 0, updated: 0, skipped: 0, errors: [...readErrors], total: rows.length + readErrors.length, notes: [] };

  if(!dryRun && (types.length || fields.length)) result.notes.push(...await createDefinitions({ types, fields }));
  const [, known] = await getTypes();
  const available = [...(known ?? []), ...(dryRun ? types.map(type => ({ key: type.key, name: type.name ?? type.key })) : [])];

  for(const row of rows){
    const type = resolveType(row.typeText, available);
    if(type === null){
      result.errors.push(fail(row.line, `there is no product type "${row.typeText}". Make it first under Products > Types`, row.data.name));
      continue;
    }
    const [lookupError, existing] = await getProduct(row.slug);
    if(lookupError && lookupError.code !== 404){
      result.errors.push(fail(row.line, lookupError.msg, row.data.name));
      continue;
    }
    if(existing){
      if(onMatch === 'skip'){
        result.skipped += 1;
        continue;
      }
      if(dryRun){
        result.updated += 1;
        continue;
      }
      const data = { ...row.data, userId };
      if(row.typeText) data.type = type;
      const [error] = await updateProduct(existing.id, data);
      if(error) result.errors.push(fail(row.line, error.msg, row.data.name)); else result.updated += 1;
      continue;
    }
    if(dryRun){
      result.created += 1;
      continue;
    }
    const [error] = await createProduct({ ...row.data, slug: row.slug, type, userId });
    if(error) result.errors.push(fail(row.line, error.msg, row.data.name)); else result.created += 1;
  }
  return [null, result];
};

/* Parses and applies in one call: what the HTTP route and a script both want. */
export const importFile = async (text, options = {}) => {
  const [error, parsed] = await parseImport(text);
  if(error) return [error, null];
  return applyImport(parsed, options);
};
