import { getProducts, getProduct, createProduct, updateProduct } from './products.js';
import { getTemplates, createTemplate } from './templates.js';
import { getCategories, createCategory } from './categories.js';
import { getAttributes, createAttribute } from './attributes.js';
import { parseCsv, toCsv, toRecords } from './csv.js';
import { parseMoney, formatMoney } from './money.js';
import { slugify } from './slug.js';
import { getCurrency } from './settings.js';
import { STATUSES, AVAILABILITIES, UNLIMITED } from './quantity.js';

/*
  Moving a catalog in and out as a file. Two formats:

    csv   one row per product, for a spreadsheet. Columns: slug, name, template, status, availability,
          price (49.99), price_label, quantity (blank is unlimited), tags (comma separated),
          categories (comma separated keys or names), description, options (JSON), and one `attribute.<key>` column per custom attribute.
    json  everything, including the templates, categories and attributes themselves, so a catalog can move between sites.

  Images are not exported: a media id means nothing on another site.

  Import matches rows to products by slug (made from the name when there is none), so importing the
  same file twice updates or skips instead of duplicating. In a CSV an empty cell leaves what the
  product has unchanged and uses the default for a new one.
*/
const BASE_COLUMNS = ['slug', 'name', 'template', 'status', 'availability', 'price', 'price_label', 'minimum_price', 'quantity', 'tags', 'categories', 'description', 'options'];

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
  const [fieldsError, attributes] = await getAttributes();
  if(fieldsError) return [fieldsError, null];
  const [categoriesError, categories] = await getCategories();
  if(categoriesError) return [categoriesError, null];
  const [templatesError, templates] = await getTemplates();
  if(templatesError) return [templatesError, null];
  const currency = await getCurrency();

  if(format === 'json'){
    const body = JSON.stringify({
      format: 'kempo-products',
      version: 1,
      currency,
      templates: templates.map(({ key, name, description, position, attributes: templateAttributes, options, defaults, product: templateProduct }) => ({ key, name, description, position, product: templateProduct, attributes: templateAttributes, options: options.map(stripOption), defaults })),
      categories: categories.map(({ key, name, description, position }) => ({ key, name, description, position })),
      attributes: attributes.map(({ key, label, type, description, required, listed, filterable, options }) => ({ key, label, type, description, required, listed, filterable, options })),
      products: products.map(product => ({
        slug: product.slug, name: product.name, template: product.template, attributeDefs: product.attributeDefs, description: product.own.description, status: product.status,
        availability: product.availability, price: product.own.price, minimumPrice: product.own.minimumPrice, priceLabel: product.own.priceLabel, quantity: product.quantity,
        tags: product.own.tags, categories: product.own.categories, attributes: product.attributes, options: product.ownOptions.map(stripOption),
      })),
    }, null, 2);
    return [null, { filename: 'products.json', contentType: 'application/json; charset=utf-8', body }];
  }

  const keys = [...new Set([...attributes, ...templates.flatMap(template => template.attributes)].filter(attribute => attribute.type !== 'media').map(attribute => attribute.key))];
  const rows = [[...BASE_COLUMNS, ...keys.map(key => `attribute.${key}`)]];
  for(const product of products){
    rows.push([
      product.slug, product.name, product.template, product.status, product.availability,
      product.own.price === null ? '' : formatMoney(product.own.price, currency), product.own.priceLabel,
      product.own.minimumPrice === null ? '' : formatMoney(product.own.minimumPrice, currency),
      product.quantity === UNLIMITED ? '' : product.quantity, product.own.tags.join(', '), product.own.categories.join(', '), product.own.description,
      product.ownOptions.length ? JSON.stringify(product.ownOptions.map(stripOption)) : '',
      ...keys.map(key => cell(product.attributes[key])),
    ]);
  }
  return [null, { filename: 'products.csv', contentType: 'text/csv; charset=utf-8', body: toCsv(rows) }];
};

const fail = (line, message, name = '') => ({ line, name, message });

const splitTags = text => text.split(',').map(tag => tag.trim()).filter(Boolean);

/* One CSV record -> the product data it describes, or an error. Empty cells are left out, so they change nothing. */
const fromRecord = (record, line, { currency, attributeKeys }) => {
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
  const minimum = (record.minimum_price ?? '').trim();
  if(minimum){
    const [minimumError, minimumMinor] = parseMoney(minimum, currency);
    if(minimumError || minimumMinor < 0) return { error: fail(line, `minimum_price "${minimum}" is not an amount such as 5.00`, name) };
    data.minimumPrice = minimumMinor;
  }
  if((record.price_label ?? '').trim()) data.priceLabel = record.price_label.trim();
  const quantity = (record.quantity ?? '').trim().toLowerCase();
  if(quantity) data.quantity = quantity === 'unlimited' ? UNLIMITED : quantity;
  if((record.tags ?? '').trim()) data.tags = splitTags(record.tags);
  const categories = (record.categories ?? '').trim() ? splitTags(record.categories) : undefined;
  if((record.description ?? '').trim()) data.description = record.description.trim();
  if((record.options ?? '').trim()){
    try {
      data.options = JSON.parse(record.options);
    } catch {
      return { error: fail(line, 'options is not valid JSON', name) };
    }
  }

  const attributes = {};
  for(const [column, value] of Object.entries(record)){
    /* A file exported before attributes were called that has `field.` columns. */
    const prefix = ['attribute.', 'field.'].find(candidate => column.toLowerCase().startsWith(candidate));
    if(!prefix || !value.trim()) continue;
    const key = attributeKeys.get(column.slice(prefix.length).toLowerCase());
    if(key) attributes[key] = value.trim();
  }
  if(Object.keys(attributes).length) data.attributes = attributes;
  return { row: { line, slug, templateText: (record.template ?? '').trim(), categories, data } };
};

/* One product object from a JSON file (the shape buildExport writes) -> the same. */
const fromJson = (product, line) => {
  const name = String(product?.name ?? '').trim();
  if(!name) return { error: fail(line, 'name is required') };
  const data = { name };
  for(const property of ['description', 'status', 'availability', 'price', 'minimumPrice', 'priceLabel', 'quantity', 'tags', 'attributes', 'attributeDefs', 'options']){
    if(product[property] !== undefined) data[property] = product[property];
  }
  const slug = String(product.slug ?? '').trim().toLowerCase() || slugify(name);
  if(!slug) return { error: fail(line, 'a slug could not be made from this name', name) };
  const categories = Array.isArray(product.categories) ? product.categories.map(String) : undefined;
  return { row: { line, slug, templateText: String(product.template ?? '').trim(), categories, data } };
};

/*
  Reads a file (the text of a .csv or .json) into rows to import. Resolves to
  [null, { rows, errors, attributes, format }]; `errors` holds the rows that could not be read,
  and `templates`, `categories` and `attributes` (JSON only) are definitions to create when missing.
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
      /* A file exported before the rename calls it "stock". */
      if(product && typeof product === 'object' && product.quantity === undefined && product.stock !== undefined) product = { ...product, quantity: product.stock };
      /* And before attributes were called that, they were "fields". */
      if(product && typeof product === 'object' && product.attributes === undefined && product.fields !== undefined) product = { ...product, attributes: product.fields, attributeDefs: product.attributeDefs ?? product.fieldDefs };
      const { row, error } = fromJson(product, index + 1);
      if(row) rows.push(row); else errors.push(error);
    });
    const legacy = list => (Array.isArray(list) ? list : []).map(template => template?.attributes === undefined && template?.fields !== undefined ? { ...template, attributes: template.fields } : template);
    return [null, { rows, errors, format: 'json', templates: legacy(parsed.templates), categories: Array.isArray(parsed.categories) ? parsed.categories : [], attributes: Array.isArray(parsed.attributes) ? parsed.attributes : Array.isArray(parsed.fields) ? parsed.fields : [] }];
  }

  let records;
  try {
    records = toRecords(parseCsv(content));
  } catch(error) {
    return [{ code: 400, msg: error.message }, null];
  }
  if(!records.length) return [{ code: 400, msg: 'The file has a header but no products' }, null];
  if(!('name' in records[0])) return [{ code: 400, msg: 'The file needs a "name" column' }, null];
  const [fieldsError, attributes] = await getAttributes();
  if(fieldsError) return [fieldsError, null];
  const context = { currency: await getCurrency(), attributeKeys: new Map(attributes.map(attribute => [attribute.key.toLowerCase(), attribute.key])) };
  records.forEach((record, index) => {
    if(record.quantity === undefined && record.stock !== undefined) record.quantity = record.stock;
    const { row, error } = fromRecord(record, index + 2, context);
    if(row) rows.push(row); else errors.push(error);
  });
  return [null, { rows, errors, format: 'csv', templates: [], categories: [], attributes: [] }];
};

/* A template named in a file by its key or its name, as its key; '' for none, null when the site has no such template. */
const resolveTemplate = (text, templates) => {
  if(!text) return '';
  const lower = text.toLowerCase();
  return templates.find(template => template.key === lower || template.name.toLowerCase() === lower)?.key ?? null;
};

/* A category named in a file by its key or its name, as its key; null when the site has no such category. */
const resolveCategory = (text, categories) => {
  const lower = String(text).trim().toLowerCase();
  return categories.find(category => category.key === lower || String(category.name ?? '').toLowerCase() === lower)?.key ?? null;
};

/*
  Brings the templates, categories and attributes a JSON file carries into existence when the site lacks them, as
  things people manage. One that exists already is left alone, whatever the file says.
*/
const createDefinitions = async ({ templates, categories, attributes }) => {
  const problems = [];
  const [, existingCategories] = await getCategories();
  for(const category of categories){
    if((existingCategories ?? []).some(existing => existing.key === category.key)) continue;
    const [error] = await createCategory({ key: category.key, name: category.name, description: category.description, position: category.position });
    if(error) problems.push(`Category "${category.name ?? category.key}": ${error.msg}`);
  }
  const [, existingAttributes] = await getAttributes();
  for(const attribute of attributes){
    if(attribute.type === 'media') continue;
    if((existingAttributes ?? []).some(existing => existing.key === attribute.key)) continue;
    const [error] = await createAttribute(attribute);
    if(error) problems.push(`Attribute "${attribute.label ?? attribute.key}": ${error.msg}`);
  }
  /* After the attributes, because a template's defaults can name them. */
  const [, existingTemplates] = await getTemplates();
  for(const template of templates){
    if((existingTemplates ?? []).some(existing => existing.key === template.key)) continue;
    const [error] = await createTemplate(template);
    if(error) problems.push(`Template "${template.name ?? template.key}": ${error.msg}`);
  }
  return problems;
};

/*
  Imports the rows, or with `dryRun` only reports what would happen. `onMatch` says what to do with a
  row whose slug already exists: 'skip' (the default) or 'update'. Rows are independent: one that
  fails is reported and the rest carry on. Resolves to
  [null, { created, updated, skipped, errors: [{ line, name, message }], total }].
*/
export const applyImport = async ({ rows, errors: readErrors = [], templates = [], categories = [], attributes = [] }, { onMatch = 'skip', dryRun = false, userId = '' } = {}) => {
  if(!['skip', 'update'].includes(onMatch)) return [{ code: 400, msg: 'onMatch must be skip or update' }, null];
  const result = { created: 0, updated: 0, skipped: 0, errors: [...readErrors], total: rows.length + readErrors.length, notes: [] };

  if(!dryRun && (templates.length || categories.length || attributes.length)) result.notes.push(...await createDefinitions({ templates, categories, attributes }));
  const [, knownTemplates] = await getTemplates();
  const availableTemplates = [...(knownTemplates ?? []), ...(dryRun ? templates.map(template => ({ key: template.key, name: template.name ?? template.key })) : [])];
  const [, knownCategories] = await getCategories();
  const availableCategories = [...(knownCategories ?? []), ...(dryRun ? categories.map(category => ({ key: category.key, name: category.name ?? category.key })) : [])];

  for(const row of rows){
    const template = resolveTemplate(row.templateText, availableTemplates);
    if(template === null){
      result.errors.push(fail(row.line, `there is no template "${row.templateText}". Make it first under Products > Templates`, row.data.name));
      continue;
    }
    if(row.categories){
      const keys = row.categories.map(text => resolveCategory(text, availableCategories));
      const missing = row.categories.find((text, index) => keys[index] === null);
      if(missing !== undefined){
        result.errors.push(fail(row.line, `there is no category "${missing}". Make it first under Products > Categories`, row.data.name));
        continue;
      }
      row.data.categories = [...new Set(keys)];
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
      if(row.templateText) data.template = template;
      const [error] = await updateProduct(existing.id, data);
      if(error) result.errors.push(fail(row.line, error.msg, row.data.name)); else result.updated += 1;
      continue;
    }
    if(dryRun){
      result.created += 1;
      continue;
    }
    const [error] = await createProduct({ ...row.data, slug: row.slug, template, userId });
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
