import db from 'kempo/server/db/index.js';
import { eq, and, asc, sql } from 'drizzle-orm';
import crypto from 'crypto';
import { kempoProductField, kempoProduct, kempoProductType } from '../db/schema.js';
import { normalizeFieldDefinition, OPTIONAL_TYPES, canConvert } from './fieldTypes.js';
import { mediaAvailable } from './media.js';
import { EVENTS, guard, notify } from './hooks.js';

const newId = () => crypto.randomBytes(8).toString('hex');

const isUniqueViolation = error => (error?.code || error?.cause?.code) === '23505';

/*
  What the owner of a field may change, and what anyone else (the admin UI) may adjust on a field an
  extension owns. The key and ownership never change after creation, and the data type only changes
  where nothing can be lost (see CONVERSIONS in fieldTypes.js).
*/
const OWNER_EDITABLE = ['label', 'description', 'required', 'listed', 'filterable', 'options', 'position', 'type'];
const ANYONE_EDITABLE = ['label', 'description', 'listed', 'filterable', 'position'];

/*
  Every field, each with the `productType` key it is scoped to ('' = every product). Pass
  `productType` to get only what a product of that type shows: the default fields plus that type's.
*/
export const getFields = async ({ productType, owner } = {}) => {
  try {
    const rows = await db.select().from(kempoProductField)
      .orderBy(asc(kempoProductField.position), asc(kempoProductField.created), asc(kempoProductField.id));
    const types = await db.select({ key: kempoProductType.key, name: kempoProductType.name }).from(kempoProductType);
    const names = new Map(types.map(type => [type.key, type.name]));
    let fields = rows.map(field => ({ ...field, productTypeName: field.productType ? names.get(field.productType) ?? field.productType : '' }));
    if(productType !== undefined) fields = fields.filter(field => !field.productType || field.productType === String(productType ?? ''));
    if(owner !== undefined) fields = fields.filter(field => field.owner === String(owner ?? ''));
    return [null, fields];
  } catch {
    return [{ code: 500, msg: 'Failed to retrieve fields' }, null];
  }
};

/* A field is identified by its key and the type it belongs to ('' for the default scope). */
export const getField = async (key, productType = '') => {
  if(!key) return [{ code: 400, msg: 'Field key is required' }, null];
  try {
    const [field] = await db.select().from(kempoProductField)
      .where(and(eq(kempoProductField.key, key), eq(kempoProductField.productType, productType)));
    return field ? [null, field] : [{ code: 404, msg: 'Field not found' }, null];
  } catch {
    return [{ code: 500, msg: 'Failed to retrieve field' }, null];
  }
};

/* The products a field's values live on: everything for a default field, otherwise that type's products. */
const productsInScope = productType => productType ? eq(kempoProduct.type, productType) : sql`true`;

export const createField = async (definition, { owner = '' } = {}) => {
  const [invalid, normalized] = normalizeFieldDefinition(definition);
  if(invalid) return [invalid, null];

  const scope = String(definition?.productType ?? '').trim();
  const refused = await guard(EVENTS.fieldBeforeCreate, { draft: { ...normalized, productType: scope }, actor: owner });
  if(refused) return [refused, null];

  if(normalized.type === 'media' && !(await mediaAvailable())){
    return [{ code: 409, msg: `Media fields need the ${OPTIONAL_TYPES.media} extension, which is not installed` }, null];
  }

  try {
    if(scope){
      const [type] = await db.select({ key: kempoProductType.key }).from(kempoProductType).where(eq(kempoProductType.key, scope));
      if(!type) return [{ code: 400, msg: `There is no product type "${scope}"` }, null];
    }
    /* Products hold the default fields and their type's under one set of names, so a key cannot be reused where it would collide. */
    const clash = await db.select({ productType: kempoProductField.productType }).from(kempoProductField).where(and(
      eq(kempoProductField.key, normalized.key),
      scope ? sql`${kempoProductField.productType} in ('', ${scope})` : sql`true`,
    ));
    if(clash.length){
      const where = clash[0].productType === scope ? (scope ? 'this type' : 'the default fields') : (scope ? 'the default fields' : 'a type');
      return [{ code: 409, msg: `A field with the key "${normalized.key}" already exists in ${where}` }, null];
    }
    const [field] = await db.insert(kempoProductField)
      .values({ id: newId(), ...normalized, productType: scope, owner, created: new Date() }).returning();
    await notify(EVENTS.fieldCreated, { field, actor: owner });
    return [null, field];
  } catch(error) {
    if(isUniqueViolation(error)) return [{ code: 409, msg: `A field with the key "${normalized.key}" already exists` }, null];
    return [{ code: 500, msg: 'Failed to create field' }, null];
  }
};

export const updateField = async (key, changes = {}, { owner = null, productType = '' } = {}) => {
  const [lookupError, existing] = await getField(key, productType);
  if(lookupError) return [lookupError, null];

  const targetType = changes.type ?? existing.type;
  if(!canConvert(existing.type, targetType)){
    return [{ code: 409, msg: `A ${existing.type} field cannot be changed to ${targetType}. Delete it and create a new one instead` }, null];
  }
  const isOwner = existing.owner === (owner ?? '');
  const allowed = isOwner ? OWNER_EDITABLE : ANYONE_EDITABLE;
  const rejected = Object.keys(changes).filter(property => changes[property] !== undefined && property !== 'key' && property !== 'productType'
    && !(property === 'type' && targetType === existing.type) && !allowed.includes(property));
  if(rejected.length){
    return [{ code: 403, msg: `${rejected.join(', ')} can only be changed by ${existing.owner ? `the "${existing.owner}" extension` : 'the field\'s owner'}` }, null];
  }

  const [invalid, normalized] = normalizeFieldDefinition({ ...existing, ...changes, key: existing.key, type: targetType });
  if(invalid) return [invalid, null];

  const updates = {};
  for(const property of allowed){
    if(changes[property] !== undefined) updates[property] = normalized[property];
  }
  if(targetType !== existing.type){
    updates.type = targetType;
    updates.options = normalized.options;
  }
  if(!Object.keys(updates).length) return [{ code: 400, msg: 'No changes provided' }, null];

  const refused = await guard(EVENTS.fieldBeforeUpdate, { field: existing, changes: updates, actor: owner ?? '' });
  if(refused) return [refused, null];

  try {
    const [field] = await db.update(kempoProductField).set(updates)
      .where(and(eq(kempoProductField.key, key), eq(kempoProductField.productType, existing.productType))).returning();
    await notify(EVENTS.fieldUpdated, { field, previous: existing, actor: owner ?? '' });
    return [null, field];
  } catch {
    return [{ code: 500, msg: 'Failed to update field' }, null];
  }
};

/* Deletes a field and the values products hold for it. A person deletes their own fields (owner ''); an extension, the ones it registered. */
export const deleteField = async (key, { owner = '', productType = '' } = {}) => {
  const [lookupError, existing] = await getField(key, productType);
  if(lookupError) return [lookupError, null];
  if(existing.owner !== owner){
    return [{ code: 403, msg: `This field is managed by the "${existing.owner}" extension and cannot be deleted here` }, null];
  }
  const refused = await guard(EVENTS.fieldBeforeDelete, { field: existing, actor: owner });
  if(refused) return [refused, null];

  try {
    await db.transaction(async tx => {
      await tx.update(kempoProduct).set({ data: sql`${kempoProduct.data} - ${key}::text` }).where(productsInScope(existing.productType));
      await tx.delete(kempoProductField).where(and(eq(kempoProductField.key, key), eq(kempoProductField.productType, existing.productType)));
    });
    await notify(EVENTS.fieldDeleted, { field: existing, actor: owner });
    return [null, { success: true }];
  } catch {
    return [{ code: 500, msg: 'Failed to delete field' }, null];
  }
};

/*
  Idempotent: safe to call from an extension's install.js and again on every update. Creates the
  field if it is new, otherwise refreshes what the owner may change. Refuses to take over a key
  another owner holds, or to change an existing field's data type.
*/
export const registerField = async (owner, definition) => {
  if(!owner) return [{ code: 400, msg: 'An owner (your extension name) is required' }, null];
  const [invalid, normalized] = normalizeFieldDefinition(definition);
  if(invalid) return [invalid, null];

  const productType = String(definition?.productType ?? '').trim();
  const [lookupError, existing] = await getField(normalized.key, productType);
  if(lookupError && lookupError.code !== 404) return [lookupError, null];
  if(!existing) return createField({ ...normalized, productType }, { owner });

  if(existing.owner !== owner){
    return [{ code: 409, msg: `The key "${normalized.key}" is already used by ${existing.owner ? `the "${existing.owner}" extension` : 'a user-defined field'}` }, null];
  }
  if(existing.type !== normalized.type){
    return [{ code: 409, msg: `"${normalized.key}" already exists as a ${existing.type} field` }, null];
  }
  const { key, type, ...changes } = normalized;
  return updateField(normalized.key, changes, { owner, productType });
};

export const registerFields = async (owner, definitions = []) => {
  const registered = [];
  for(const definition of definitions){
    const [error, field] = await registerField(owner, definition);
    if(error) return [error, registered];
    registered.push(field);
  }
  return [null, registered];
};

/* For an extension's uninstall.js: removes every field it registered, and their values. */
export const unregisterFields = async owner => {
  if(!owner) return [{ code: 400, msg: 'An owner (your extension name) is required' }, null];
  const [error, fields] = await getFields();
  if(error) return [error, null];
  let removed = 0;
  for(const field of fields.filter(candidate => candidate.owner === owner)){
    const [deleteError] = await deleteField(field.key, { owner, productType: field.productType });
    if(deleteError) return [deleteError, null];
    removed++;
  }
  return [null, { removed }];
};
