import db from 'kempo/server/db/index.js';
import { eq, asc, sql } from 'drizzle-orm';
import crypto from 'crypto';
import { kempoProduct, kempoProductTemplate } from '../db/schema.js';
import { DASH_KEY_PATTERN, normalizeAttributeDefinition, coerceValues, applicableAttributes } from './attributeTypes.js';
import { getAttributes } from './attributes.js';
import { normalizeOptions, keyFromLabel } from './pricing.js';
import { getProductType } from './productTypes.js';
import { normalizeTags } from './tags.js';
import { categoryKeys } from './categories.js';
import { mayManage, notYours, ownerLabel } from './ownership.js';
import { EVENTS, guard, notify } from './hooks.js';

/*
  A product template: a starting point products are made from and keep inheriting from. It holds

    attributes    custom attributes of its own (a model car's "Scale"), which every product made from it has
    options   options every product made from it offers (a colour), whose choices a product can add to
    defaults  { attributeKey: value }: what a product shows for an attribute it leaves blank, for the template's own attributes
              and for the attributes every product has (so every model car can have the same weight and size)

  A product keeps a live link to its template: change the template and its products follow. A product can add to
  all three (more attributes, more options, more choices for a template option) but not take anything away.
*/
const newId = () => crypto.randomBytes(8).toString('hex');

const MAX_NAME = 100;
const MAX_DESCRIPTION = 500;
export const MAX_TEMPLATE_ATTRIBUTES = 30;

const blank = value => value === null || value === undefined || value === '';

/* What anyone with the permission may change on a template an extension owns. */
const ANYONE_EDITABLE = ['description', 'position', 'defaults', 'options', 'attributes', 'product'];

const MAX_PRICE_LABEL = 100;
const MAX_PRODUCT_DESCRIPTION = 50000;

export const getTemplates = async ({ owner } = {}) => {
  try {
    const rows = await db.select().from(kempoProductTemplate).orderBy(asc(kempoProductTemplate.position), asc(kempoProductTemplate.name));
    const counts = await db.select({ template: kempoProduct.template, count: sql`count(*)::int` }).from(kempoProduct).groupBy(kempoProduct.template);
    const byTemplate = new Map(counts.map(row => [row.template, row.count]));
    const templates = rows.map(row => ({ ...row, count: byTemplate.get(row.key) ?? 0 }));
    return [null, owner === undefined ? templates : templates.filter(template => template.owner === String(owner ?? ''))];
  } catch {
    return [{ code: 500, msg: 'Failed to retrieve templates' }, null];
  }
};

export const getTemplate = async key => {
  if(!key) return [{ code: 400, msg: 'Template key is required' }, null];
  try {
    const [template] = await db.select().from(kempoProductTemplate).where(eq(kempoProductTemplate.key, key));
    return template ? [null, template] : [{ code: 404, msg: 'Template not found' }, null];
  } catch {
    return [{ code: 500, msg: 'Failed to retrieve template' }, null];
  }
};

/*
  Checks what a template holds: its attributes (each a valid attribute, with keys that are its own and not any attribute every
  product has), its options, and its defaults against the attributes a product of it can have. Whatever is not
  supplied is left out. Returns [error, { attributes?, options?, defaults? }].
*/
/*
  What a product made from the template starts with: its product type, price, lowest price after discounts, the text
  shown when there is no price, its description, tags and categories. A product that sets one of these itself keeps its
  own; one that leaves it blank uses the template's. Blank values are left out. Returns [error, product].
*/
const checkProduct = async input => {
  if(input === null || typeof input !== 'object' || Array.isArray(input)) return [{ code: 400, msg: 'product must be an object' }, null];
  const product = {};
  if(!blank(input.productType)){
    const [error, type] = await getProductType(String(input.productType).trim());
    if(error) return [error, null];
    product.productType = type.key;
  }
  for(const [key, label] of [['price', 'Price'], ['minimumPrice', 'The lowest price after discounts']]){
    if(blank(input[key])) continue;
    const amount = Number(input[key]);
    if(!Number.isSafeInteger(amount) || amount < 0) return [{ code: 400, msg: `${label} must be a whole number of the smallest currency unit, or empty` }, null];
    product[key] = amount;
  }
  if(product.minimumPrice !== undefined && product.price !== undefined && product.minimumPrice > product.price){
    return [{ code: 400, msg: 'The minimum price cannot be above the price' }, null];
  }
  const priceLabel = String(input.priceLabel ?? '').trim();
  if(priceLabel.length > MAX_PRICE_LABEL) return [{ code: 400, msg: `The price label must be ${MAX_PRICE_LABEL} characters or fewer` }, null];
  if(priceLabel) product.priceLabel = priceLabel;
  const description = String(input.description ?? '');
  if(description.length > MAX_PRODUCT_DESCRIPTION) return [{ code: 400, msg: `The description must be ${MAX_PRODUCT_DESCRIPTION} characters or fewer` }, null];
  if(description.trim()) product.description = description;
  if(!blank(input.tags) && !(Array.isArray(input.tags) && !input.tags.length)){
    const [error, tags] = normalizeTags(input.tags);
    if(error) return [error, null];
    if(tags.length) product.tags = tags;
  }
  if(Array.isArray(input.categories) && input.categories.length){
    const keys = [...new Set(input.categories.map(key => String(key ?? '').trim().toLowerCase()).filter(Boolean))];
    const known = await categoryKeys();
    const unknown = keys.find(key => !known.has(key));
    if(unknown) return [{ code: 400, msg: `There is no category "${unknown}"` }, null];
    if(keys.length) product.categories = keys;
  }
  return [null, product];
};

const checkContents = async ({ attributes, options, defaults, product }, current = {}) => {
  const result = {};
  const [sharedError, shared] = await getAttributes();
  if(sharedError) return [sharedError, null];

  let templateAttributes = current.attributes ?? [];
  if(attributes !== undefined){
    if(!Array.isArray(attributes)) return [{ code: 400, msg: 'attributes must be a list' }, null];
    if(attributes.length > MAX_TEMPLATE_ATTRIBUTES) return [{ code: 400, msg: `A template can have at most ${MAX_TEMPLATE_ATTRIBUTES} attributes of its own` }, null];
    const taken = new Set(shared.map(attribute => attribute.key));
    templateAttributes = [];
    for(const [index, raw] of attributes.entries()){
      const [error, attribute] = normalizeAttributeDefinition({ ...raw, position: index });
      if(error) return [error, null];
      if(taken.has(attribute.key)) return [{ code: 409, msg: `An attribute with the key "${attribute.key}" already exists` }, null];
      taken.add(attribute.key);
      templateAttributes.push(attribute);
    }
    result.attributes = templateAttributes;
  }
  if(options !== undefined){
    const [error, normalized] = normalizeOptions(options);
    if(error) return [error, null];
    result.options = normalized;
  }
  if(product !== undefined){
    const [error, checked] = await checkProduct(product);
    if(error) return [error, null];
    result.product = checked;
  }
  if(defaults !== undefined){
    const known = applicableAttributes(shared, { attributes: templateAttributes }, []).map(attribute => ({ ...attribute, required: false }));
    const [error, values] = coerceValues(known, defaults ?? {}, { partial: true });
    if(error) return [error, null];
    result.defaults = Object.fromEntries(Object.entries(values).filter(([, value]) => !blank(value)));
  }
  return [null, result];
};

const normalizeTemplate = (input = {}) => {
  const name = String(input.name ?? '').trim();
  if(!name) return [{ code: 400, msg: 'Template name is required' }, null];
  if(name.length > MAX_NAME) return [{ code: 400, msg: `Template name must be ${MAX_NAME} characters or fewer` }, null];
  const key = String(input.key ?? '').trim() || keyFromLabel(name);
  if(!DASH_KEY_PATTERN.test(key)) return [{ code: 400, msg: 'Template key must start with a lowercase letter and use only lowercase letters, numbers and dashes (max 40)' }, null];
  const description = String(input.description ?? '').trim();
  if(description.length > MAX_DESCRIPTION) return [{ code: 400, msg: `Description must be ${MAX_DESCRIPTION} characters or fewer` }, null];
  const position = input.position === undefined ? 0 : Number(input.position);
  if(!Number.isInteger(position)) return [{ code: 400, msg: 'Position must be a whole number' }, null];
  return [null, { key, name, description, position }];
};

export const createTemplate = async (definition, { owner = '' } = {}) => {
  const [invalid, normalized] = normalizeTemplate(definition);
  if(invalid) return [invalid, null];
  const [contentsError, contents] = await checkContents(definition ?? {});
  if(contentsError) return [contentsError, null];

  const refused = await guard(EVENTS.templateBeforeCreate, { draft: { ...normalized, ...contents }, actor: owner });
  if(refused) return [refused, null];

  try {
    const [template] = await db.insert(kempoProductTemplate).values({ id: newId(), ...normalized, attributes: [], options: [], defaults: {}, product: {}, ...contents, owner, created: new Date() }).returning();
    await notify(EVENTS.templateCreated, { template, actor: owner });
    return [null, { ...template, count: 0 }];
  } catch(error) {
    if((error?.code || error?.cause?.code) === '23505') return [{ code: 409, msg: `A template with the key "${normalized.key}" already exists` }, null];
    return [{ code: 500, msg: 'Failed to create template' }, null];
  }
};

/*
  Renaming belongs to the owner when an extension made the template; its attributes, options, defaults and description
  can be changed by anyone with the permission, so a shipped template stays useful. The key never changes.
*/
export const updateTemplate = async (key, changes = {}, { owner = '' } = {}) => {
  const [lookupError, existing] = await getTemplate(key);
  if(lookupError) return [lookupError, null];

  const owned = Boolean(existing.owner);
  const isOwner = existing.owner === owner;
  const allowed = owned && !isOwner ? ANYONE_EDITABLE : [...ANYONE_EDITABLE, 'name'];
  const rejected = Object.keys(changes).filter(property => changes[property] !== undefined && !allowed.includes(property));
  if(rejected.length) return [{ code: 403, msg: `${rejected.join(', ')} can only be changed by ${ownerLabel(existing.owner)}` }, null];

  const [invalid, normalized] = normalizeTemplate({ ...existing, ...changes, key: existing.key });
  if(invalid) return [invalid, null];
  const [contentsError, contents] = await checkContents(changes, existing);
  if(contentsError) return [contentsError, null];

  const updates = { ...contents };
  if(changes.name !== undefined) updates.name = normalized.name;
  if(changes.description !== undefined) updates.description = normalized.description;
  if(changes.position !== undefined) updates.position = normalized.position;
  if(!Object.keys(updates).length) return [{ code: 400, msg: 'No changes provided' }, null];
  if(contents.attributes && changes.defaults === undefined){
    /* An attribute taken away takes its default with it, so a later attribute with the same key does not inherit a stale one. */
    const keys = new Set([...contents.attributes.map(attribute => attribute.key)]);
    const [, shared] = await getAttributes();
    for(const attribute of shared ?? []) keys.add(attribute.key);
    updates.defaults = Object.fromEntries(Object.entries(existing.defaults ?? {}).filter(([defaultKey]) => keys.has(defaultKey)));
  }

  const refused = await guard(EVENTS.templateBeforeUpdate, { template: existing, changes: updates, actor: owner });
  if(refused) return [refused, null];

  try {
    const [template] = await db.update(kempoProductTemplate).set(updates).where(eq(kempoProductTemplate.key, key)).returning();
    await notify(EVENTS.templateUpdated, { template, previous: existing, actor: owner });
    return [null, template];
  } catch {
    return [{ code: 500, msg: 'Failed to update template' }, null];
  }
};

/* A template that products are made from cannot be deleted: they would lose what it gave them. */
export const deleteTemplate = async (key, { owner = '' } = {}) => {
  const [lookupError, existing] = await getTemplate(key);
  if(lookupError) return [lookupError, null];
  if(!mayManage(existing, owner)) return [notYours('template', existing, owner), null];

  const refused = await guard(EVENTS.templateBeforeDelete, { template: existing, actor: owner });
  if(refused) return [refused, null];

  try {
    const [{ products }] = await db.select({ products: sql`count(*)::int` }).from(kempoProduct).where(eq(kempoProduct.template, key));
    if(products) return [{ code: 409, msg: `${products} product${products === 1 ? ' is' : 's are'} made from this template. Change ${products === 1 ? 'it' : 'them'} first` }, null];
    await db.delete(kempoProductTemplate).where(eq(kempoProductTemplate.key, key));
    await notify(EVENTS.templateDeleted, { template: existing, actor: owner });
    return [null, { success: true }];
  } catch {
    return [{ code: 500, msg: 'Failed to delete template' }, null];
  }
};

/* Idempotent: safe from an extension's install.js and again on every update. Refreshes only what the owner may change. */
export const registerTemplate = async (owner, definition) => {
  if(!owner) return [{ code: 400, msg: 'An owner (your extension name) is required' }, null];
  const [invalid, normalized] = normalizeTemplate(definition);
  if(invalid) return [invalid, null];
  const [lookupError, existing] = await getTemplate(normalized.key);
  if(lookupError && lookupError.code !== 404) return [lookupError, null];
  if(!existing) return createTemplate({ ...definition, ...normalized }, { owner });
  if(existing.owner !== owner){
    return [{ code: 409, msg: `The key "${normalized.key}" is already used by ${existing.owner ? `the "${existing.owner}" extension` : 'a template someone made'}` }, null];
  }
  const { key, ...changes } = { ...definition, ...normalized };
  return updateTemplate(normalized.key, changes, { owner });
};

/* For an extension's uninstall.js: removes every template it registered, unless products are made from one. */
export const unregisterTemplates = async owner => {
  if(!owner) return [{ code: 400, msg: 'An owner (your extension name) is required' }, null];
  const [error, templates] = await getTemplates({ owner });
  if(error) return [error, null];
  for(const template of templates){
    const [deleteError] = await deleteTemplate(template.key, { owner });
    if(deleteError) return [deleteError, null];
  }
  return [null, { removed: templates.length }];
};
