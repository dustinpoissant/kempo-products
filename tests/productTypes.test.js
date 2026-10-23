import { test, before, describe } from 'node:test';
import assert from 'node:assert/strict';
import { sql, eq } from 'drizzle-orm';
import db from 'kempo/server/db/index.js';
import { kempoProduct, kempoProductType } from '../server/db/schema.js';
import { createProduct, updateProduct, getProduct } from '../server/utils/products.js';
import { registerProductType, unregisterProductTypes, getProductTypes, needsShippingFor, GENERIC, CREDITS_ONLY } from '../server/utils/productTypes.js';
import install from '../install.js';

/*
  Product types: what kind of product something is. The built-in generic type is there on every site, an extension
  registers its own, a product is one of them, and only the types that exist can be used. Runs against the
  same database as the rest of the suite and empties the products it makes.
*/

const ok = ([error, value]) => {
  assert.equal(error, null, error?.msg);
  return value;
};

const refused = ([error, value], code) => {
  assert.equal(value, null);
  assert.ok(error, 'expected an error');
  if(code) assert.equal(error.code, code, error.msg);
  return error;
};

const purge = async () => {
  await db.delete(kempoProduct);
  await db.delete(kempoProductType).where(sql`"owner" <> ''`);
};

const typesNow = async () => ok(await getProductTypes());

before(async () => {
  await install();
  await purge();
});

describe('product types', () => {
  test('every site has the built-in generic type, which needs no shipping, and nothing else', async () => {
    const types = await typesNow();
    const generic = types.find(type => type.key === GENERIC);
    assert.ok(generic);
    assert.equal(generic.name, 'Generic Product');
    assert.equal(generic.needsShipping, false);
    assert.equal(generic.owner, '');
    assert.deepEqual(types.map(type => type.key), [GENERIC]);
  });

  test('a product is generic unless told otherwise, and credits-only is derived for older readers', async () => {
    const plain = ok(await createProduct({ name: 'A mug', price: 1200 }));
    assert.equal(plain.productType, GENERIC);
    assert.equal(plain.creditsOnly, false);
    const read = ok(await getProduct(plain.id));
    assert.equal(read.productType, GENERIC);
  });

  test('a type that does not exist is refused, on create and on update', async () => {
    refused(await createProduct({ name: 'Nope', price: 100, productType: 'digital-download' }), 400);
    const mug = ok(await createProduct({ name: 'Mug two', price: 100 }));
    refused(await updateProduct(mug.id, { productType: 'activation-code' }), 400);
  });

  test('an extension registers its type, owns it, and removes it when nothing uses it', async () => {
    const registered = ok(await registerProductType('fixture-digital', { key: 'digital-download', name: 'Digital Download', needsShipping: false }));
    assert.equal(registered.owner, 'fixture-digital');
    ok(await registerProductType('fixture-digital', { key: 'digital-download', name: 'Digital download', needsShipping: false }));
    refused(await registerProductType('someone-else', { key: 'digital-download', name: 'Taken' }), 409);
    refused(await registerProductType('fixture-digital', { key: GENERIC, name: 'Taken too' }), 409);

    const model = ok(await createProduct({ name: 'A 3D model', price: 500, productType: 'digital-download' }));
    assert.equal(model.productType, 'digital-download');
    refused(await unregisterProductTypes('fixture-digital'), 409);

    await db.delete(kempoProduct).where(eq(kempoProduct.id, model.id));
    assert.equal(ok(await unregisterProductTypes('fixture-digital')).removed, 1);
    assert.equal((await typesNow()).some(type => type.key === 'digital-download'), false);
  });

  test('the built-in types cannot be removed by an extension', async () => {
    assert.equal(ok(await unregisterProductTypes('fixture-digital')).removed, 0);
    assert.ok((await typesNow()).some(type => type.key === GENERIC));
  });

  test('an extension can register physical items, which are shipped, and credits-only, which are not', async () => {
    const physical = ok(await registerProductType('kempo-shipping', { key: 'physical', name: 'Physical Item' }));
    assert.equal(physical.needsShipping, true);
    ok(await unregisterProductTypes('kempo-shipping'));
    const credits = ok(await registerProductType('kempo-credits', { key: CREDITS_ONLY, name: 'Credits Only', needsShipping: false }));
    assert.equal(credits.needsShipping, false);
    ok(await unregisterProductTypes('kempo-credits'));
  });

  test('a type nobody registers any more still says whether it is shipped, from the old flag', async () => {
    assert.equal(needsShippingFor([], CREDITS_ONLY, { creditsOnly: true }), false);
    assert.equal(needsShippingFor([], 'a-removed-type'), true);
    assert.equal(needsShippingFor([{ key: 'digital-download', needsShipping: false }], 'digital-download'), false);
  });
});
