import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { sql } from 'drizzle-orm';
import db from 'kempo/server/db/index.js';
import {
  kempoProduct, kempoProductType, kempoProductField, kempoProductOption, kempoProductPurchase,
} from '../server/db/schema.js';
import {
  createProduct, updateProduct, deleteProduct, getProduct, getProducts, setStock, adjustStock, setManagedBy,
  setChoiceAvailability, getPrice, unregisterProducts,
} from '../server/utils/products.js';
import { createType, deleteType, registerType, getTypes, unregisterTypes } from '../server/utils/types.js';
import { createField, updateField, deleteField, registerField, getFields, unregisterFields } from '../server/utils/fields.js';
import { recordPurchase, reversePurchase, getPurchase } from '../server/utils/purchases.js';
import install from '../install.js';

/*
  The extension against a real database. It skips itself when none is reachable, or when the
  database is not obviously a throwaway one: it empties every table first, so it must never run
  against real data.

  Requires Postgres carrying kempo's schema and this extension's (`npx drizzle-kit push --force`),
  with DATABASE_URL set to a database whose name ends in _test.
*/
const url = process.env.DATABASE_URL ?? '';
const reachable = /_test$/.test(url.split('?')[0]) && await db.execute(sql`select 1`).then(() => true).catch(() => false);

const purge = async () => {
  for(const table of [kempoProductPurchase, kempoProductOption, kempoProduct, kempoProductField, kempoProductType]){
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

after(() => db.$client.end());

describe('data layer', { skip: reachable ? false : 'no throwaway database (set DATABASE_URL to one ending in _test)' }, () => {
  before(async () => {
    await install();
    await purge();
  });

  after(async () => {
    if(reachable) await purge();
  });

  describe('types and fields', () => {
    test('a type gets a key from its name, and can be created once', async () => {
      const type = ok(await createType({ name: 'Model car' }));
      assert.equal(type.key, 'model-car');
      refused(await createType({ name: 'Model car' }), 409);
    });

    test('a field is scoped to a type, and a key cannot collide across scopes', async () => {
      const scoped = ok(await createField({ label: 'Scale', type: 'select', options: ['1:18', '1:24'], productType: 'model-car' }));
      assert.equal(scoped.productType, 'model-car');
      refused(await createField({ label: 'Scale', type: 'text', productType: 'model-car' }), 409);
      ok(await createField({ label: 'Brand', type: 'text' }));
      refused(await createField({ label: 'Brand', type: 'text', productType: 'model-car' }), 409);
      refused(await createField({ label: 'Nope', type: 'text', productType: 'missing-type' }), 400);
    });

    test('a field type can only change where nothing is lost', async () => {
      refused(await updateField('brand', { type: 'number' }), 409);
      assert.equal(ok(await updateField('brand', { type: 'longtext' })).type, 'longtext');
    });

    test('a type that products or fields use cannot be deleted', async () => {
      refused(await deleteType('model-car'), 409);
    });

    test('an extension owns what it registers; people cannot delete it', async () => {
      ok(await registerType('ext-a', { name: 'Vehicle' }));
      ok(await registerType('ext-a', { name: 'Vehicle' }));
      refused(await registerType('ext-b', { name: 'Vehicle' }), 409);
      refused(await deleteType('vehicle'), 403);
      ok(await registerField('ext-a', { label: 'Mileage', type: 'number', productType: 'vehicle' }));
      refused(await deleteField('mileage', { productType: 'vehicle' }), 403);
      refused(await updateField('mileage', { type: 'text' }, { productType: 'vehicle' }), 409);
      assert.equal(ok(await updateField('mileage', { label: 'Odometer' }, { productType: 'vehicle' })).label, 'Odometer');
    });

    test('unregistering removes what an extension owns', async () => {
      ok(await unregisterFields('ext-a'));
      ok(await unregisterTypes('ext-a'));
      assert.equal(ok(await getTypes({ owner: 'ext-a' })).length, 0);
      assert.equal(ok(await getFields({ owner: 'ext-a' })).length, 0);
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

    test('products start as drafts, available, with unlimited stock and no price', async () => {
      const product = ok(await createProduct({ name: 'Draft thing' }));
      assert.equal(product.status, 'draft');
      assert.equal(product.availability, 'available');
      assert.equal(product.stock, -1);
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

    test('field values are validated against the product type, merged on update and cleared when empty', async () => {
      const car = ok(await createProduct({ name: 'Typed car', type: 'model-car', fields: { scale: '1:18', brand: 'Acme' } }));
      assert.deepEqual(car.fields, { scale: '1:18', brand: 'Acme' });
      refused(await createProduct({ name: 'Bad scale', type: 'model-car', fields: { scale: '1:99' } }), 400);
      refused(await createProduct({ name: 'Unknown', fields: { nonsense: 1 } }), 400);
      const merged = ok(await updateProduct(car.id, { fields: { brand: '' } }));
      assert.deepEqual(merged.fields, { scale: '1:18' });
      refused(await createProduct({ name: 'No such type', type: 'nope' }), 400);
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
      ok(await createType({ name: 'Model car' }));
      ok(await createField({ label: 'Scale', type: 'select', options: ['1:18', '1:24'], productType: 'model-car' }));
      ok(await createProduct({ name: 'Red car', type: 'model-car', price: 3000, status: 'published', tags: ['Red'], fields: { scale: '1:18' } }));
      ok(await createProduct({ name: 'Blue car', type: 'model-car', price: 2000, status: 'published', fields: { scale: '1:24' } }));
      ok(await createProduct({ name: 'Hidden', status: 'draft' }));
      const all = ok(await getProducts({}));
      assert.equal(all.total, 3);
      assert.deepEqual(ok(await getProducts({ status: 'published', sort: 'price-asc' })).items.map(p => p.name), ['Blue car', 'Red car']);
      assert.deepEqual(ok(await getProducts({ q: 'blue' })).items.map(p => p.name), ['Blue car']);
      assert.deepEqual(ok(await getProducts({ filters: { scale: '1:18' } })).items.map(p => p.name), ['Red car']);
      assert.deepEqual(ok(await getProducts({ tag: 'red' })).items.map(p => p.name), ['Red car']);
      assert.deepEqual(ok(await getProducts({ type: '' })).items.map(p => p.name), ['Hidden']);
      assert.equal(ok(await getProducts({ limit: 1 })).items.length, 1);
      assert.equal(ok(await getProducts({ ids: [] })).total, 0);
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

  describe('stock', () => {
    test('stock can be set, adjusted and never goes below zero', async () => {
      const product = ok(await createProduct({ name: 'Stocked', stock: 3 }));
      assert.equal(ok(await adjustStock(product.id, -2)).stock, 1);
      refused(await adjustStock(product.id, -2), 409);
      assert.equal(ok(await getProduct(product.id)).stock, 1);
      assert.equal(ok(await setStock(product.id, 10)).stock, 10);
      assert.equal(ok(await setStock(product.id, -1)).stock, -1);
      assert.equal(ok(await adjustStock(product.id, -5)).stock, -1);
    });

    test('a managed product keeps its stock and choice availability away from everyone else', async () => {
      const product = ok(await createProduct({
        name: 'Managed', stock: 5,
        options: [{ label: 'Color', choices: [{ label: 'Red' }, { label: 'Blue' }] }],
      }));
      ok(await setManagedBy(product.id, 'connector'));
      refused(await setManagedBy(product.id, 'someone-else'), 409);
      refused(await setStock(product.id, 1), 403);
      refused(await adjustStock(product.id, -1), 403);
      refused(await updateProduct(product.id, { stock: 1 }), 403);
      refused(await setChoiceAvailability(product.id, 'color', 'red', false), 403);
      assert.equal(ok(await updateProduct(product.id, { stock: 5, description: 'still editable' })).description, 'still editable');
      assert.equal(ok(await setStock(product.id, 2, { actor: 'connector' })).stock, 2);
      const out = ok(await setChoiceAvailability(product.id, 'color', 'red', false, { actor: 'connector' }));
      assert.equal(out.options[0].choices[0].available, false);
      const edited = ok(await updateProduct(product.id, { options: [{ label: 'Color', choices: [{ label: 'Red', available: true }, { label: 'Blue' }] }] }));
      assert.equal(edited.options[0].choices[0].available, false, 'a person cannot flip a managed choice back');
      ok(await setManagedBy(product.id, ''));
      assert.equal(ok(await setStock(product.id, 9)).stock, 9);
    });
  });

  describe('purchases', () => {
    const live = (name, extra = {}) => createProduct({ name, price: 1000, status: 'published', ...extra }).then(ok);

    test('recording prices the lines from the catalog and takes stock', async () => {
      const car = await live('Car', { stock: 5, options: [{ label: 'Clear coat', choices: [{ label: 'Yes' }, { label: 'No', price: -100 }] }] });
      const purchase = ok(await recordPurchase({ ref: 'order-1', lines: [{ productId: car.id, quantity: 2, options: { 'clear-coat': 'no' } }] }));
      assert.equal(purchase.total, 1800);
      assert.equal(purchase.lines[0].unitPrice, 900);
      assert.equal(purchase.lines[0].optionLines[0].choiceLabel, 'No');
      assert.equal(ok(await getProduct(car.id)).stock, 3);
    });

    test('the same ref cannot be recorded twice', async () => {
      const item = await live('Once', { stock: 5 });
      ok(await recordPurchase({ ref: 'order-twice', lines: [{ productId: item.id }] }));
      refused(await recordPurchase({ ref: 'order-twice', lines: [{ productId: item.id }] }), 409);
      assert.equal(ok(await getProduct(item.id)).stock, 4);
    });

    test('a purchase is all or nothing across its lines', async () => {
      const plenty = await live('Plenty', { stock: 5 });
      const scarce = await live('Scarce', { stock: 1 });
      refused(await recordPurchase({ ref: 'order-partial', lines: [{ productId: plenty.id }, { productId: scarce.id, quantity: 2 }] }), 409);
      assert.equal(ok(await getProduct(plenty.id)).stock, 5);
      assert.equal(ok(await getProduct(scarce.id)).stock, 1);
      assert.equal((await getPurchase('order-partial'))[0].code, 404, 'nothing was recorded');
    });

    test('two lines for one product share its stock', async () => {
      const item = await live('Shared', { stock: 3 });
      refused(await recordPurchase({ ref: 'order-shared', lines: [{ productId: item.id, quantity: 2 }, { productId: item.id, quantity: 2 }] }), 409);
      assert.equal(ok(await getProduct(item.id)).stock, 3);
    });

    test('unlimited stock is never taken', async () => {
      const item = await live('Unlimited');
      ok(await recordPurchase({ ref: 'order-unlimited', lines: [{ productId: item.id, quantity: 50 }] }));
      assert.equal(ok(await getProduct(item.id)).stock, -1);
    });

    test('a product that cannot be bought refuses, and says why', async () => {
      const draft = ok(await createProduct({ name: 'Not live', price: 100 }));
      assert.match(refused(await recordPurchase({ ref: 'o-draft', lines: [{ productId: draft.id }] }), 409).msg, /not for sale/);
      const sold = await live('Sold out', { availability: 'sold' });
      assert.match(refused(await recordPurchase({ ref: 'o-sold', lines: [{ productId: sold.id }] }), 409).msg, /sold/);
      const empty = await live('Empty', { stock: 0 });
      assert.match(refused(await recordPurchase({ ref: 'o-empty', lines: [{ productId: empty.id }] }), 409).msg, /out of stock/);
      refused(await recordPurchase({ ref: 'o-missing', lines: [{ productId: 'ffffffffffffffff' }] }), 404);
    });

    test('a missing required option is refused', async () => {
      const car = await live('Picky', { options: [{ label: 'Color', choices: [{ label: 'Red' }] }] });
      refused(await recordPurchase({ ref: 'o-opt', lines: [{ productId: car.id }] }), 400);
    });

    test('a manual record may price a product that has none, and ignores whether it is for sale', async () => {
      const priceless = ok(await createProduct({ name: 'Call for price', stock: 2 }));
      refused(await recordPurchase({ ref: 'm-1', lines: [{ productId: priceless.id }] }), 409);
      const purchase = ok(await recordPurchase({ ref: 'm-2', lines: [{ productId: priceless.id, unitPrice: 12345 }] }, { manual: true }));
      assert.equal(purchase.total, 12345);
      assert.equal(ok(await getProduct(priceless.id)).stock, 1);
    });

    test('malformed purchases are refused', async () => {
      refused(await recordPurchase({ lines: [{ productId: 'x' }] }), 400);
      refused(await recordPurchase({ ref: 'r', lines: [] }), 400);
      refused(await recordPurchase({ ref: 'r', lines: [{ productId: 'x', quantity: 0 }] }), 400);
      refused(await recordPurchase({ ref: 'r', lines: [{ productId: 'x', quantity: 1.5 }] }), 400);
    });

    test('reversing puts stock back once', async () => {
      const item = await live('Returnable', { stock: 5 });
      ok(await recordPurchase({ ref: 'o-rev', lines: [{ productId: item.id, quantity: 3 }] }));
      assert.equal(ok(await getProduct(item.id)).stock, 2);
      assert.equal(ok(await reversePurchase('o-rev')).status, 'reversed');
      assert.equal(ok(await getProduct(item.id)).stock, 5);
      refused(await reversePurchase('o-rev'), 409);
      refused(await reversePurchase('never-recorded'), 404);
      assert.equal(ok(await getProduct(item.id)).stock, 5);
    });

    test('a reversed ref cannot be reused', async () => {
      const item = await live('Reuse', { stock: 5 });
      ok(await recordPurchase({ ref: 'o-reuse', lines: [{ productId: item.id }] }));
      ok(await reversePurchase('o-reuse'));
      refused(await recordPurchase({ ref: 'o-reuse', lines: [{ productId: item.id }] }), 409);
    });

    test('the record survives the product being deleted', async () => {
      const item = await live('Short lived', { stock: 2 });
      ok(await recordPurchase({ ref: 'o-gone', lines: [{ productId: item.id }] }));
      ok(await deleteProduct(item.id));
      const purchase = ok(await getPurchase('o-gone'));
      assert.equal(purchase.lines[0].name, 'Short lived');
      assert.equal(ok(await reversePurchase('o-gone')).status, 'reversed');
    });
  });
});
