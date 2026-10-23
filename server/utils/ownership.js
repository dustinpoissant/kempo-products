import db from 'kempo/server/db/index.js';
import { extension } from 'kempo/server/db/schema.js';
import { and, eq, inArray } from 'drizzle-orm';

/*
  Who may change what. `owner` is '' for things people manage in the admin, or the name of the
  extension that created it, and `actor` is whoever is making the change in the same terms: the HTTP
  layer never names an actor ('' = a person), only an extension calling the server SDK can.

  Ownership never changes what quantity does: anyone with the permission can still adjust an owned
  product's quantity. It protects what the owner builds on:

    products  slug, name and deletion belong to the owner
    attributes    see attributes.js

  Everything else (description, price, tags, categories, images, attribute values, options) stays editable by
  anyone, so an extension's products still show up and can be tidied in the admin. An extension that
  needs to guard more than this subscribes to the before_* hooks.
*/
export const LOCKED_PRODUCT_PROPERTIES = ['slug', 'name'];

export const ownerLabel = owner => owner ? `the "${owner}" extension` : 'people using the admin';

/* The locked properties `changes` would actually change. Sending the current value back is not a change. */
export const lockedProductChanges = (existing, changes, actor = '') => existing.owner === actor ? [] : LOCKED_PRODUCT_PROPERTIES.filter(property => {
  const value = changes[property];
  if(value === undefined) return false;
  return String(value).trim() !== existing[property];
});

export const notYours = (what, existing, actor = '') => ({
  code: 403,
  msg: `This ${what} is managed by ${ownerLabel(existing.owner)}${actor ? `, not "${actor}"` : ''}`,
});

/* Whether `actor` may rename or delete a record `owner` owns. A record that does not exist yet is fair game. */
export const mayManage = (record, actor = '') => !record || record.owner === actor;

/*
  Who maintains a product's quantity and option availability. '' means people, in the admin; otherwise
  an extension keeps them in step with something else and people see them read-only.

  A product only counts as managed while its manager is installed and enabled. Uninstalling or
  disabling it hands its products back to people without anyone having to clean up, and enabling it
  again takes them back. `activeManagers` is how that is decided, and the products read from the
  catalog already carry the result in `managedBy`.
*/
export const quantityLocked = (product, actor = '') => Boolean(product.managedBy) && product.managedBy !== actor;

/* The refusal a person or extension gets for changing the quantity of a product another extension maintains, or null. */
export const refuseIfManaged = (product, actor) => quantityLocked(product, actor)
  ? [{ code: 403, msg: `Quantity is maintained by the "${product.managedBy}" extension` }, null]
  : null;

/* Which of these extension names are installed and enabled. When that cannot be told, all of them are, so a failure never unlocks a product. */
export const activeManagers = async names => {
  const wanted = [...new Set(names.filter(Boolean))];
  if(!wanted.length) return new Set();
  try {
    const rows = await db.select({ name: extension.name }).from(extension).where(and(inArray(extension.name, wanted), eq(extension.enabled, true)));
    return new Set(rows.map(row => row.name));
  } catch {
    return new Set(wanted);
  }
};
