/*
  The server SDK other extensions build on. Every function resolves to [error, result], where
  `error` is { code, msg } or null.

  An extension that adds to the catalog declares `"dependencies": ["kempo-products"]` in its
  kempo-config.json. Types, fields and products can all be owned: pass your extension name as
  `owner` and only you can delete them or change the parts that define them, while people keep
  editing everything else in the admin. Owner is never read from an HTTP request:

    registerType(owner, { name })                    registerField(owner, { ..., productType })
    createCategory({ name })                         updateProduct(id, { categories: [key] })
    createProduct(data, { owner })                   updateProduct(id, data, { owner })
    deleteProduct(id, { owner })                     unregisterProducts(owner, { release })

  Taking an order is not this extension's job. Whoever does (kempo-commerce, a person counting a shelf)
  adds an entry to the ledger, which changes the quantity of every product in it, or none, and
  records it. A sale takes, a return adds back:

    import { addLedgerEntry } from 'kempo-products/sdk';
    const [error, entry] = await addLedgerEntry({ ref: 'order-1042', reason: 'sale', lines: [{ productId, change: -1 }] });

  When kempo-credits is installed and enabled, a product can say how many credits it gives
  (`creditsGranted`, or `creditsOnly` for a credit pack) and accept credits as payment for part of its
  price (`creditPercent`). Giving and taking back credits is the caller's job, because only it knows an
  order was paid. `getPrice` also returns `credits`: the most credits that may be used and the money
  left, worked out from the `credits_per_unit` setting.

  An extension that keeps quantity in step with something else (inventory, a supplier feed) calls
  setManagedBy(productId, 'my-extension') and then setQuantity / setChoiceAvailability with
  { actor: 'my-extension' }. People see those read-only from then on.
*/
export {
  getProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  unregisterProducts,
  setManagedBy,
  setChoiceAvailability,
  getPrice,
  resolveImages,
  SORT_KEYS,
} from './server/utils/products.js';

export {
  getTypes,
  getType,
  createType,
  updateType,
  deleteType,
  registerType,
  unregisterTypes,
} from './server/utils/types.js';

export {
  getCategories,
  getCategory,
  createCategory,
  updateCategory,
  deleteCategory,
} from './server/utils/categories.js';

export {
  getFields,
  getField,
  createField,
  updateField,
  deleteField,
  registerField,
  registerFields,
  unregisterFields,
} from './server/utils/fields.js';

export {
  addLedgerEntry,
  getLedger,
  getLedgerEntry,
  adjustQuantity,
  setQuantity,
} from './server/utils/ledger.js';

export { creditsEnabled, creditQuote } from './server/utils/credits.js';
export { getCreditsPerUnit } from './server/utils/settings.js';

export { buildExport, parseImport, applyImport, importFile } from './server/utils/importExport.js';
export { computePrice, normalizeOptions, checkSelections } from './server/utils/pricing.js';
export { parseMoney, formatMoney, displayMoney, decimalsFor } from './server/utils/money.js';
export { unavailableReason, isPurchasable, UNLIMITED } from './server/utils/quantity.js';
export { mediaAvailable } from './server/utils/media.js';
export { FIELD_TYPES } from './server/utils/fieldTypes.js';
export { EVENTS } from './server/utils/events.js';
