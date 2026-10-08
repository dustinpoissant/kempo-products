import db from 'kempo/server/db/index.js';
import { eq, and, or, ilike, sql, desc, asc, inArray } from 'drizzle-orm';
import crypto from 'crypto';
import { kempoProduct, kempoProductOption, kempoProductType } from '../db/schema.js';
import { getFields } from './fields.js';
import { coerceValues, applicableFields } from './fieldTypes.js';
import { EVENTS, guard, notify } from './hooks.js';
import { normalizeTags, tidyTag } from './tags.js';
import { normalizeSlug, withSuffix } from './slug.js';
import { normalizeOptions, computePrice } from './pricing.js';
import { normalizeStock, UNLIMITED, STATUSES, AVAILABILITIES, unavailableReason } from './stock.js';
import { lockedProductChanges, notYours, stockLocked, ownerLabel } from './ownership.js';
import { getAssets, checkAssets } from './media.js';
import { getCurrency } from './settings.js';

const newId = () => crypto.randomBytes(8).toString('hex');

const isUniqueViolation = error => (error?.code || error?.cause?.code) === '23505';

const MAX_NAME = 200;
const MAX_DESCRIPTION = 50000;
const MAX_PRICE_LABEL = 100;
const MAX_IMAGES = 20;
const MEDIA_ID = /^[a-f0-9]{16}$/;
const ID_PATTERN = /^[a-f0-9]{16}$/;

const shapeOption = row => ({
  key: row.key,
  label: row.label,
  required: row.required,
  priceType: row.priceType,
  position: row.position,
  choices: row.choices ?? [],
});

/*
  The shape callers see: core properties, `fields` (the type's custom values) and `options`, plus
  what a client needs to decide whether to offer a buy button without re-deriving the rules.
*/
const shape = (row, options = []) => {
  if(!row) return row;
  const product = {
    id: row.id,
    slug: row.slug,
    name: row.name,
    type: row.type,
    description: row.description,
    status: row.status,
    availability: row.availability,
    price: row.price,
    priceLabel: row.priceLabel,
    stock: row.stock,
    managedBy: row.managedBy,
    images: row.images ?? [],
    tags: row.tags ?? [],
    fields: row.data ?? {},
    options,
    owner: row.owner,
    created: row.created,
    updated: row.updated,
    publishedAt: row.publishedAt,
  };
  const reason = unavailableReason(product);
  return { ...product, inStock: product.stock !== 0, purchasable: !reason, unavailableReason: reason };
};

const optionsFor = async productIds => {
  if(!productIds.length) return {};
  const rows = await db.select().from(kempoProductOption).where(inArray(kempoProductOption.productId, productIds)).orderBy(asc(kempoProductOption.position));
  const byProduct = {};
  for(const row of rows) (byProduct[row.productId] ??= []).push(shapeOption(row));
  return byProduct;
};

const withOptions = async rows => {
  const options = await optionsFor(rows.map(row => row.id));
  return rows.map(row => shape(row, options[row.id] ?? []));
};

/* The images the given products hold, described for display (empty without kempo-media). */
export const resolveImages = products => getAssets(products.flatMap(product => product.images));

const SORTS = {
  newest: [desc(kempoProduct.created), desc(kempoProduct.id)],
  oldest: [asc(kempoProduct.created), asc(kempoProduct.id)],
  name: [asc(sql`lower(${kempoProduct.name})`), asc(kempoProduct.id)],
  'price-asc': [sql`${kempoProduct.price} asc nulls last`, asc(kempoProduct.id)],
  'price-desc': [sql`${kempoProduct.price} desc nulls last`, asc(kempoProduct.id)],
};

export const SORT_KEYS = Object.keys(SORTS);

/*
  `ids` and `slugs` fetch exactly those products, `owner` keeps one owner's ('' for the ones people manage),
  `filters` is { fieldKey: 'exact value' } over a type's fields, and `inStock` drops sold-out ones.
*/
export const getProducts = async ({ q, type, status, availability, tag, filters = {}, ids, slugs, owner, inStock = false, sort = 'newest', limit = 50, offset = 0 } = {}) => {
  try {
    const conditions = [];
    if(q){
      const like = `%${q}%`;
      conditions.push(or(
        ilike(kempoProduct.name, like),
        ilike(kempoProduct.description, like),
        ilike(kempoProduct.slug, like),
        sql`${kempoProduct.tags}::text ilike ${like}`,
        sql`${kempoProduct.data}::text ilike ${like}`,
      ));
    }
    if(type !== undefined && type !== null) conditions.push(eq(kempoProduct.type, String(type)));
    if(status) conditions.push(inArray(kempoProduct.status, [status].flat()));
    if(availability) conditions.push(inArray(kempoProduct.availability, [availability].flat()));
    for(const wanted of [tag].flat().map(tidyTag).filter(Boolean)){
      conditions.push(sql`${kempoProduct.tags} @> ${JSON.stringify([wanted])}::jsonb`);
    }
    for(const [key, value] of Object.entries(filters ?? {})){
      if(value === undefined || value === null || value === '') continue;
      conditions.push(sql`${kempoProduct.data}->>${key} = ${String(value)}`);
    }
    if(Array.isArray(ids)){
      if(!ids.length) return [null, { items: [], total: 0 }];
      conditions.push(inArray(kempoProduct.id, ids));
    }
    if(Array.isArray(slugs)){
      if(!slugs.length) return [null, { items: [], total: 0 }];
      conditions.push(inArray(kempoProduct.slug, slugs.map(slug => String(slug).trim().toLowerCase())));
    }
    if(owner !== undefined) conditions.push(eq(kempoProduct.owner, String(owner ?? '')));
    if(inStock) conditions.push(sql`${kempoProduct.stock} <> 0`);

    const where = conditions.length ? and(...conditions) : undefined;
    const [{ total }] = await db.select({ total: sql`count(*)::int` }).from(kempoProduct).where(where);
    const rows = await db.select().from(kempoProduct).where(where)
      .orderBy(...(SORTS[sort] ?? SORTS.newest)).limit(limit).offset(offset);
    return [null, { items: await withOptions(rows), total }];
  } catch {
    return [{ code: 500, msg: 'Failed to retrieve products' }, null];
  }
};

/* One product by id or slug, with its options. */
export const getProduct = async idOrSlug => {
  if(!idOrSlug) return [{ code: 400, msg: 'Product id is required' }, null];
  try {
    const key = String(idOrSlug);
    const [row] = await db.select().from(kempoProduct)
      .where(ID_PATTERN.test(key) ? or(eq(kempoProduct.id, key), eq(kempoProduct.slug, key)) : eq(kempoProduct.slug, key));
    if(!row) return [{ code: 404, msg: 'Product not found' }, null];
    const options = await optionsFor([row.id]);
    return [null, shape(row, options[row.id] ?? [])];
  } catch {
    return [{ code: 500, msg: 'Failed to retrieve product' }, null];
  }
};

/*
  The pieces of a product's data that need validating on create and update. Returns
  [error, values] where `values` holds only what was supplied, tidied. `type` is the product's
  final type (for which fields apply).
*/
const validate = async (input, { type, partial }) => {
  const values = {};

  if(input.name !== undefined){
    const name = String(input.name).trim();
    if(!name) return [{ code: 400, msg: 'Name is required' }, null];
    if(name.length > MAX_NAME) return [{ code: 400, msg: `Name must be ${MAX_NAME} characters or fewer` }, null];
    values.name = name;
  }
  if(input.description !== undefined){
    const description = String(input.description).trim();
    if(description.length > MAX_DESCRIPTION) return [{ code: 400, msg: `Description must be ${MAX_DESCRIPTION} characters or fewer` }, null];
    values.description = description;
  }
  if(input.status !== undefined){
    if(!STATUSES.includes(input.status)) return [{ code: 400, msg: `Status must be one of: ${STATUSES.join(', ')}` }, null];
    values.status = input.status;
  }
  if(input.availability !== undefined){
    if(!AVAILABILITIES.includes(input.availability)) return [{ code: 400, msg: `Availability must be one of: ${AVAILABILITIES.join(', ')}` }, null];
    values.availability = input.availability;
  }
  if(input.price !== undefined){
    if(input.price === null || input.price === ''){
      values.price = null;
    } else {
      const price = Number(input.price);
      if(!Number.isSafeInteger(price) || price < 0) return [{ code: 400, msg: 'Price must be a whole number of the smallest currency unit (4999 for $49.99), or empty for no price' }, null];
      values.price = price;
    }
  }
  if(input.priceLabel !== undefined){
    const label = String(input.priceLabel ?? '').trim();
    if(label.length > MAX_PRICE_LABEL) return [{ code: 400, msg: `The price label must be ${MAX_PRICE_LABEL} characters or fewer` }, null];
    values.priceLabel = label;
  }
  if(input.stock !== undefined){
    const [stockError, stock] = normalizeStock(input.stock);
    if(stockError) return [stockError, null];
    values.stock = stock;
  }
  if(input.tags !== undefined){
    const [tagsError, tags] = normalizeTags(input.tags);
    if(tagsError) return [tagsError, null];
    values.tags = tags;
  }
  if(input.images !== undefined){
    const list = Array.isArray(input.images) ? input.images : [];
    const ids = [...new Set(list.map(id => String(id).trim()).filter(Boolean))];
    if(ids.length > MAX_IMAGES) return [{ code: 400, msg: `A product can have at most ${MAX_IMAGES} images` }, null];
    if(!ids.every(id => MEDIA_ID.test(id))) return [{ code: 400, msg: 'Images must be a list of media files' }, null];
    if(ids.length){
      const problem = await checkAssets(ids);
      if(problem) return [problem, null];
    }
    values.images = ids;
  }
  if(input.options !== undefined){
    const [optionsError, options] = normalizeOptions(input.options);
    if(optionsError) return [optionsError, null];
    values.options = options;
  }
  if(input.fields !== undefined || !partial){
    const [fieldsError, allFields] = await getFields();
    if(fieldsError) return [fieldsError, null];
    const [invalid, coerced] = coerceValues(applicableFields(allFields, type), input.fields ?? {}, { partial });
    if(invalid) return [invalid, null];
    values.fields = coerced;
  }
  return [null, values];
};

const typeExists = async key => {
  if(!key) return true;
  const [type] = await db.select({ key: kempoProductType.key }).from(kempoProductType).where(eq(kempoProductType.key, key));
  return Boolean(type);
};

const withoutNulls = values => Object.fromEntries(Object.entries(values).filter(([, value]) => value !== null));

const insertOptions = (tx, productId, options) => options.length
  ? tx.insert(kempoProductOption).values(options.map(option => ({ id: newId(), productId, ...option })))
  : Promise.resolve();

export const createProduct = async (data = {}, { owner = '' } = {}) => {
  const draft = {
    name: data.name,
    slug: data.slug,
    type: data.type ?? '',
    description: data.description ?? '',
    status: data.status ?? 'draft',
    availability: data.availability ?? 'available',
    price: data.price ?? null,
    priceLabel: data.priceLabel ?? '',
    stock: data.stock ?? UNLIMITED,
    images: data.images ?? [],
    tags: data.tags ?? [],
    fields: data.fields ?? {},
    options: data.options ?? [],
  };
  const refused = await guard(EVENTS.productBeforeCreate, { draft, userId: data.userId ?? '', actor: owner });
  if(refused) return [refused, null];

  const type = String(draft.type ?? '').trim();
  try {
    if(!(await typeExists(type))) return [{ code: 400, msg: `There is no product type "${type}"` }, null];
  } catch {
    return [{ code: 500, msg: 'Failed to create product' }, null];
  }

  if(draft.name === undefined) return [{ code: 400, msg: 'Name is required' }, null];
  const [invalid, values] = await validate(draft, { type, partial: false });
  if(invalid) return [invalid, null];

  const explicitSlug = String(draft.slug ?? '').trim() !== '';
  const [slugError, baseSlug] = normalizeSlug(draft.slug, values.name);
  if(slugError) return [slugError, null];

  const { options = [], fields = {}, ...columns } = values;
  const now = new Date();
  for(let attempt = 1; attempt <= 50; attempt++){
    const slug = explicitSlug ? baseSlug : withSuffix(baseSlug, attempt);
    try {
      const created = await db.transaction(async tx => {
        const [row] = await tx.insert(kempoProduct).values({
          id: newId(), slug, type, ...columns, data: withoutNulls(fields), owner,
          created: now, updated: now, publishedAt: columns.status === 'published' ? now : null,
        }).returning();
        await insertOptions(tx, row.id, options);
        return row;
      });
      const product = shape(created, options);
      await notify(EVENTS.productCreated, { product, userId: data.userId ?? '', actor: owner });
      return [null, product];
    } catch(error) {
      if(!isUniqueViolation(error)) return [{ code: 500, msg: 'Failed to create product' }, null];
      if(explicitSlug) return [{ code: 409, msg: 'A product with that slug already exists' }, null];
    }
  }
  return [{ code: 409, msg: 'No free slug could be found. Enter one' }, null];
};

/*
  Updates only what is supplied. `fields` is merged, and an empty value clears one. The slug, name
  and type of an owned product need its `owner`. A product an extension manages (`managedBy`)
  keeps its stock and option availability: people and other extensions cannot change them.
*/
export const updateProduct = async (id, data = {}, { owner = '' } = {}) => {
  const [lookupError, existing] = await getProduct(id);
  if(lookupError) return [lookupError, null];

  const changes = {};
  for(const property of ['name', 'slug', 'type', 'description', 'status', 'availability', 'price', 'priceLabel', 'stock', 'images', 'tags', 'options']){
    if(data[property] !== undefined) changes[property] = data[property];
  }
  if(data.fields !== undefined) changes.fields = { ...data.fields };

  const refused = await guard(EVENTS.productBeforeUpdate, { product: existing, changes, userId: data.userId ?? '', actor: owner });
  if(refused) return [refused, null];

  const locked = lockedProductChanges(existing, changes, owner);
  if(locked.length) return [{ code: 403, msg: `${locked.join(', ')} can only be changed by ${ownerLabel(existing.owner)}` }, null];

  if(changes.stock !== undefined && stockLocked(existing, owner)){
    const [stockError, stock] = normalizeStock(changes.stock);
    if(stockError || stock !== existing.stock){
      return [{ code: 403, msg: `Stock is maintained by the "${existing.managedBy}" extension` }, null];
    }
    delete changes.stock;
  }

  const type = changes.type !== undefined ? String(changes.type).trim() : existing.type;
  try {
    if(changes.type !== undefined && !(await typeExists(type))) return [{ code: 400, msg: `There is no product type "${type}"` }, null];
  } catch {
    return [{ code: 500, msg: 'Failed to update product' }, null];
  }

  const [invalid, values] = await validate(changes, { type, partial: true });
  if(invalid) return [invalid, null];

  const updates = {};
  for(const property of ['name', 'description', 'status', 'availability', 'price', 'priceLabel', 'stock', 'images', 'tags']){
    if(values[property] !== undefined) updates[property] = values[property];
  }
  if(changes.type !== undefined) updates.type = type;
  if(changes.slug !== undefined){
    const [slugError, slug] = normalizeSlug(changes.slug, values.name ?? existing.name);
    if(slugError) return [slugError, null];
    updates.slug = slug;
  }
  if(values.fields !== undefined){
    updates.data = withoutNulls({ ...existing.fields, ...values.fields });
    for(const [key, value] of Object.entries(values.fields)) if(value === null) delete updates.data[key];
  }

  let options = null;
  if(values.options !== undefined){
    options = values.options;
    if(existing.managedBy && existing.managedBy !== owner){
      /* The managing extension decides which choices are in stock, so a person's edit keeps its flags. */
      const flags = new Map(existing.options.flatMap(option => option.choices.map(choice => [`${option.key}/${choice.key}`, choice.available])));
      options = options.map(option => ({ ...option, choices: option.choices.map(choice => ({ ...choice, available: flags.get(`${option.key}/${choice.key}`) ?? choice.available })) }));
    }
  }

  if(!Object.keys(updates).length && !options) return [{ code: 400, msg: 'No changes provided' }, null];
  updates.updated = new Date();
  if(updates.status === 'published' && !existing.publishedAt) updates.publishedAt = updates.updated;

  try {
    const row = await db.transaction(async tx => {
      const [updated] = await tx.update(kempoProduct).set(updates).where(eq(kempoProduct.id, existing.id)).returning();
      if(options){
        await tx.delete(kempoProductOption).where(eq(kempoProductOption.productId, existing.id));
        await insertOptions(tx, existing.id, options);
      }
      return updated;
    });
    const product = shape(row, options ?? existing.options);
    await notify(EVENTS.productUpdated, { product, previous: existing, userId: data.userId ?? '', actor: owner });
    if(product.stock !== existing.stock){
      await notify(EVENTS.productStockChanged, { product, previousStock: existing.stock, stock: product.stock, reason: 'edited', actor: owner });
    }
    return [null, product];
  } catch(error) {
    if(isUniqueViolation(error)) return [{ code: 409, msg: 'A product with that slug already exists' }, null];
    return [{ code: 500, msg: 'Failed to update product' }, null];
  }
};

export const deleteProduct = async (id, { owner = '', userId = '' } = {}) => {
  const [lookupError, existing] = await getProduct(id);
  if(lookupError) return [lookupError, null];
  if(existing.owner !== owner) return [notYours('product', existing, owner), null];

  const refused = await guard(EVENTS.productBeforeDelete, { product: existing, userId, actor: owner });
  if(refused) return [refused, null];

  try {
    await db.transaction(async tx => {
      await tx.delete(kempoProductOption).where(eq(kempoProductOption.productId, existing.id));
      await tx.delete(kempoProduct).where(eq(kempoProduct.id, existing.id));
    });
    await notify(EVENTS.productDeleted, { product: existing, userId, actor: owner });
    return [null, { success: true }];
  } catch {
    return [{ code: 500, msg: 'Failed to delete product' }, null];
  }
};

/*
  For an extension's uninstall.js: deletes every product it owns, or with `release` hands them back
  to the people who manage the catalog, which is the right choice for products that are for sale.
*/
export const unregisterProducts = async (owner, { release = false } = {}) => {
  if(!owner) return [{ code: 400, msg: 'An owner (your extension name) is required' }, null];
  try {
    if(release){
      const rows = await db.update(kempoProduct).set({ owner: '' }).where(eq(kempoProduct.owner, owner)).returning({ id: kempoProduct.id });
      return [null, { released: rows.length }];
    }
    const rows = await db.select({ id: kempoProduct.id }).from(kempoProduct).where(eq(kempoProduct.owner, owner));
    for(const { id } of rows){
      const [error] = await deleteProduct(id, { owner });
      if(error) return [error, null];
    }
    return [null, { removed: rows.length }];
  } catch {
    return [{ code: 500, msg: 'Failed to remove the products' }, null];
  }
};

/*
  Stock. `actor` is the extension making the change ('' = a person). A product another extension
  manages (`managedBy`) can only have its stock changed by that extension.
*/
const refuseIfManaged = (product, actor) => stockLocked(product, actor)
  ? [{ code: 403, msg: `Stock is maintained by the "${product.managedBy}" extension` }, null]
  : null;

export const setStock = async (id, stock, { actor = '', reason = 'set' } = {}) => {
  const [lookupError, existing] = await getProduct(id);
  if(lookupError) return [lookupError, null];
  const managed = refuseIfManaged(existing, actor);
  if(managed) return managed;
  const [stockError, value] = normalizeStock(stock);
  if(stockError) return [stockError, null];
  if(value === existing.stock) return [null, existing];

  try {
    const [row] = await db.update(kempoProduct).set({ stock: value, updated: new Date() }).where(eq(kempoProduct.id, existing.id)).returning();
    const product = shape(row, existing.options);
    await notify(EVENTS.productStockChanged, { product, previousStock: existing.stock, stock: value, reason, actor });
    return [null, product];
  } catch {
    return [{ code: 500, msg: 'Failed to change stock' }, null];
  }
};

/* Adds `delta` (negative to take) atomically. Unlimited stock stays unlimited; stock never goes below zero. */
export const adjustStock = async (id, delta, { actor = '', reason = 'adjusted' } = {}) => {
  const change = Number(delta);
  if(!Number.isInteger(change) || change === 0) return [{ code: 400, msg: 'delta must be a non-zero whole number' }, null];
  const [lookupError, existing] = await getProduct(id);
  if(lookupError) return [lookupError, null];
  const managed = refuseIfManaged(existing, actor);
  if(managed) return managed;
  if(existing.stock === UNLIMITED) return [null, existing];

  try {
    const [row] = await db.update(kempoProduct)
      .set({ stock: sql`${kempoProduct.stock} + ${change}`, updated: new Date() })
      .where(and(eq(kempoProduct.id, existing.id), sql`${kempoProduct.stock} <> ${UNLIMITED}`, sql`${kempoProduct.stock} + ${change} >= 0`))
      .returning();
    if(!row) return [{ code: 409, msg: 'Insufficient stock' }, null];
    const product = shape(row, existing.options);
    await notify(EVENTS.productStockChanged, { product, previousStock: row.stock - change, stock: row.stock, reason, actor });
    return [null, product];
  } catch {
    return [{ code: 500, msg: 'Failed to change stock' }, null];
  }
};

/*
  Declares that an extension keeps this product's stock and option availability in step with
  something else. People then see them read-only. Pass '' to hand them back to people.
*/
export const setManagedBy = async (id, extension) => {
  const [lookupError, existing] = await getProduct(id);
  if(lookupError) return [lookupError, null];
  const name = String(extension ?? '').trim();
  if(existing.managedBy && name && existing.managedBy !== name){
    return [{ code: 409, msg: `This product is already maintained by the "${existing.managedBy}" extension` }, null];
  }
  if(name === existing.managedBy) return [null, existing];
  try {
    const [row] = await db.update(kempoProduct).set({ managedBy: name, updated: new Date() }).where(eq(kempoProduct.id, existing.id)).returning();
    return [null, shape(row, existing.options)];
  } catch {
    return [{ code: 500, msg: 'Failed to update the product' }, null];
  }
};

/* Marks one choice of one option in or out of stock, e.g. a paint colour. */
export const setChoiceAvailability = async (id, optionKey, choiceKey, available, { actor = '' } = {}) => {
  const [lookupError, existing] = await getProduct(id);
  if(lookupError) return [lookupError, null];
  const managed = refuseIfManaged(existing, actor);
  if(managed) return managed;
  const option = existing.options.find(candidate => candidate.key === optionKey);
  const choice = option?.choices.find(candidate => candidate.key === choiceKey);
  if(!choice) return [{ code: 404, msg: 'That option choice does not exist' }, null];
  if(choice.available === Boolean(available)) return [null, existing];

  const choices = option.choices.map(candidate => candidate.key === choiceKey ? { ...candidate, available: Boolean(available) } : candidate);
  try {
    await db.update(kempoProductOption).set({ choices }).where(and(eq(kempoProductOption.productId, existing.id), eq(kempoProductOption.key, optionKey)));
    return getProduct(existing.id);
  } catch {
    return [{ code: 500, msg: 'Failed to update the option' }, null];
  }
};

/*
  The unit price for a product with the buyer's selections ({ optionKey: choiceKey }), computed
  here so no caller ever has to trust a price from a browser.
*/
export const getPrice = async (id, selections = {}) => {
  const [error, product] = await getProduct(id);
  if(error) return [error, null];
  const [priceError, result] = computePrice(product, product.options, selections);
  if(priceError) return [priceError, null];
  return [null, { ...result, currency: await getCurrency(), productId: product.id }];
};
