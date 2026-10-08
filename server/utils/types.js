import db from 'kempo/server/db/index.js';
import { eq, asc, sql } from 'drizzle-orm';
import crypto from 'crypto';
import { kempoProduct, kempoProductType, kempoProductField } from '../db/schema.js';
import { TYPE_KEY_PATTERN, typeKeyFromName } from './fieldTypes.js';
import { mayManage, notYours } from './ownership.js';
import { EVENTS, guard, notify } from './hooks.js';

const newId = () => crypto.randomBytes(8).toString('hex');

const isUniqueViolation = error => (error?.code || error?.cause?.code) === '23505';

const MAX_NAME = 100;
const MAX_DESCRIPTION = 500;

/* Types that anyone with the permission may change on a type an extension owns. */
const ANYONE_EDITABLE = ['description', 'position'];

export const getTypes = async ({ owner } = {}) => {
  try {
    const rows = await db.select().from(kempoProductType).orderBy(asc(kempoProductType.position), asc(kempoProductType.name));
    const counts = await db.select({ type: kempoProduct.type, count: sql`count(*)::int` }).from(kempoProduct).groupBy(kempoProduct.type);
    const byType = new Map(counts.map(row => [row.type, row.count]));
    const types = rows.map(row => ({ ...row, count: byType.get(row.key) ?? 0 }));
    return [null, owner === undefined ? types : types.filter(type => type.owner === String(owner ?? ''))];
  } catch {
    return [{ code: 500, msg: 'Failed to retrieve types' }, null];
  }
};

export const getType = async key => {
  if(!key) return [{ code: 400, msg: 'Type key is required' }, null];
  try {
    const [type] = await db.select().from(kempoProductType).where(eq(kempoProductType.key, key));
    return type ? [null, type] : [{ code: 404, msg: 'Type not found' }, null];
  } catch {
    return [{ code: 500, msg: 'Failed to retrieve type' }, null];
  }
};

const normalizeType = (input = {}) => {
  const name = String(input.name ?? '').trim();
  if(!name) return [{ code: 400, msg: 'Type name is required' }, null];
  if(name.length > MAX_NAME) return [{ code: 400, msg: `Type name must be ${MAX_NAME} characters or fewer` }, null];
  const key = String(input.key ?? '').trim() || typeKeyFromName(name);
  if(!TYPE_KEY_PATTERN.test(key)) return [{ code: 400, msg: 'Type key must start with a lowercase letter and use only lowercase letters, numbers and dashes (max 40)' }, null];
  const description = String(input.description ?? '').trim();
  if(description.length > MAX_DESCRIPTION) return [{ code: 400, msg: `Description must be ${MAX_DESCRIPTION} characters or fewer` }, null];
  return [null, { key, name, description, position: Number.isInteger(input.position) ? input.position : 0 }];
};

export const createType = async (definition, { owner = '' } = {}) => {
  const [invalid, normalized] = normalizeType(definition);
  if(invalid) return [invalid, null];

  const refused = await guard(EVENTS.typeBeforeCreate, { draft: normalized, actor: owner });
  if(refused) return [refused, null];

  try {
    const [type] = await db.insert(kempoProductType).values({ id: newId(), ...normalized, owner, created: new Date() }).returning();
    await notify(EVENTS.typeCreated, { type, actor: owner });
    return [null, type];
  } catch(error) {
    if(isUniqueViolation(error)) return [{ code: 409, msg: `A type with the key "${normalized.key}" already exists` }, null];
    return [{ code: 500, msg: 'Failed to create type' }, null];
  }
};

/*
  The key never changes. Renaming and everything else belongs to the owner; anyone may change a
  type's description and position.
*/
export const updateType = async (key, changes = {}, { owner = '' } = {}) => {
  const [lookupError, existing] = await getType(key);
  if(lookupError) return [lookupError, null];

  const rejected = Object.keys(changes).filter(property => changes[property] !== undefined && property !== 'key'
    && !ANYONE_EDITABLE.includes(property) && property !== 'name');
  if(rejected.length) return [{ code: 400, msg: `${rejected.join(', ')} cannot be changed` }, null];

  const [invalid, normalized] = normalizeType({ ...existing, ...changes, key: existing.key });
  if(invalid) return [invalid, null];

  const updates = {};
  if(changes.name !== undefined && normalized.name !== existing.name){
    if(!mayManage(existing, owner)) return [notYours('type', existing, owner), null];
    updates.name = normalized.name;
  }
  if(changes.description !== undefined) updates.description = normalized.description;
  if(changes.position !== undefined) updates.position = normalized.position;
  if(!Object.keys(updates).length) return [{ code: 400, msg: 'No changes provided' }, null];

  const refused = await guard(EVENTS.typeBeforeUpdate, { type: existing, changes: updates, actor: owner });
  if(refused) return [refused, null];

  try {
    const [type] = await db.update(kempoProductType).set(updates).where(eq(kempoProductType.key, key)).returning();
    await notify(EVENTS.typeUpdated, { type, previous: existing, actor: owner });
    return [null, type];
  } catch {
    return [{ code: 500, msg: 'Failed to update type' }, null];
  }
};

/* A type still used by products or holding fields cannot be deleted; the caller must move or remove those first. */
export const deleteType = async (key, { owner = '' } = {}) => {
  const [lookupError, existing] = await getType(key);
  if(lookupError) return [lookupError, null];
  if(!mayManage(existing, owner)) return [notYours('type', existing, owner), null];

  const refused = await guard(EVENTS.typeBeforeDelete, { type: existing, actor: owner });
  if(refused) return [refused, null];

  try {
    const [{ products }] = await db.select({ products: sql`count(*)::int` }).from(kempoProduct).where(eq(kempoProduct.type, key));
    if(products) return [{ code: 409, msg: `${products} product${products === 1 ? ' still uses' : 's still use'} this type` }, null];
    const [{ fields }] = await db.select({ fields: sql`count(*)::int` }).from(kempoProductField).where(eq(kempoProductField.productType, key));
    if(fields) return [{ code: 409, msg: `This type still has ${fields} field${fields === 1 ? '' : 's'}. Delete them first` }, null];
    await db.delete(kempoProductType).where(eq(kempoProductType.key, key));
    await notify(EVENTS.typeDeleted, { type: existing, actor: owner });
    return [null, { success: true }];
  } catch {
    return [{ code: 500, msg: 'Failed to delete type' }, null];
  }
};

/* Idempotent: safe to call from an extension's install.js and again on every update. */
export const registerType = async (owner, definition) => {
  if(!owner) return [{ code: 400, msg: 'An owner (your extension name) is required' }, null];
  const [invalid, normalized] = normalizeType(definition);
  if(invalid) return [invalid, null];

  const [lookupError, existing] = await getType(normalized.key);
  if(lookupError && lookupError.code !== 404) return [lookupError, null];
  if(!existing) return createType(normalized, { owner });
  if(existing.owner !== owner){
    return [{ code: 409, msg: `The type "${normalized.key}" is already used by ${existing.owner ? `the "${existing.owner}" extension` : 'a type created in the admin'}` }, null];
  }
  const { key, ...changes } = normalized;
  const differs = Object.keys(changes).some(property => changes[property] !== existing[property]);
  return differs ? updateType(key, changes, { owner }) : [null, existing];
};

/* For an extension's uninstall.js: removes every type it owns, once nothing uses them. */
export const unregisterTypes = async owner => {
  if(!owner) return [{ code: 400, msg: 'An owner (your extension name) is required' }, null];
  const [error, types] = await getTypes({ owner });
  if(error) return [error, null];
  let removed = 0;
  for(const type of types){
    const [deleteError] = await deleteType(type.key, { owner });
    if(deleteError) return [deleteError, null];
    removed++;
  }
  return [null, { removed }];
};
