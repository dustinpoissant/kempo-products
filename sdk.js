/*
  The server SDK other extensions build on. Every function resolves to [error, result], where
  `error` is { code, msg } or null.

  An extension that adds to the catalog declares `"dependencies": ["kempo-products"]` in its
  kempo-config.json. Types, fields and products can all be owned: pass your extension name as
  `owner` and only you can delete them or change the parts that define them, while people keep
  editing everything else in the admin. Owner is never read from an HTTP request:

    registerType(owner, { name })                    registerField(owner, { ..., productType })
    createProduct(data, { owner })                   updateProduct(id, data, { owner })
    deleteProduct(id, { owner })                     unregisterProducts(owner, { release })

  Taking an order is not this extension's job. Whoever does calls recordPurchase, which prices the
  lines from the catalog, takes the stock and fires `kempo-products:purchase:recorded`:

    import { recordPurchase } from 'kempo-products/sdk';
    const [error, purchase] = await recordPurchase({ ref: 'order-1042', lines: [{ productId, quantity: 1, options: { color: 'red' } }] });

  When kempo-credits is installed and enabled, a product can give credits (`creditsGranted`, or
  `creditsOnly` for a credit pack) and accept credits as payment for part of its price
  (`creditPercent`). recordPurchase gives the buyer the credits once it commits, and
  reversePurchase takes back what they still hold. `getPrice` then also returns `credits`: the most
  credits that may be used and the money left, worked out from the `credits_per_unit` setting.
  Spending them is the caller's job, with kempo-credits' own `spendCredits`.

  An extension that keeps stock in step with something else (inventory, a supplier feed) calls
  setManagedBy(productId, 'my-extension') and then setStock / setChoiceAvailability with
  { actor: 'my-extension' }. People see those read-only from then on.
*/
export {
  getProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  unregisterProducts,
  setStock,
  adjustStock,
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
  recordPurchase,
  reversePurchase,
  getPurchase,
  getPurchases,
} from './server/utils/purchases.js';

export { creditsEnabled, creditQuote, grantPurchaseCredits } from './server/utils/credits.js';
export { getCreditsPerUnit } from './server/utils/settings.js';

export { buildExport, parseImport, applyImport, importFile } from './server/utils/importExport.js';
export { computePrice, normalizeOptions, checkSelections } from './server/utils/pricing.js';
export { parseMoney, formatMoney, displayMoney, decimalsFor } from './server/utils/money.js';
export { unavailableReason, isPurchasable, UNLIMITED } from './server/utils/stock.js';
export { mediaAvailable } from './server/utils/media.js';
export { FIELD_TYPES } from './server/utils/fieldTypes.js';
export { EVENTS } from './server/utils/events.js';
