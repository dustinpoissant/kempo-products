import db from 'kempo/server/db/index.js';
import { eq, asc, sql } from 'drizzle-orm';
import crypto from 'crypto';
import { kempoProduct, kempoProductType } from '../db/schema.js';
import { DASH_KEY_PATTERN } from './attributeTypes.js';

/*
  Product types: what kind of product something is, and so how it is delivered. Every product is one. kempo-products
  alone has 'generic' ("Generic Product"), which has no delivery of its own. Other types come from extensions, each
  registering its own (owner = the extension's name): kempo-shipping adds "Physical Item", kempo-credits adds
  "Credits Only". Nothing here knows what a type does beyond needsShipping: an extension that delivers something
  (a download, an activation code) hooks the order for its own types.
*/
export const GENERIC = 'generic';
export const CREDITS_ONLY = 'credits-only';

const newId = () => crypto.randomBytes(8).toString('hex');

const MAX_NAME = 100;
const MAX_DESCRIPTION = 500;

export const getProductTypes = async () => {
  try {
    return [null, await db.select().from(kempoProductType).orderBy(asc(kempoProductType.name))];
  } catch {
    return [{ code: 500, msg: 'Failed to retrieve product types' }, null];
  }
};

export const getProductType = async key => {
  const [error, types] = await getProductTypes();
  if(error) return [error, null];
  const type = types.find(candidate => candidate.key === key);
  return type ? [null, type] : [{ code: 400, msg: `There is no product type "${key}"` }, null];
};

/*
  Whether a product with this product type needs sending. A type nobody registers any more (its extension was
  removed) falls back to the old flag: a credits product is never shipped, anything else is.
*/
export const needsShippingFor = (types, productType, { creditsOnly = false } = {}) => {
  const type = types.find(candidate => candidate.key === productType);
  return type ? type.needsShipping : !creditsOnly;
};

/*
  Turns what a caller sent into a product type. `productType` wins; the older `creditsOnly` boolean still works
  (true is the credits type, false the generic one, when the product was credits-only). Returns the values to
  store, which keep the `creditsOnly` column in step for anything that still reads it.
*/
export const normalizeProductType = async (supplied, existing = {}) => {
  let requested = supplied.productType;
  if(requested === undefined && typeof supplied.creditsOnly === 'boolean' && supplied.creditsOnly !== (existing.productType === CREDITS_ONLY)){
    requested = supplied.creditsOnly ? CREDITS_ONLY : GENERIC;
  }
  if(requested === undefined) return [null, {}];
  /* Blank means "the template's": the type comes from the product's template, or is generic without one. */
  if(String(requested).trim() === '') return [null, { productType: '' }];
  const key = String(requested).trim();
  const [error] = await getProductType(key);
  if(error) return [error, null];
  return [null, { productType: key, creditsOnly: key === CREDITS_ONLY }];
};

/* Idempotent: safe from an extension's install.js and again on every update. */
export const registerProductType = async (owner, definition = {}) => {
  if(!owner) return [{ code: 400, msg: 'An owner (your extension name) is required' }, null];
  const key = String(definition.key ?? '').trim();
  if(!DASH_KEY_PATTERN.test(key)) return [{ code: 400, msg: 'A product type key must start with a lowercase letter and use only lowercase letters, numbers and dashes (max 40)' }, null];
  const name = String(definition.name ?? '').trim();
  if(!name || name.length > MAX_NAME) return [{ code: 400, msg: `A product type needs a name of ${MAX_NAME} characters or fewer` }, null];
  const description = String(definition.description ?? '').trim();
  if(description.length > MAX_DESCRIPTION) return [{ code: 400, msg: `Description must be ${MAX_DESCRIPTION} characters or fewer` }, null];
  const needsShipping = definition.needsShipping !== false;

  try {
    const [existing] = await db.select().from(kempoProductType).where(eq(kempoProductType.key, key));
    if(existing && existing.owner !== owner){
      return [{ code: 409, msg: `The product type "${key}" is already registered by ${existing.owner ? `the "${existing.owner}" extension` : 'the site'}` }, null];
    }
    if(!existing){
      const [created] = await db.insert(kempoProductType).values({ id: newId(), key, name, description, needsShipping, owner, created: new Date() }).returning();
      return [null, created];
    }
    const [updated] = await db.update(kempoProductType).set({ name, description, needsShipping }).where(eq(kempoProductType.key, key)).returning();
    return [null, updated];
  } catch {
    return [{ code: 500, msg: 'Failed to register the product type' }, null];
  }
};

/* For an extension's uninstall.js: removes the types it owns, unless products still use one. */
export const unregisterProductTypes = async owner => {
  if(!owner) return [{ code: 400, msg: 'An owner (your extension name) is required' }, null];
  try {
    const owned = await db.select().from(kempoProductType).where(eq(kempoProductType.owner, owner));
    for(const type of owned){
      const [{ products }] = await db.select({ products: sql`count(*)::int` }).from(kempoProduct).where(eq(kempoProduct.productType, type.key));
      if(products) return [{ code: 409, msg: `${products} product${products === 1 ? ' still has' : 's still have'} the product type "${type.key}"` }, null];
    }
    for(const type of owned) await db.delete(kempoProductType).where(eq(kempoProductType.key, type.key));
    return [null, { removed: owned.length }];
  } catch {
    return [{ code: 500, msg: 'Failed to remove product types' }, null];
  }
};
