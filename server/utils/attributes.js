import db from 'kempo/server/db/index.js';
import { eq, asc, sql } from 'drizzle-orm';
import crypto from 'crypto';
import { kempoProductAttribute, kempoProduct } from '../db/schema.js';
import { normalizeAttributeDefinition, OPTIONAL_TYPES, canConvert } from './attributeTypes.js';
import { mediaAvailable } from './media.js';
import { EVENTS, guard, notify } from './hooks.js';

const newId = () => crypto.randomBytes(8).toString('hex');

const isUniqueViolation = error => (error?.code || error?.cause?.code) === '23505';

/*
  What the owner of an attribute may change, and what anyone else (the admin UI) may adjust on an attribute an
  extension owns. The key and ownership never change after creation, and the data type only changes
  where nothing can be lost (see CONVERSIONS in attributeTypes.js).
*/
const OWNER_EDITABLE = ['label', 'description', 'required', 'listed', 'tab', 'filterable', 'options', 'position', 'type'];
const ANYONE_EDITABLE = ['label', 'description', 'listed', 'filterable', 'position'];

/* Every attribute, or only the ones an extension owns. */
export const getAttributes = async ({ owner } = {}) => {
  try {
    let attributes = await db.select().from(kempoProductAttribute)
      .orderBy(asc(kempoProductAttribute.position), asc(kempoProductAttribute.created), asc(kempoProductAttribute.id));
    if(owner !== undefined) attributes = attributes.filter(attribute => attribute.owner === String(owner ?? ''));
    return [null, attributes];
  } catch {
    return [{ code: 500, msg: 'Failed to retrieve attributes' }, null];
  }
};

export const getAttribute = async key => {
  if(!key) return [{ code: 400, msg: 'Attribute key is required' }, null];
  try {
    const [attribute] = await db.select().from(kempoProductAttribute).where(eq(kempoProductAttribute.key, key));
    return attribute ? [null, attribute] : [{ code: 404, msg: 'Attribute not found' }, null];
  } catch {
    return [{ code: 500, msg: 'Failed to retrieve attribute' }, null];
  }
};

export const createAttribute = async (definition, { owner = '' } = {}) => {
  const [invalid, normalized] = normalizeAttributeDefinition(definition);
  if(invalid) return [invalid, null];

  const refused = await guard(EVENTS.attributeBeforeCreate, { draft: normalized, actor: owner });
  if(refused) return [refused, null];

  if(normalized.type === 'media' && !(await mediaAvailable())){
    return [{ code: 409, msg: `Media attributes need the ${OPTIONAL_TYPES.media} extension, which is not installed` }, null];
  }

  try {
    const [attribute] = await db.insert(kempoProductAttribute)
      .values({ id: newId(), ...normalized, owner, created: new Date() }).returning();
    await notify(EVENTS.attributeCreated, { attribute, actor: owner });
    return [null, attribute];
  } catch(error) {
    if(isUniqueViolation(error)) return [{ code: 409, msg: `An attribute with the key "${normalized.key}" already exists` }, null];
    return [{ code: 500, msg: 'Failed to create attribute' }, null];
  }
};

export const updateAttribute = async (key, changes = {}, { owner = null } = {}) => {
  const [lookupError, existing] = await getAttribute(key);
  if(lookupError) return [lookupError, null];

  const targetType = changes.type ?? existing.type;
  if(!canConvert(existing.type, targetType)){
    return [{ code: 409, msg: `A ${existing.type} attribute cannot be changed to ${targetType}. Delete it and create a new one instead` }, null];
  }
  const isOwner = existing.owner === (owner ?? '');
  const allowed = isOwner ? OWNER_EDITABLE : ANYONE_EDITABLE;
  const rejected = Object.keys(changes).filter(property => changes[property] !== undefined && property !== 'key'
    && !(property === 'type' && targetType === existing.type) && !allowed.includes(property));
  if(rejected.length){
    return [{ code: 403, msg: `${rejected.join(', ')} can only be changed by ${existing.owner ? `the "${existing.owner}" extension` : 'the attribute\'s owner'}` }, null];
  }

  const [invalid, normalized] = normalizeAttributeDefinition({ ...existing, ...changes, key: existing.key, type: targetType });
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

  const refused = await guard(EVENTS.attributeBeforeUpdate, { attribute: existing, changes: updates, actor: owner ?? '' });
  if(refused) return [refused, null];

  try {
    const [attribute] = await db.update(kempoProductAttribute).set(updates)
      .where(eq(kempoProductAttribute.key, key)).returning();
    await notify(EVENTS.attributeUpdated, { attribute, previous: existing, actor: owner ?? '' });
    return [null, attribute];
  } catch {
    return [{ code: 500, msg: 'Failed to update attribute' }, null];
  }
};

/* Deletes an attribute and the values products hold for it. A person deletes their own attributes (owner ''); an extension, the ones it registered. */
export const deleteAttribute = async (key, { owner = '' } = {}) => {
  const [lookupError, existing] = await getAttribute(key);
  if(lookupError) return [lookupError, null];
  if(existing.owner !== owner){
    return [{ code: 403, msg: `This attribute is managed by the "${existing.owner}" extension and cannot be deleted here` }, null];
  }
  const refused = await guard(EVENTS.attributeBeforeDelete, { attribute: existing, actor: owner });
  if(refused) return [refused, null];

  try {
    await db.transaction(async tx => {
      await tx.update(kempoProduct).set({ data: sql`${kempoProduct.data} - ${key}::text` });
      await tx.delete(kempoProductAttribute).where(eq(kempoProductAttribute.key, key));
    });
    await notify(EVENTS.attributeDeleted, { attribute: existing, actor: owner });
    return [null, { success: true }];
  } catch {
    return [{ code: 500, msg: 'Failed to delete attribute' }, null];
  }
};

/*
  Idempotent: safe to call from an extension's install.js and again on every update. Creates the
  attribute if it is new, otherwise refreshes what the owner may change. Refuses to take over a key
  another owner holds, or to change an existing attribute's data type.
*/
export const registerAttribute = async (owner, definition) => {
  if(!owner) return [{ code: 400, msg: 'An owner (your extension name) is required' }, null];
  const [invalid, normalized] = normalizeAttributeDefinition(definition);
  if(invalid) return [invalid, null];

  const [lookupError, existing] = await getAttribute(normalized.key);
  if(lookupError && lookupError.code !== 404) return [lookupError, null];
  if(!existing) return createAttribute(normalized, { owner });

  if(existing.owner !== owner){
    return [{ code: 409, msg: `The key "${normalized.key}" is already used by ${existing.owner ? `the "${existing.owner}" extension` : 'a user-defined attribute'}` }, null];
  }
  if(existing.type !== normalized.type && !canConvert(existing.type, normalized.type)){
    return [{ code: 409, msg: `"${normalized.key}" already exists as a ${existing.type} attribute` }, null];
  }
  const { key, ...changes } = normalized;
  return updateAttribute(normalized.key, changes, { owner });
};

export const registerAttributes = async (owner, definitions = []) => {
  const registered = [];
  for(const definition of definitions){
    const [error, attribute] = await registerAttribute(owner, definition);
    if(error) return [error, registered];
    registered.push(attribute);
  }
  return [null, registered];
};

/* For an extension's uninstall.js: removes every attribute it registered, and their values. */
export const unregisterAttributes = async owner => {
  if(!owner) return [{ code: 400, msg: 'An owner (your extension name) is required' }, null];
  const [error, attributes] = await getAttributes();
  if(error) return [error, null];
  let removed = 0;
  for(const attribute of attributes.filter(candidate => candidate.owner === owner)){
    const [deleteError] = await deleteAttribute(attribute.key, { owner });
    if(deleteError) return [deleteError, null];
    removed++;
  }
  return [null, { removed }];
};
