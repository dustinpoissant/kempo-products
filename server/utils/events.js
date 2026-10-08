/*
  Events this extension fires. Other extensions subscribe by declaring them in their own
  kempo-config.json `hooks`, e.g. { "kempo-products:purchase:recorded": "./hooks/purchase-recorded.js" }.

  Guards ("before" events) run first and can change the pending operation or refuse it:
    - the payload carries a mutable `draft` (or `changes`); edit it in place to alter what is saved
    - throw `{ code, msg }` to refuse; the caller receives exactly that error
  Type and field guards can only refuse. Every payload carries `actor`: the extension that made the
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
  productStockChanged: 'kempo-products:product:stock_changed',
  typeBeforeCreate: 'kempo-products:type:before_create',
  typeCreated: 'kempo-products:type:created',
  typeBeforeUpdate: 'kempo-products:type:before_update',
  typeUpdated: 'kempo-products:type:updated',
  typeBeforeDelete: 'kempo-products:type:before_delete',
  typeDeleted: 'kempo-products:type:deleted',
  fieldBeforeCreate: 'kempo-products:field:before_create',
  fieldCreated: 'kempo-products:field:created',
  fieldBeforeUpdate: 'kempo-products:field:before_update',
  fieldUpdated: 'kempo-products:field:updated',
  fieldBeforeDelete: 'kempo-products:field:before_delete',
  fieldDeleted: 'kempo-products:field:deleted',
  purchaseRecorded: 'kempo-products:purchase:recorded',
  purchaseReversed: 'kempo-products:purchase:reversed',
};
