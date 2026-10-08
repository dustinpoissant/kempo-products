/*
  Who may change what. `owner` is '' for things people manage in the admin, or the name of the
  extension that created it, and `actor` is whoever is making the change in the same terms: the HTTP
  layer never names an actor ('' = a person), only an extension calling the server SDK can.

  Ownership never changes what stock does: anyone with the permission can still adjust an owned
  product's stock. It protects what the owner builds on:

    products  slug, name, type and deletion belong to the owner
    types     renaming and deletion belong to the owner
    fields    see fields.js

  Everything else (description, price, tags, images, field values, options) stays editable by
  anyone, so an extension's products still show up and can be tidied in the admin. An extension that
  needs to guard more than this subscribes to the before_* hooks.
*/
export const LOCKED_PRODUCT_PROPERTIES = ['slug', 'name', 'type'];

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
  Who maintains a product's stock and option availability. '' means people, in the admin; otherwise
  an extension keeps them in step with something else and people see them read-only.
*/
export const stockLocked = (product, actor = '') => Boolean(product.managedBy) && product.managedBy !== actor;
