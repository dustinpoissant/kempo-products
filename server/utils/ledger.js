import db from 'kempo/server/db/index.js';
import { eq, and, sql, desc } from 'drizzle-orm';
import { kempoProduct, kempoProductLedger } from '../db/schema.js';
import { getProduct, getProducts } from './products.js';
import { normalizeQuantity, UNLIMITED } from './quantity.js';
import { quantityLocked, refuseIfManaged } from './ownership.js';
import { EVENTS, guard, notify } from './hooks.js';
import { newId, isUniqueViolation, ledgerRowsFor } from './ledgerRows.js';

/*
  The ledger is the one place quantity changes are recorded. A change is an entry: some products, and
  for each one how much to add (negative to take). Adding an entry changes the quantities and writes
  the rows in one transaction, all or nothing, so a sale of three products either takes all three or none.

  Products does not take orders, hold stock for a payment, grant credits or reverse anything. Whoever
  does (kempo-commerce, a person counting a shelf, a supplier feed) adds entries: a sale is an entry that
  takes, a return is one that adds back.

    ref      the caller's own reference for the entry. Adding an entry with a ref that is already there
             changes nothing and returns the first one (`duplicate: true`), so a retry is safe.
    lines    [{ productId, change, options }]; options ({ optionKey: choiceKey }) says which choice was
             sold, for the extension that maintains a quantity, and is not stored
    note     free text shown on the ledger
    reason   a short word for why: 'sale', 'return', 'count', 'restock'
    undoes   the ref of an earlier entry this one puts back
    actor    the extension adding it, '' for a person
*/

export const MAX_REF = 200;
export const MAX_NOTE = 500;
const MAX_REASON = 40;
const MAX_LINES = 100;
const MAX_CHANGE = 1000000;

/* Thrown inside the transaction to roll it back with a message the caller can show. */
class Refusal {
  constructor(error){
    this.error = error;
  }
}

/*
  Whole, non-zero changes. `changes` is one per product, because two lines for one product draw on one
  quantity; `given` is the lines as they were given, with their `options` ({ optionKey: choiceKey }, which
  products does not interpret), because the extension that maintains a quantity needs to know which
  choice of a product was sold.
*/
const normalizeLines = input => {
  if(!Array.isArray(input) || !input.length) return [{ code: 400, msg: 'A ledger entry needs at least one line' }, null];
  if(input.length > MAX_LINES) return [{ code: 400, msg: `A ledger entry can have at most ${MAX_LINES} lines` }, null];
  const changes = new Map();
  const given = [];
  for(const raw of input){
    const productId = String(raw?.productId ?? '').trim();
    if(!productId) return [{ code: 400, msg: 'Every line needs a productId' }, null];
    const change = Number(raw?.change);
    if(!Number.isInteger(change) || change === 0 || Math.abs(change) > MAX_CHANGE){
      return [{ code: 400, msg: `A change must be a whole number other than 0, up to ${MAX_CHANGE}` }, null];
    }
    const options = raw?.options ?? {};
    if(!options || typeof options !== 'object' || Array.isArray(options) || Object.values(options).some(choice => typeof choice !== 'string')){
      return [{ code: 400, msg: 'options must be { optionKey: choiceKey }' }, null];
    }
    changes.set(productId, (changes.get(productId) ?? 0) + change);
    given.push({ productId, change, options });
  }
  return [null, { changes: [...changes].map(([productId, change]) => ({ productId, change })).filter(line => line.change !== 0), given }];
};

const entryOf = (ref, rows) => ({
  ref,
  note: rows[0]?.note ?? '',
  reason: rows[0]?.reason ?? '',
  created: rows[0]?.created ?? null,
  lines: rows.map(row => ({ productId: row.productId, name: row.name, change: row.change, quantity: row.quantity })),
});

export const getLedgerEntry = async ref => {
  if(!ref) return [{ code: 400, msg: 'ref is required' }, null];
  try {
    const rows = await db.select().from(kempoProductLedger).where(eq(kempoProductLedger.ref, String(ref))).orderBy(kempoProductLedger.created, kempoProductLedger.id);
    return rows.length ? [null, entryOf(String(ref), rows)] : [{ code: 404, msg: 'Ledger entry not found' }, null];
  } catch {
    return [{ code: 500, msg: 'Failed to retrieve the ledger entry' }, null];
  }
};

/* The ledger, newest first. `productId` narrows it to one product. */
export const getLedger = async ({ productId, limit = 50, offset = 0 } = {}) => {
  try {
    const where = productId ? eq(kempoProductLedger.productId, String(productId)) : undefined;
    const items = await db.select().from(kempoProductLedger).where(where).orderBy(desc(kempoProductLedger.created), desc(kempoProductLedger.id)).limit(limit).offset(offset);
    const [{ total }] = await db.select({ total: sql`count(*)::int` }).from(kempoProductLedger).where(where);
    return [null, { items, total }];
  } catch {
    return [{ code: 500, msg: 'Failed to retrieve the ledger' }, null];
  }
};

/*
  Adds an entry: changes every product's quantity by its line's `change` and writes the ledger rows, or
  changes nothing. Returns [null, { ref, lines, duplicate }] where each line has the quantity left.

  Taking more than a product has is refused with 409 and nothing changes. A product with unlimited
  quantity stays unlimited and gets no row. A product whose quantity another extension maintains
  (`managedBy`) is that extension's to write: the `kempo-products:ledger:before_add` guard asks it
  first, it takes or refuses whatever it keeps the quantity from (inventory's materials), and products
  does not write the quantity itself. That extension's own change to the quantity is its own entry.
*/
export const addLedgerEntry = async ({ ref, lines: input, note = '', reason = '', undoes = '', actor = '', userId = '' } = {}) => {
  const reference = String(ref ?? '').trim();
  if(reference.length > MAX_REF) return [{ code: 400, msg: `ref must be ${MAX_REF} characters or fewer` }, null];
  const text = String(note ?? '').trim();
  if(text.length > MAX_NOTE) return [{ code: 400, msg: `A note must be ${MAX_NOTE} characters or fewer` }, null];
  const why = String(reason ?? '').trim();
  if(why.length > MAX_REASON) return [{ code: 400, msg: `A reason must be ${MAX_REASON} characters or fewer` }, null];

  const [linesError, normalized] = normalizeLines(input);
  if(linesError) return [linesError, null];
  const { changes: lines, given } = normalized;
  if(!lines.length) return [{ code: 400, msg: 'The changes in this entry add up to nothing' }, null];

  if(reference){
    const [, first] = await getLedgerEntry(reference);
    if(first) return [null, { ...first, duplicate: true }];
  }

  const [lookupError, found] = await getProducts({ ids: lines.map(line => line.productId), limit: lines.length });
  if(lookupError) return [lookupError, null];
  const products = new Map(found.items.map(product => [product.id, product]));
  for(const line of lines){
    if(!products.has(line.productId)) return [{ code: 404, msg: 'A product in this entry no longer exists' }, null];
  }

  const handed = lines.filter(line => quantityLocked(products.get(line.productId), actor));
  let guarded = false;
  if(handed.length){
    const refused = await guard(EVENTS.ledgerBeforeAdd, {
      ref: reference, lines: given.map(line => ({ ...line, name: products.get(line.productId).name })), products: [...products.values()], note: text, reason: why, undoes, actor, userId,
    });
    if(refused) return [refused, null];
    guarded = true;
  }

  const now = new Date();
  try {
    const written = await db.transaction(async tx => {
      const rows = [];
      for(const line of lines){
        const product = products.get(line.productId);
        if(quantityLocked(product, actor) || product.quantity === UNLIMITED) continue;
        const [row] = await tx.update(kempoProduct)
          .set({ quantity: sql`${kempoProduct.quantity} + ${line.change}`, updated: now })
          .where(and(eq(kempoProduct.id, line.productId), sql`${kempoProduct.quantity} <> ${UNLIMITED}`, sql`${kempoProduct.quantity} + ${line.change} >= 0`))
          .returning({ quantity: kempoProduct.quantity });
        if(!row) throw new Refusal({ code: 409, msg: `${product.name}: not enough in stock` });
        rows.push({ productId: line.productId, name: product.name, change: line.change, quantity: row.quantity });
      }
      if(rows.length) await tx.insert(kempoProductLedger).values(ledgerRowsFor(rows, { ref: reference, reason: why, note: text, undoes, actor, userId, now }));
      return rows;
    });

    await notify(EVENTS.ledgerAdded, { ref: reference, lines: written, handedOver: handed.map(line => line.productId), note: text, reason: why, undoes, actor, userId });
    for(const row of written){
      await notify(EVENTS.productQuantityChanged, {
        product: { ...products.get(row.productId), quantity: row.quantity }, previousQuantity: row.quantity - row.change, quantity: row.quantity, reason: why || 'ledger', actor,
      });
    }
    return [null, { ref: reference, note: text, reason: why, lines: written, duplicate: false }];
  } catch(error) {
    if(isUniqueViolation(error) && reference){
      const [, first] = await getLedgerEntry(reference);
      if(first) return [null, { ...first, duplicate: true }];
    }
    if(guarded) await notify(EVENTS.ledgerAddFailed, { ref: reference, actor });
    if(error instanceof Refusal) return [error.error, null];
    return [{ code: 500, msg: 'Failed to add the ledger entry' }, null];
  }
};

/* Adds `delta` (negative to take) to one product. A shorthand for an entry with one line. */
export const adjustQuantity = async (id, delta, { actor = '', reason = 'adjusted', note = '', ref = '', userId = '' } = {}) => {
  const change = Number(delta);
  if(!Number.isInteger(change) || change === 0) return [{ code: 400, msg: 'delta must be a non-zero whole number' }, null];
  const [lookupError, existing] = await getProduct(id);
  if(lookupError) return [lookupError, null];
  const managed = refuseIfManaged(existing, actor);
  if(managed) return managed;
  if(existing.quantity === UNLIMITED) return [null, existing];
  const [error] = await addLedgerEntry({ ref, lines: [{ productId: existing.id, change }], note, reason, actor, userId });
  if(error) return [error.code === 409 ? { code: 409, msg: 'Insufficient quantity' } : error, null];
  return getProduct(existing.id);
};

/* Sets the quantity to a number (blank or -1 is unlimited). The ledger records how much it moved. */
export const setQuantity = async (id, quantity, { actor = '', reason = 'set', note = '', userId = '' } = {}) => {
  const [lookupError, existing] = await getProduct(id);
  if(lookupError) return [lookupError, null];
  const managed = refuseIfManaged(existing, actor);
  if(managed) return managed;
  const [quantityError, value] = normalizeQuantity(quantity);
  if(quantityError) return [quantityError, null];
  if(value === existing.quantity) return [null, existing];

  try {
    const now = new Date();
    const previous = await db.transaction(async tx => {
      const [current] = await tx.select({ quantity: kempoProduct.quantity }).from(kempoProduct).where(eq(kempoProduct.id, existing.id)).for('update');
      await tx.update(kempoProduct).set({ quantity: value, updated: now }).where(eq(kempoProduct.id, existing.id));
      await tx.insert(kempoProductLedger).values(ledgerRowsFor([{
        productId: existing.id, name: existing.name, change: current.quantity === UNLIMITED || value === UNLIMITED ? 0 : value - current.quantity, quantity: value,
      }], { reason, note, actor, userId, now }));
      return current.quantity;
    });
    const [, product] = await getProduct(existing.id);
    await notify(EVENTS.productQuantityChanged, { product, previousQuantity: previous, quantity: value, reason, actor });
    return [null, product];
  } catch {
    return [{ code: 500, msg: 'Failed to change quantity' }, null];
  }
};
