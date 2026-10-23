import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { sql } from 'drizzle-orm';
import db from 'kempo/server/db/index.js';
import { kempoProduct, kempoProductCategory, kempoProductOption, kempoProductLedger, kempoProductAttribute } from '../server/db/schema.js';
import { createProduct, updateProduct, getProduct, getProducts } from '../server/utils/products.js';
import { createCategory, updateCategory, deleteCategory, getCategories, getCategory, categoryKeyFromName } from '../server/utils/categories.js';
import { buildExport, importFile } from '../server/utils/importExport.js';
import { parseCsv } from '../server/utils/csv.js';
import install from '../install.js';

/*
  Categories group products for browsing. A product is of one type but can be in any number of
  categories, and a category's key (made from its name, used in /products/?category=model-cars) never
  changes. Like data-layer.test.js this needs a throwaway database: the in-memory one of the unit tier,
  or one named *_test.
*/
const url = process.env.DATABASE_URL ?? '';
const unitTier = process.env.KEMPO_DB === 'pglite';
const reachable = (unitTier || /_test$/.test(url.split('?')[0])) && await db.execute(sql`select 1`).then(() => true).catch(() => false);

if(!reachable && process.env.KEMPO_TEST_TIER === 'integration'){
  throw new Error('The integration tier needs DATABASE_URL pointing at a throwaway Postgres named *_test with the schema applied (npx drizzle-kit push --force).');
}

const purge = async () => {
  for(const table of [kempoProductLedger, kempoProductOption, kempoProduct, kempoProductAttribute, kempoProductCategory]){
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

describe('categories', { skip: reachable ? false : 'no throwaway database (set DATABASE_URL to one ending in _test)' }, () => {
  before(async () => {
    await install();
    await purge();
  });

  after(async () => {
    if(reachable) await purge();
  });

  test('a category gets its key from its name, and a key can be used once', async () => {
    assert.equal(ok(await createCategory({ name: 'Model Cars' })).key, 'model-cars');
    assert.equal(ok(await createCategory({ name: '3D Printed!' })).key, '3d-printed');
    assert.equal(ok(await createCategory({ name: 'Paint', key: 'paints' })).key, 'paints');
    refused(await createCategory({ name: 'model cars' }), 409);
    assert.equal(categoryKeyFromName('  Crème brûlée & more  '), 'creme-brulee-more');
  });

  test('a category needs a name with something in it, and a short description', async () => {
    refused(await createCategory({ name: '   ' }), 400);
    refused(await createCategory({ name: '!!!' }), 400);
    refused(await createCategory({ name: 'x'.repeat(101) }), 400);
    refused(await createCategory({ name: 'Fine', description: 'x'.repeat(501) }), 400);
    refused(await createCategory({ name: 'Fine', key: 'Not Valid' }), 400);
  });

  test('categories come in order, each counting its published products and all of them', async () => {
    ok(await createCategory({ name: 'Zebra', position: 5 }));
    ok(await createCategory({ name: 'Aardvark', position: 5 }));
    ok(await createProduct({ name: 'Live one', status: 'published', categories: ['zebra'] }));
    ok(await createProduct({ name: 'Draft one', status: 'draft', categories: ['zebra'] }));
    const categories = ok(await getCategories());
    const names = categories.map(category => category.name);
    assert.ok(names.indexOf('Aardvark') < names.indexOf('Zebra'), 'equal positions are by name');
    assert.ok(names.indexOf('Model Cars') < names.indexOf('Aardvark'), 'position 0 is first');
    const zebra = categories.find(category => category.key === 'zebra');
    assert.equal(zebra.count, 1, 'published only');
    assert.equal(zebra.total, 2, 'every status');
  });

  test('a product is put in categories when it is made or edited, and sees them in its shape', async () => {
    const product = ok(await createProduct({ name: 'Camaro', categories: ['model-cars', '3d-printed'] }));
    assert.deepEqual(product.categories, ['model-cars', '3d-printed']);
    assert.deepEqual(ok(await getProduct(product.id)).categories, ['model-cars', '3d-printed']);

    const edited = ok(await updateProduct(product.id, { categories: ['paints'] }));
    assert.deepEqual(edited.categories, ['paints'], 'replaces the list');
    assert.deepEqual(ok(await updateProduct(product.id, { name: 'Camaro Z/28' })).categories, ['paints'], 'an edit that does not mention them leaves them');
    assert.deepEqual(ok(await updateProduct(product.id, { categories: [] })).categories, [], 'an empty list clears them');
    assert.deepEqual(ok(await createProduct({ name: 'Plain one' })).categories, [], 'none by default');
  });

  test('categories are tidied, and one that does not exist is refused', async () => {
    const tidy = ok(await createProduct({ name: 'Tidy', categories: [' Paints ', 'paints', 'MODEL-CARS'] }));
    assert.deepEqual(tidy.categories, ['paints', 'model-cars']);
    assert.deepEqual(ok(await createProduct({ name: 'Comma', categories: 'paints, model-cars' })).categories, ['paints', 'model-cars']);
    assert.match(refused(await createProduct({ name: 'Bad', categories: ['paints', 'nope'] }), 400).msg, /no category "nope"/);
    refused(await createProduct({ name: 'Bad', categories: { not: 'a list' } }), 400);
    refused(await updateProduct(tidy.id, { categories: ['nope'] }), 400);
    assert.deepEqual(ok(await getProduct(tidy.id)).categories, ['paints', 'model-cars'], 'a refused edit changes nothing');
  });

  test('the list can be limited to a category, or to several at once', async () => {
    const both = ok(await createProduct({ name: 'In both', status: 'published', categories: ['paints', 'model-cars'] }));
    const one = ok(await createProduct({ name: 'In one', status: 'published', categories: ['paints'] }));
    const inPaints = ok(await getProducts({ category: 'paints', status: 'published' })).items.map(product => product.id);
    assert.ok(inPaints.includes(both.id) && inPaints.includes(one.id));
    const inBoth = ok(await getProducts({ category: ['paints', 'model-cars'] })).items.map(product => product.id);
    assert.ok(inBoth.includes(both.id) && !inBoth.includes(one.id), 'several means every one of them');
    assert.equal(ok(await getProducts({ category: 'nope' })).items.length, 0);
    assert.equal(ok(await getProducts({ category: ' PAINTS ' })).items.some(product => product.id === one.id), true, 'tidied like tags');
  });

  test('anyone may categorise a product an extension owns, since only its name, slug and type are the owner\'s', async () => {
    const owned = ok(await createProduct({ name: 'Owned', categories: [] }, { owner: 'kempo-ext' }));
    assert.deepEqual(ok(await updateProduct(owned.id, { categories: ['paints'] })).categories, ['paints']);
    refused(await updateProduct(owned.id, { name: 'Renamed' }), 403);
  });

  test('a category can be renamed and described, but its key and anything else cannot change', async () => {
    const renamed = ok(await updateCategory('paints', { name: 'Paints and finishes', description: 'Colour', position: 3 }));
    assert.equal(renamed.name, 'Paints and finishes');
    assert.equal(renamed.key, 'paints');
    assert.equal(renamed.position, 3);
    refused(await updateCategory('paints', { key: 'other' }), 400);
    refused(await updateCategory('paints', { owner: 'x' }), 400);
    refused(await updateCategory('paints', {}), 400);
    refused(await updateCategory('paints', { name: '' }), 400);
    refused(await updateCategory('nope', { name: 'x' }), 404);
    assert.equal(ok(await getCategory('paints')).name, 'Paints and finishes');
  });

  test('deleting a category takes it off its products and leaves them, and the other categories', async () => {
    const product = ok(await createProduct({ name: 'Goes on', categories: ['paints', 'model-cars'] }));
    const before = ok(await getCategories()).find(category => category.key === 'paints').total;
    const result = ok(await deleteCategory('paints'));
    assert.equal(result.removedFrom, before);
    assert.deepEqual(ok(await getProduct(product.id)).categories, ['model-cars']);
    refused(await getCategory('paints'), 404);
    refused(await deleteCategory('paints'), 404);
    refused(await createProduct({ name: 'Too late', categories: ['paints'] }), 400);
  });

  test('a key that merely starts like a deleted one is not touched', async () => {
    ok(await createCategory({ name: 'Cars' }));
    ok(await createCategory({ name: 'Cars and trucks' }));
    const product = ok(await createProduct({ name: 'Both', categories: ['cars', 'cars-and-trucks'] }));
    ok(await deleteCategory('cars'));
    assert.deepEqual(ok(await getProduct(product.id)).categories, ['cars-and-trucks']);
  });

  describe('moving a catalog with its categories', () => {
    test('an export carries each product\'s categories, and the categories themselves in JSON', async () => {
      ok(await createCategory({ name: 'Export me', description: 'Shown on the site' }));
      ok(await createProduct({ name: 'Exported', status: 'published', categories: ['export-me', 'cars-and-trucks'] }));

      const csv = ok(await buildExport({ format: 'csv' })).body;
      const [header, ...rows] = parseCsv(csv);
      const row = rows.find(candidate => candidate[header.indexOf('name')] === 'Exported');
      assert.equal(header[header.indexOf('tags') + 1], 'categories');
      assert.equal(row[header.indexOf('categories')], 'export-me, cars-and-trucks');

      const json = JSON.parse(ok(await buildExport({ format: 'json' })).body);
      assert.deepEqual(json.categories.find(category => category.key === 'export-me'), { key: 'export-me', name: 'Export me', description: 'Shown on the site', position: 0 });
      assert.deepEqual(json.products.find(product => product.name === 'Exported').categories, ['export-me', 'cars-and-trucks']);
    });

    test('a spreadsheet can name a category by its key or its name, and one the site lacks is reported', async () => {
      const csv = [
        'slug,name,categories',
        'by-key,By key,export-me',
        'by-name,By name,"EXPORT ME, Cars and trucks"',
        'unknown,Unknown,"export-me, no-such-thing"',
      ].join('\n');
      const result = ok(await importFile(csv));
      assert.equal(result.created, 2);
      assert.equal(result.errors.length, 1);
      assert.match(result.errors[0].message, /no category "no-such-thing"/);
      assert.deepEqual(ok(await getProduct('by-key')).categories, ['export-me']);
      assert.deepEqual(ok(await getProduct('by-name')).categories, ['export-me', 'cars-and-trucks']);
      refused(await getProduct('unknown'), 404);
    });

    test('an empty categories cell leaves a product\'s categories alone, and a filled one replaces them', async () => {
      ok(await importFile('slug,name,categories\nby-key,By key,', { onMatch: 'update' }));
      assert.deepEqual(ok(await getProduct('by-key')).categories, ['export-me']);
      ok(await importFile('slug,name,categories\nby-key,By key,cars-and-trucks', { onMatch: 'update' }));
      assert.deepEqual(ok(await getProduct('by-key')).categories, ['cars-and-trucks']);
    });

    test('a JSON file brings its categories with it, so a catalog can move between sites', async () => {
      const file = ok(await buildExport({ format: 'json' })).body;
      await db.delete(kempoProduct);
      await db.delete(kempoProductCategory);

      const result = ok(await importFile(file));
      assert.equal(result.errors.length, 0, JSON.stringify(result.errors));
      assert.ok(ok(await getCategories()).some(category => category.key === 'export-me' && category.description === 'Shown on the site'));
      assert.deepEqual(ok(await getProduct('exported')).categories, ['export-me', 'cars-and-trucks']);
    });

    test('a dry run counts the categories a JSON file would create as available', async () => {
      const file = JSON.stringify({ categories: [{ key: 'brand-new', name: 'Brand new' }], products: [{ name: 'Dry run one', categories: ['brand-new'] }] });
      const result = ok(await importFile(file, { dryRun: true }));
      assert.equal(result.errors.length, 0, JSON.stringify(result.errors));
      assert.equal(result.created, 1);
      refused(await getCategory('brand-new'), 404);
    });
  });
});
