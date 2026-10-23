import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { sql, eq } from 'drizzle-orm';
import db from 'kempo/server/db/index.js';
import { extension } from 'kempo/server/db/schema.js';
import {
  kempoProduct, kempoProductAttribute, kempoProductOption, kempoProductLedger,
} from '../server/db/schema.js';
import {
  createProduct, updateProduct, deleteProduct, getProduct, getProducts, setManagedBy,
  setChoiceAvailability, getPrice, unregisterProducts,
} from '../server/utils/products.js';
import { setQuantity, adjustQuantity, addLedgerEntry, getLedger, getLedgerEntry } from '../server/utils/ledger.js';
import { createAttribute, updateAttribute, deleteAttribute, registerAttribute, getAttributes, unregisterAttributes } from '../server/utils/attributes.js';
import install from '../install.js';

/*
  The extension against a real database. It skips itself when none is reachable, or when the
  database is not obviously a throwaway one: it empties every table first, so it must never run
  against real data.

  Requires Postgres carrying kempo's schema and this extension's (`npx drizzle-kit push --force`),
  with DATABASE_URL set to a database whose name ends in _test.
*/
const url = process.env.DATABASE_URL ?? '';
/*
  The unit tier (KEMPO_DB=pglite) is an in-memory database that is always a throwaway. Otherwise the
  database must be one whose name ends in _test, since these suites empty its tables.
*/
const unitTier = process.env.KEMPO_DB === 'pglite';
const reachable = (unitTier || /_test$/.test(url.split('?')[0])) && await db.execute(sql`select 1`).then(() => true).catch(() => false);

if(!reachable && process.env.KEMPO_TEST_TIER === 'integration'){
  throw new Error('The integration tier needs DATABASE_URL pointing at a throwaway Postgres named *_test with the schema applied (npx drizzle-kit push --force).');
}

const purge = async () => {
  for(const table of [kempoProductLedger, kempoProductOption, kempoProduct, kempoProductAttribute]){
    await db.delete(table);
  }
};

const ok = ([error, value]) => {
  assert.equal(error, null, error?.msg);
  return value;
};

const refused = ([error, value], code) => {
  assert.ok(error, 'expected an error');
  assert.equal(value, null);
  if(code) assert.equal(error.code, code, error.msg);
  return error;
};

after(() => unitTier ? db.$client.close() : db.$client.end());

describe('data layer', { skip: reachable ? false : 'no throwaway database (set DATABASE_URL to one ending in _test)' }, () => {
  before(async () => {
    await install();
    await purge();
  });

  after(async () => {
    if(reachable) await purge();
  });

  describe('attributes', () => {
    test('an attribute gets a key from its label, and its key can be used once', async () => {
      const scale = ok(await createAttribute({ label: 'Scale', type: 'select', options: ['1:18', '1:24'] }));
      assert.equal(scale.key, 'scale');
      refused(await createAttribute({ label: 'Scale', type: 'text' }), 409);
      ok(await createAttribute({ label: 'Brand', type: 'text' }));
    });

    test('an attribute type can only change where nothing is lost', async () => {
      refused(await updateAttribute('brand', { type: 'number' }), 409);
      assert.equal(ok(await updateAttribute('brand', { type: 'longtext' })).type, 'longtext');
    });

    test('an extension owns what it registers; people cannot delete it', async () => {
      ok(await registerAttribute('ext-a', { label: 'Mileage', type: 'number' }));
      ok(await registerAttribute('ext-a', { label: 'Mileage', type: 'number' }));
      refused(await registerAttribute('ext-b', { label: 'Mileage', type: 'number' }), 409);
      refused(await deleteAttribute('mileage'), 403);
      refused(await updateAttribute('mileage', { type: 'text' }), 409);
      assert.equal(ok(await updateAttribute('mileage', { label: 'Odometer' })).label, 'Odometer');
    });

    test('unregistering removes what an extension owns', async () => {
      ok(await unregisterAttributes('ext-a'));
      assert.equal(ok(await getAttributes({ owner: 'ext-a' })).length, 0);
    });
  });

  describe('products', () => {
    test('a slug is made from the name and made unique when taken', async () => {
      const first = ok(await createProduct({ name: 'Camaro Z/28' }));
      const second = ok(await createProduct({ name: 'Camaro Z/28' }));
      assert.equal(first.slug, 'camaro-z-28');
      assert.equal(second.slug, 'camaro-z-28-2');
      refused(await createProduct({ name: 'Other', slug: 'camaro-z-28' }), 409);
      refused(await createProduct({ name: 'Api', slug: 'api' }), 400);
    });

    test('products start as drafts, available, with unlimited quantity and no price', async () => {
      const product = ok(await createProduct({ name: 'Draft thing' }));
      assert.equal(product.status, 'draft');
      assert.equal(product.availability, 'available');
      assert.equal(product.quantity, -1);
      assert.equal(product.price, null);
      assert.equal(product.purchasable, false);
      assert.equal(product.publishedAt, null);
    });

    test('publishing stamps publishedAt once', async () => {
      const product = ok(await createProduct({ name: 'Publish me', price: 1000 }));
      const live = ok(await updateProduct(product.id, { status: 'published' }));
      assert.ok(live.publishedAt);
      assert.equal(live.purchasable, true);
      const again = ok(await updateProduct(product.id, { name: 'Publish me too' }));
      assert.equal(String(again.publishedAt), String(live.publishedAt));
    });

    test('attribute values are validated, merged on update and cleared when empty', async () => {
      const car = ok(await createProduct({ name: 'Typed car', attributes: { scale: '1:18', brand: 'Acme' } }));
      assert.deepEqual(car.attributes, { scale: '1:18', brand: 'Acme' });
      refused(await createProduct({ name: 'Bad scale', attributes: { scale: '1:99' } }), 400);
      refused(await createProduct({ name: 'Unknown', attributes: { nonsense: 1 } }), 400);
      const merged = ok(await updateProduct(car.id, { attributes: { brand: '' } }));
      assert.deepEqual(merged.attributes, { scale: '1:18' });
    });

    test('options are stored with the product and replaced as a set', async () => {
      const product = ok(await createProduct({
        name: 'Optioned', price: 4999, status: 'published',
        options: [{ label: 'Clear coat', choices: [{ label: 'Yes' }, { label: 'No', price: -100 }] }],
      }));
      assert.equal(product.options.length, 1);
      const fetched = ok(await getProduct(product.slug));
      assert.equal(fetched.options[0].choices[1].price, -100);
      const [, priced] = await getPrice(product.id, { 'clear-coat': 'no' });
      assert.equal(priced.unit, 4899);
      refused(await getPrice(product.id, {}), 400);
      const replaced = ok(await updateProduct(product.id, { options: [{ label: 'Size', priceType: 'replace', choices: [{ label: 'S', price: 1000 }] }] }));
      assert.deepEqual(replaced.options.map(option => option.key), ['size']);
      assert.equal(ok(await getPrice(product.id, { size: 's' })).unit, 1000);
    });

    test('listing searches, filters, sorts and counts', async () => {
      await purge();
      ok(await createAttribute({ label: 'Scale', type: 'select', options: ['1:18', '1:24'] }));
      ok(await createProduct({ name: 'Red car', price: 3000, status: 'published', tags: ['Red'], attributes: { scale: '1:18' } }));
      ok(await createProduct({ name: 'Blue car', price: 2000, status: 'published', attributes: { scale: '1:24' } }));
      ok(await createProduct({ name: 'Hidden', status: 'draft' }));
      const all = ok(await getProducts({}));
      assert.equal(all.total, 3);
      assert.deepEqual(ok(await getProducts({ status: 'published', sort: 'price-asc' })).items.map(p => p.name), ['Blue car', 'Red car']);
      assert.deepEqual(ok(await getProducts({ q: 'blue' })).items.map(p => p.name), ['Blue car']);
      assert.deepEqual(ok(await getProducts({ filters: { scale: '1:18' } })).items.map(p => p.name), ['Red car']);
      assert.deepEqual(ok(await getProducts({ tag: 'red' })).items.map(p => p.name), ['Red car']);
      assert.equal(ok(await getProducts({ limit: 1 })).items.length, 1);
      assert.equal(ok(await getProducts({ ids: [] })).total, 0);
      assert.deepEqual(ok(await getProducts({ slugs: ['red-car', 'BLUE-CAR', 'nope'], sort: 'name' })).items.map(p => p.name), ['Blue car', 'Red car']);
      assert.equal(ok(await getProducts({ slugs: [] })).total, 0);
      assert.deepEqual(ok(await getProducts({ slugs: ['red-car'], status: 'published', inStock: true })).items.map(p => p.name), ['Red car']);
    });

    test('an owned product keeps its name, slug and type; everything else stays editable', async () => {
      const owned = ok(await createProduct({ name: 'Owned', price: 100 }, { owner: 'ext-a' }));
      refused(await updateProduct(owned.id, { name: 'Renamed' }), 403);
      refused(await deleteProduct(owned.id), 403);
      assert.equal(ok(await updateProduct(owned.id, { name: 'Owned', price: 200, description: 'x' })).price, 200);
      assert.equal(ok(await updateProduct(owned.id, { name: 'Renamed' }, { owner: 'ext-a' })).name, 'Renamed');
      assert.equal(ok(await unregisterProducts('ext-a', { release: true })).released, 1);
      assert.equal(ok(await getProduct(owned.id)).owner, '');
    });
  });

  describe('quantity', () => {
    test('quantity can be set, adjusted and never goes below zero', async () => {
      const product = ok(await createProduct({ name: 'Stocked', quantity: 3 }));
      assert.equal(ok(await adjustQuantity(product.id, -2)).quantity, 1);
      refused(await adjustQuantity(product.id, -2), 409);
      assert.equal(ok(await getProduct(product.id)).quantity, 1);
      assert.equal(ok(await setQuantity(product.id, 10)).quantity, 10);
      assert.equal(ok(await setQuantity(product.id, -1)).quantity, -1);
      assert.equal(ok(await adjustQuantity(product.id, -5)).quantity, -1);
    });

    test('a managed product keeps its quantity and choice availability away from everyone else', async () => {
      const product = ok(await createProduct({
        name: 'Managed', quantity: 5,
        options: [{ label: 'Color', choices: [{ label: 'Red' }, { label: 'Blue' }] }],
      }));
      await db.insert(extension).values({ name: 'connector', version: '0.0.0', enabled: true, kempo: {}, installedAt: new Date(), updatedAt: new Date() }).onConflictDoNothing();
      ok(await setManagedBy(product.id, 'connector'));
      refused(await setManagedBy(product.id, 'someone-else'), 409);
      refused(await setQuantity(product.id, 1), 403);
      refused(await adjustQuantity(product.id, -1), 403);
      refused(await updateProduct(product.id, { quantity: 1 }), 403);
      refused(await setChoiceAvailability(product.id, 'color', 'red', false), 403);
      assert.equal(ok(await updateProduct(product.id, { quantity: 5, description: 'still editable' })).description, 'still editable');
      assert.equal(ok(await setQuantity(product.id, 2, { actor: 'connector' })).quantity, 2);
      const out = ok(await setChoiceAvailability(product.id, 'color', 'red', false, { actor: 'connector' }));
      assert.equal(out.options[0].choices[0].available, false);
      const edited = ok(await updateProduct(product.id, { options: [{ label: 'Color', choices: [{ label: 'Red', available: true }, { label: 'Blue' }] }] }));
      assert.equal(edited.options[0].choices[0].available, false, 'a person cannot flip a managed choice back');
      ok(await setManagedBy(product.id, ''));
      assert.equal(ok(await setQuantity(product.id, 9)).quantity, 9);
      await db.delete(extension).where(eq(extension.name, 'connector'));
    });
  });

  describe('ledger', () => {
    const stocked = (name, quantity, extra = {}) => createProduct({ name, price: 1000, status: 'published', quantity, ...extra }).then(ok);
    const rowsFor = async id => ok(await getLedger({ productId: id })).items;

    test('an entry changes the quantity and writes what changed and what was left', async () => {
      const car = await stocked('Car', 5);
      const entry = ok(await addLedgerEntry({ ref: 'order-1', reason: 'sale', note: 'Etsy 1042', lines: [{ productId: car.id, change: -2 }] }));
      assert.deepEqual(entry.lines.map(line => [line.change, line.quantity]), [[-2, 3]]);
      assert.equal(ok(await getProduct(car.id)).quantity, 3);
      const [row] = await rowsFor(car.id);
      assert.equal(row.change, -2);
      assert.equal(row.quantity, 3);
      assert.equal(row.reason, 'sale');
      assert.equal(row.note, 'Etsy 1042');
      assert.equal(row.name, 'Car');
    });

    test('adding stock raises the quantity', async () => {
      const item = await stocked('Delivery', 1);
      ok(await addLedgerEntry({ lines: [{ productId: item.id, change: 10 }], reason: 'restock' }));
      assert.equal(ok(await getProduct(item.id)).quantity, 11);
    });

    test('the same ref changes nothing the second time and returns the first entry', async () => {
      const item = await stocked('Once', 5);
      ok(await addLedgerEntry({ ref: 'order-twice', lines: [{ productId: item.id, change: -1 }] }));
      const again = ok(await addLedgerEntry({ ref: 'order-twice', lines: [{ productId: item.id, change: -1 }] }));
      assert.equal(again.duplicate, true);
      assert.equal(ok(await getProduct(item.id)).quantity, 4);
      assert.equal((await rowsFor(item.id)).filter(row => row.ref === 'order-twice').length, 1);
    });

    test('an entry is all or nothing across its lines', async () => {
      const plenty = await stocked('Plenty', 5);
      const scarce = await stocked('Scarce', 1);
      refused(await addLedgerEntry({ ref: 'order-partial', lines: [{ productId: plenty.id, change: -1 }, { productId: scarce.id, change: -2 }] }), 409);
      assert.equal(ok(await getProduct(plenty.id)).quantity, 5);
      assert.equal(ok(await getProduct(scarce.id)).quantity, 1);
      assert.equal((await getLedgerEntry('order-partial'))[0].code, 404, 'nothing was written');
    });

    test('two lines for one product share its quantity', async () => {
      const item = await stocked('Shared', 3);
      refused(await addLedgerEntry({ ref: 'order-shared', lines: [{ productId: item.id, change: -2 }, { productId: item.id, change: -2 }] }), 409);
      assert.equal(ok(await getProduct(item.id)).quantity, 3);
    });

    test('quantity never goes below zero', async () => {
      const item = await stocked('Floor', 2);
      assert.match(refused(await addLedgerEntry({ lines: [{ productId: item.id, change: -3 }] }), 409).msg, /Floor: not enough in stock/);
      ok(await addLedgerEntry({ lines: [{ productId: item.id, change: -2 }] }));
      assert.equal(ok(await getProduct(item.id)).quantity, 0);
    });

    test('unlimited quantity is never changed and gets no row', async () => {
      const item = await stocked('Unlimited', undefined);
      const entry = ok(await addLedgerEntry({ ref: 'order-unlimited', lines: [{ productId: item.id, change: -50 }] }));
      assert.deepEqual(entry.lines, []);
      assert.equal(ok(await getProduct(item.id)).quantity, -1);
      assert.equal((await rowsFor(item.id)).length, 0);
    });

    test('an entry that puts back what an earlier one took is just another entry', async () => {
      const item = await stocked('Returnable', 5);
      ok(await addLedgerEntry({ ref: 'o-rev', lines: [{ productId: item.id, change: -3 }] }));
      ok(await addLedgerEntry({ ref: 'o-rev:return', undoes: 'o-rev', reason: 'return', lines: [{ productId: item.id, change: 3 }] }));
      assert.equal(ok(await getProduct(item.id)).quantity, 5);
      assert.equal((await rowsFor(item.id)).find(row => row.ref === 'o-rev:return').undoes, 'o-rev');
    });

    test('a product that is missing, and malformed entries, are refused', async () => {
      refused(await addLedgerEntry({ lines: [{ productId: 'ffffffffffffffff', change: 1 }] }), 404);
      refused(await addLedgerEntry({ lines: [] }), 400);
      refused(await addLedgerEntry({ lines: [{ productId: '', change: 1 }] }), 400);
      refused(await addLedgerEntry({ lines: [{ productId: 'x', change: 0 }] }), 400);
      refused(await addLedgerEntry({ lines: [{ productId: 'x', change: 1.5 }] }), 400);
      refused(await addLedgerEntry({ ref: 'x'.repeat(201), lines: [{ productId: 'x', change: 1 }] }), 400);
    });

    test('setting and adjusting the quantity, and creating and editing a product, are in the ledger too', async () => {
      const item = await stocked('Counted', 4);
      ok(await setQuantity(item.id, 10, { reason: 'count' }));
      ok(await adjustQuantity(item.id, -3));
      ok(await updateProduct(item.id, { quantity: 20 }));
      const rows = (await rowsFor(item.id)).reverse();
      assert.deepEqual(rows.map(row => [row.reason, row.change, row.quantity]), [['created', 4, 4], ['count', 6, 10], ['adjusted', -3, 7], ['edited', 13, 20]]);
    });

    test('going to or from unlimited is written with no change', async () => {
      const item = await stocked('Switch', 4);
      ok(await setQuantity(item.id, ''));
      const [row] = await rowsFor(item.id);
      assert.equal(row.change, 0);
      assert.equal(row.quantity, -1);
    });

    test('a minimum price is optional, a whole number, and never above the price', async () => {
      const car = ok(await createProduct({ name: 'Floored car', price: 2500, minimumPrice: 500, status: 'published' }));
      assert.equal(car.minimumPrice, 500);
      assert.equal(ok(await createProduct({ name: 'No floor', price: 100 })).minimumPrice, null);
      refused(await createProduct({ name: 'Bad floor', price: 100, minimumPrice: 101 }), 400);
      refused(await createProduct({ name: 'Odd floor', price: 100, minimumPrice: 1.5 }), 400);
      refused(await createProduct({ name: 'Negative floor', price: 100, minimumPrice: -1 }), 400);
      assert.equal(ok(await updateProduct(car.id, { minimumPrice: 300 })).minimumPrice, 300);
      refused(await updateProduct(car.id, { minimumPrice: 9999 }), 400);
      refused(await updateProduct(car.id, { price: 200 }), 400);
      assert.equal(ok(await updateProduct(car.id, { minimumPrice: null })).minimumPrice, null);
    });

    test('the ledger survives the product being deleted, and can be read for one product', async () => {
      const item = await stocked('Short lived', 2);
      ok(await addLedgerEntry({ ref: 'o-gone', lines: [{ productId: item.id, change: -1 }] }));
      ok(await deleteProduct(item.id));
      assert.equal(ok(await getLedgerEntry('o-gone')).lines[0].name, 'Short lived');
      assert.equal((await rowsFor(item.id)).length, 2);
    });
  });
});
