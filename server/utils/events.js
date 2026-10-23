/*
  Events this extension fires. Other extensions subscribe by declaring them in their own
  kempo-config.json `hooks`, e.g. { "kempo-products:ledger:added": "./hooks/ledger-added.js" }.

  Guards ("before" events) run first and can change the pending operation or refuse it:
    - the payload carries a mutable `draft` (or `changes`); edit it in place to alter what is saved
    - throw `{ code, msg }` to refuse; the caller receives exactly that error
  The ledger guard (`ledger:before_add`) carries `ref`, the `lines` ({ productId, name, change }), the `products`,
  `reason`, `note`, `undoes` (the ref of an earlier entry this one puts back) and `actor`. The extension that
  manages some of those products (`managedBy`) takes or gives back whatever it keeps their quantity from there
  and throws when it cannot, because products never writes a managed product's quantity itself. When the entry
  fails after a guard passed, `ledger:add_failed` ({ ref }) tells them to undo what they did.
  Type and attribute guards can only refuse. Every payload carries `actor`: the extension that made the
  change through the server SDK, or '' for a person using the admin.
  Notifications ("after" events) run once the work is committed; nothing they do can undo it.
*/
export const EVENTS = {
  productBeforeCreate: 'kempo-products:product:before_create',
  productCreated: 'kempo-products:product:created',
  productBeforeUpdate: 'kempo-products:product:before_update',
  productUpdated: 'kempo-products:product:updated',
  productBeforeDelete: 'kempo-products:product:before_delete',
  productDeleted: 'kempo-products:product:deleted',
  productQuantityChanged: 'kempo-products:product:quantity_changed',
  categoryCreated: 'kempo-products:category:created',
  categoryUpdated: 'kempo-products:category:updated',
  categoryDeleted: 'kempo-products:category:deleted',
  templateBeforeCreate: 'kempo-products:template:before_create',
  templateCreated: 'kempo-products:template:created',
  templateBeforeUpdate: 'kempo-products:template:before_update',
  templateUpdated: 'kempo-products:template:updated',
  templateBeforeDelete: 'kempo-products:template:before_delete',
  templateDeleted: 'kempo-products:template:deleted',
  attributeBeforeCreate: 'kempo-products:attribute:before_create',
  attributeCreated: 'kempo-products:attribute:created',
  attributeBeforeUpdate: 'kempo-products:attribute:before_update',
  attributeUpdated: 'kempo-products:attribute:updated',
  attributeBeforeDelete: 'kempo-products:attribute:before_delete',
  attributeDeleted: 'kempo-products:attribute:deleted',
  ledgerBeforeAdd: 'kempo-products:ledger:before_add',
  ledgerAdded: 'kempo-products:ledger:added',
  ledgerAddFailed: 'kempo-products:ledger:add_failed',
};
