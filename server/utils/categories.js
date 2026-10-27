import db from 'kempo/server/db/index.js';
import { eq, asc, sql } from 'drizzle-orm';
import crypto from 'crypto';
import { kempoProduct, kempoProductCategory } from '../db/schema.js';
import { slugify } from './slug.js';
import { EVENTS, notify } from './hooks.js';

/*
  Categories group products for browsing ("Model cars", "Paint"). A product is of one type and can be in
  any number of categories; it lists their keys in its `categories`. A key is used in addresses
  (/products/?category=model-cars), so it is made from the name and never changes.
*/

const newId = () => crypto.randomBytes(8).toString('hex');

const isUniqueViolation = error => (error?.code || error?.cause?.code) === '23505';

export const MAX_NAME = 100;
export const MAX_DESCRIPTION = 500;
export const MAX_KEY = 60;
export const MAX_CATEGORIES_PER_PRODUCT = 50;

export const CATEGORY_KEY_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export const categoryKeyFromName = name => slugify(name).slice(0, MAX_KEY).replace(/-+$/g, '');

/* The keys of every category there is, to check a product's categories against. */
export const categoryKeys = async () => new Set((await db.select({ key: kempoProductCategory.key }).from(kempoProductCategory)).map(row => row.key));

/*
  Every category in order, each with how many products are in it: `count` of the published ones (what a
  visitor can find) and `total` of all of them (what the admin sees).
*/
export const getCategories = async () => {
  try {
    const rows = await db.select().from(kempoProductCategory).orderBy(asc(kempoProductCategory.position), asc(kempoProductCategory.name));
    const products = await db.select({ categories: kempoProduct.categories, status: kempoProduct.status }).from(kempoProduct);
    const counts = new Map();
    for(const product of products){
      for(const key of new Set(product.categories ?? [])){
        const entry = counts.get(key) ?? { count: 0, total: 0 };
        entry.total++;
        if(product.status === 'published') entry.count++;
        counts.set(key, entry);
      }
    }
    return [null, rows.map(row => ({ ...row, count: counts.get(row.key)?.count ?? 0, total: counts.get(row.key)?.total ?? 0 }))];
  } catch {
    return [{ code: 500, msg: 'Failed to retrieve categories' }, null];
  }
};

export const getCategory = async key => {
  if(!key) return [{ code: 400, msg: 'Category key is required' }, null];
  try {
    const [category] = await db.select().from(kempoProductCategory).where(eq(kempoProductCategory.key, key));
    return category ? [null, category] : [{ code: 404, msg: 'Category not found' }, null];
  } catch {
    return [{ code: 500, msg: 'Failed to retrieve category' }, null];
  }
};

export const normalizeCategory = (input = {}) => {
  const name = String(input.name ?? '').trim();
  if(!name) return [{ code: 400, msg: 'Category name is required' }, null];
  if(name.length > MAX_NAME) return [{ code: 400, msg: `Category name must be ${MAX_NAME} characters or fewer` }, null];
  const key = String(input.key ?? '').trim() || categoryKeyFromName(name);
  if(!key || key.length > MAX_KEY || !CATEGORY_KEY_PATTERN.test(key)) return [{ code: 400, msg: `Category key must use only lowercase letters, numbers and dashes (max ${MAX_KEY}). Give the category a name with some letters or numbers in it` }, null];
  const description = String(input.description ?? '').trim();
  if(description.length > MAX_DESCRIPTION) return [{ code: 400, msg: `Description must be ${MAX_DESCRIPTION} characters or fewer` }, null];
  return [null, { key, name, description, position: Number.isInteger(input.position) ? input.position : 0 }];
};

export const createCategory = async (definition, { actor = '' } = {}) => {
  const [invalid, normalized] = normalizeCategory(definition);
  if(invalid) return [invalid, null];

  try {
    const [category] = await db.insert(kempoProductCategory).values({ id: newId(), ...normalized, created: new Date() }).returning();
    await notify(EVENTS.categoryCreated, { category, actor });
    return [null, category];
  } catch(error) {
    if(isUniqueViolation(error)) return [{ code: 409, msg: `A category with the key "${normalized.key}" already exists` }, null];
    return [{ code: 500, msg: 'Failed to create category' }, null];
  }
};

/* The key never changes: it is in addresses people have bookmarked and in every product's list. */
export const updateCategory = async (key, changes = {}, { actor = '' } = {}) => {
  const [lookupError, existing] = await getCategory(key);
  if(lookupError) return [lookupError, null];

  const rejected = Object.keys(changes).filter(property => changes[property] !== undefined && !['name', 'description', 'position'].includes(property));
  if(rejected.length) return [{ code: 400, msg: `${rejected.join(', ')} cannot be changed` }, null];

  const [invalid, normalized] = normalizeCategory({ ...existing, ...changes, key: existing.key });
  if(invalid) return [invalid, null];

  const updates = {};
  for(const property of ['name', 'description', 'position']){
    if(changes[property] !== undefined && normalized[property] !== existing[property]) updates[property] = normalized[property];
  }
  if(!Object.keys(updates).length) return [{ code: 400, msg: 'No changes provided' }, null];

  try {
    const [category] = await db.update(kempoProductCategory).set(updates).where(eq(kempoProductCategory.key, key)).returning();
    await notify(EVENTS.categoryUpdated, { category, previous: existing, actor });
    return [null, category];
  } catch {
    return [{ code: 500, msg: 'Failed to update category' }, null];
  }
};

/*
  Deleting a category takes it off every product in it, and the products stay. Returns how many it was
  taken off, so a person can be told.
*/
export const deleteCategory = async (key, { actor = '' } = {}) => {
  const [lookupError, existing] = await getCategory(key);
  if(lookupError) return [lookupError, null];

  try {
    const inCategory = sql`${kempoProduct.categories} @> ${JSON.stringify([key])}::jsonb`;
    const affected = await db.update(kempoProduct).set({ categories: sql`${kempoProduct.categories} - ${key}::text` }).where(inCategory).returning({ id: kempoProduct.id });
    await db.delete(kempoProductCategory).where(eq(kempoProductCategory.key, key));
    await notify(EVENTS.categoryDeleted, { category: existing, products: affected.map(row => row.id), actor });
    return [null, { success: true, removedFrom: affected.length }];
  } catch {
    return [{ code: 500, msg: 'Failed to delete category' }, null];
  }
};
