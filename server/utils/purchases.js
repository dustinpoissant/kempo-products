import db from 'kempo/server/db/index.js';
import { eq, and, sql, desc } from 'drizzle-orm';
import crypto from 'crypto';
import { kempoProduct, kempoProductPurchase } from '../db/schema.js';
import { getProducts } from './products.js';
import { computePrice } from './pricing.js';
import { unavailableReason, UNLIMITED } from './stock.js';
import { EVENTS, notify } from './hooks.js';
import { getCurrency } from './settings.js';

const newId = () => crypto.randomBytes(8).toString('hex');

const isUniqueViolation = error => (error?.code || error?.cause?.code) === '23505';

const MAX_REF = 200;
const MAX_LINES = 100;
const MAX_QUANTITY = 10000;

/* Thrown inside a transaction to roll it back with a message the caller can show. */
class Refusal {
  constructor(error){
    this.error = error;
  }
}

/* The total quantity bought of each product, because two lines for one product draw on one stock. */
const quantities = lines => {
  const totals = new Map();
  for(const line of lines) totals.set(line.productId, (totals.get(line.productId) ?? 0) + line.quantity);
  return totals;
};

const normalizeLines = input => {
  if(!Array.isArray(input) || !input.length) return [{ code: 400, msg: 'A purchase needs at least one line' }, null];
  if(input.length > MAX_LINES) return [{ code: 400, msg: `A purchase can have at most ${MAX_LINES} lines` }, null];
  const lines = [];
  for(const raw of input){
    const productId = String(raw?.productId ?? '').trim();
    if(!productId) return [{ code: 400, msg: 'Every line needs a productId' }, null];
    const quantity = raw?.quantity === undefined ? 1 : Number(raw.quantity);
    if(!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) return [{ code: 400, msg: `Quantity must be a whole number from 1 to ${MAX_QUANTITY}` }, null];
    const unitPrice = raw?.unitPrice === undefined || raw?.unitPrice === null ? null : Number(raw.unitPrice);
    if(unitPrice !== null && (!Number.isSafeInteger(unitPrice) || unitPrice < 0)) return [{ code: 400, msg: 'unitPrice must be a whole number of the smallest currency unit' }, null];
    lines.push({ productId, quantity, selections: raw?.options ?? {}, unitPrice });
  }
  return [null, lines];
};

/*
  Records that something was purchased and takes its stock, all or nothing. Whoever took the order
  (kempo-commerce, the admin form, another extension) calls this; products does not take orders.

    ref    the caller's own reference for the order. Recording the same one twice is refused, so a
           retry can never take stock twice, and it is how a purchase is found to reverse it.
    lines  [{ productId, quantity, options: { optionKey: choiceKey } }]

  Prices are always computed here from the catalog, never taken from the caller. The one exception
  is `manual`: a person recording a sale made elsewhere (Etsy, in person) may give a line's
  `unitPrice`, which is used when the product has no price, and the product need not be for sale.

  Afterwards `kempo-products:purchase:recorded` fires with the purchase, which is how other
  extensions react (the inventory connector uses up materials). Nothing they do can undo it.
*/
export const recordPurchase = async ({ ref, lines: input, userId = '' } = {}, { manual = false } = {}) => {
  const reference = String(ref ?? '').trim();
  if(!reference) return [{ code: 400, msg: 'A purchase needs a ref (your own reference for the order)' }, null];
  if(reference.length > MAX_REF) return [{ code: 400, msg: `ref must be ${MAX_REF} characters or fewer` }, null];

  const [linesError, lines] = normalizeLines(input);
  if(linesError) return [linesError, null];

  const totals = quantities(lines);
  const [lookupError, found] = await getProducts({ ids: [...totals.keys()], limit: totals.size });
  if(lookupError) return [lookupError, null];
  const products = new Map(found.items.map(product => [product.id, product]));

  const snapshot = [];
  for(const line of lines){
    const product = products.get(line.productId);
    if(!product) return [{ code: 404, msg: 'A product in this purchase no longer exists' }, null];
    if(!manual){
      const reason = unavailableReason(product);
      if(reason) return [{ code: 409, msg: `${product.name}: ${reason.toLowerCase()}` }, null];
    }
    let unitPrice;
    let optionLines = [];
    let selections = {};
    if(product.price === null && manual && line.unitPrice !== null){
      unitPrice = line.unitPrice;
    } else {
      const [priceError, priced] = computePrice(product, product.options, line.selections);
      if(priceError) return [{ ...priceError, msg: `${product.name}: ${priceError.msg}` }, null];
      unitPrice = priced.unit;
      optionLines = priced.lines;
      selections = priced.selections;
    }
    snapshot.push({
      productId: product.id, slug: product.slug, name: product.name, quantity: line.quantity,
      unitPrice, selections, optionLines,
    });
  }

  const currency = await getCurrency();
  const total = snapshot.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
  const now = new Date();

  try {
    const purchase = await db.transaction(async tx => {
      const [row] = await tx.insert(kempoProductPurchase).values({
        id: newId(), ref: reference, lines: snapshot, total, currency, userId, status: 'recorded', created: now, updated: now,
      }).returning();
      for(const [productId, quantity] of totals){
        const [taken] = await tx.update(kempoProduct)
          .set({ stock: sql`case when ${kempoProduct.stock} = ${UNLIMITED} then ${UNLIMITED} else ${kempoProduct.stock} - ${quantity} end`, updated: now })
          .where(and(eq(kempoProduct.id, productId), sql`(${kempoProduct.stock} = ${UNLIMITED} or ${kempoProduct.stock} >= ${quantity})`))
          .returning({ id: kempoProduct.id });
        if(!taken) throw new Refusal({ code: 409, msg: `${products.get(productId).name}: not enough in stock` });
      }
      return row;
    });
    await notify(EVENTS.purchaseRecorded, { purchase, userId, actor: '' });
    await notifyStock(totals, products, -1, 'purchase');
    return [null, purchase];
  } catch(error) {
    if(error instanceof Refusal) return [error.error, null];
    if(isUniqueViolation(error)) return [{ code: 409, msg: 'A purchase with that ref is already recorded' }, null];
    return [{ code: 500, msg: 'Failed to record the purchase' }, null];
  }
};

/* Tells listeners the stock of each finite-stock product changed. `direction` is -1 for a sale, 1 for a return. */
const notifyStock = async (totals, before, direction, reason) => {
  const [, current] = await getProducts({ ids: [...totals.keys()], limit: totals.size });
  for(const product of current?.items ?? []){
    const previous = before.get(product.id);
    if(!previous || previous.stock === UNLIMITED) continue;
    await notify(EVENTS.productStockChanged, { product, previousStock: previous.stock, stock: product.stock, reason, actor: '', direction });
  }
};

export const getPurchase = async ref => {
  if(!ref) return [{ code: 400, msg: 'ref is required' }, null];
  try {
    const [purchase] = await db.select().from(kempoProductPurchase).where(eq(kempoProductPurchase.ref, String(ref)));
    return purchase ? [null, purchase] : [{ code: 404, msg: 'Purchase not found' }, null];
  } catch {
    return [{ code: 500, msg: 'Failed to retrieve the purchase' }, null];
  }
};

export const getPurchases = async ({ limit = 50, offset = 0 } = {}) => {
  try {
    const items = await db.select().from(kempoProductPurchase).orderBy(desc(kempoProductPurchase.created), desc(kempoProductPurchase.id)).limit(limit).offset(offset);
    const [{ total }] = await db.select({ total: sql`count(*)::int` }).from(kempoProductPurchase);
    return [null, { items, total }];
  } catch {
    return [{ code: 500, msg: 'Failed to retrieve purchases' }, null];
  }
};

/*
  Undoes a purchase (a cancelled or refunded order): puts finite stock back and marks it reversed,
  then fires `kempo-products:purchase:reversed`. A product deleted since is skipped. A purchase can
  only be reversed once.
*/
export const reversePurchase = async (ref, { actor = '' } = {}) => {
  const [lookupError, existing] = await getPurchase(ref);
  if(lookupError) return [lookupError, null];
  if(existing.status === 'reversed') return [{ code: 409, msg: 'This purchase was already reversed' }, null];

  const totals = quantities(existing.lines);
  const [, found] = await getProducts({ ids: [...totals.keys()], limit: totals.size });
  const before = new Map((found?.items ?? []).map(product => [product.id, product]));

  try {
    const purchase = await db.transaction(async tx => {
      const [row] = await tx.update(kempoProductPurchase)
        .set({ status: 'reversed', updated: new Date() })
        .where(and(eq(kempoProductPurchase.id, existing.id), eq(kempoProductPurchase.status, 'recorded')))
        .returning();
      if(!row) throw new Refusal({ code: 409, msg: 'This purchase was already reversed' });
      const ids = [...totals.keys()];
      for(const id of ids){
        await tx.update(kempoProduct)
          .set({ stock: sql`${kempoProduct.stock} + ${totals.get(id)}`, updated: new Date() })
          .where(and(eq(kempoProduct.id, id), sql`${kempoProduct.stock} <> ${UNLIMITED}`));
      }
      return row;
    });
    await notify(EVENTS.purchaseReversed, { purchase, actor });
    await notifyStock(totals, before, 1, 'reversal');
    return [null, purchase];
  } catch(error) {
    if(error instanceof Refusal) return [error.error, null];
    return [{ code: 500, msg: 'Failed to reverse the purchase' }, null];
  }
};
