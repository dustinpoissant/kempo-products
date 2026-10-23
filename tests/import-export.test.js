import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { sql } from 'drizzle-orm';
import db from 'kempo/server/db/index.js';
import {
  kempoProduct, kempoProductAttribute, kempoProductOption, kempoProductLedger, kempoProductTemplate,
} from '../server/db/schema.js';
import { createProduct, getProduct, getProducts } from '../server/utils/products.js';
import { createAttribute, getAttributes } from '../server/utils/attributes.js';
import { createTemplate } from '../server/utils/templates.js';
import { buildExport, importFile, parseImport } from '../server/utils/importExport.js';
import { parseCsv } from '../server/utils/csv.js';
import install from '../install.js';

/*
  Export and import against a real database. It skips itself when none is reachable, or when the
  database is not obviously a throwaway one (its name must end in _test): it empties the tables.
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
  for(const table of [kempoProductLedger, kempoProductOption, kempoProduct, kempoProductAttribute, kempoProductTemplate]) await db.delete(table);
};

const ok = ([error, value]) => {
  assert.equal(error, null, error?.msg);
  return value;
};

after(() => unitTier ? db.$client.close() : db.$client.end());

describe('import and export', { skip: reachable ? false : 'no throwaway database (set DATABASE_URL to one ending in _test)' }, () => {
  before(async () => {
    await install();
    await purge();
    ok(await createAttribute({ label: 'Scale', type: 'select', options: ['1:18', '1:24'] }));
    ok(await createAttribute({ label: 'Engine size', type: 'number' }));
    ok(await createProduct({
      name: 'Red car', price: 4999, status: 'published', quantity: 3, tags: ['red', 'muscle'], description: 'A red, fast car.\nWith a second line.',
      attributes: { scale: '1:18', engineSize: 5.7 },
      options: [{ label: 'Clear coat', choices: [{ label: 'Yes' }, { label: 'No', price: -100 }] }],
    }));
    ok(await createProduct({ name: '=cmd|\' /C calc\'!A0', price: 100, status: 'draft' }));
  });

  after(async () => {
    if(reachable) await purge();
  });

  test('a CSV export has a column per attribute and one row per product, with prices as decimals', async () => {
    const { body, filename, contentType } = ok(await buildExport({ format: 'csv' }));
    assert.equal(filename, 'products.csv');
    assert.match(contentType, /text\/csv/);
    const [header, ...rows] = parseCsv(body);
    assert.deepEqual(header.slice(0, 13), ['slug', 'name', 'template', 'status', 'availability', 'price', 'price_label', 'minimum_price', 'quantity', 'tags', 'categories', 'description', 'options']);
    assert.ok(header.includes('attribute.scale') && header.includes('attribute.engineSize'));
    assert.equal(rows.length, 2);
    const red = rows.find(row => row[0] === 'red-car');
    assert.equal(red[header.indexOf('price')], '49.99');
    assert.equal(red[header.indexOf('quantity')], '3');
    assert.equal(red[header.indexOf('tags')], 'red, muscle');
    assert.equal(red[header.indexOf('attribute.scale')], '1:18');
    assert.equal(JSON.parse(red[header.indexOf('options')])[0].choices[1].price, -100);
  });

  test('a product name that a spreadsheet would run as a formula is exported as text', async () => {
    const { body } = ok(await buildExport({ format: 'csv' }));
    assert.ok(!/^=/m.test(body), 'no line starts with a formula');
    assert.ok(body.includes("'=cmd"));
  });

  test('a JSON export carries the attributes as well', async () => {
    const data = JSON.parse(ok(await buildExport({ format: 'json' })).body);
    assert.equal(data.format, 'kempo-products');
    assert.deepEqual(data.attributes.map(attribute => attribute.key).sort(), ['engineSize', 'scale']);
    assert.equal(data.products.find(product => product.slug === 'red-car').price, 4999);
  });

  test('importing the file back changes nothing and skips what is there', async () => {
    const { body } = ok(await buildExport({ format: 'csv' }));
    const result = ok(await importFile(body));
    assert.deepEqual([result.created, result.updated, result.skipped, result.errors.length], [0, 0, 2, 0]);
  });

  test('a dry run reports without changing anything', async () => {
    const csv = 'name,price\nBrand new,10.00\nRed car,1.00';
    const result = ok(await importFile(csv, { dryRun: true, onMatch: 'update' }));
    assert.deepEqual([result.created, result.updated], [1, 1]);
    assert.equal(ok(await getProducts({ q: 'Brand new' })).total, 0);
    assert.equal(ok(await getProduct('red-car')).price, 4999);
  });

  test('new products are created from a spreadsheet with the defaults', async () => {
    const csv = 'Name,Price,Quantity,Tags,FIELD.SCALE\nBlue car,25.50,,"blue, fast",1:24\n';
    const result = ok(await importFile(csv));
    assert.equal(result.created, 1, JSON.stringify(result.errors));
    const blue = ok(await getProduct('blue-car'));
    assert.equal(blue.price, 2550);
    assert.equal(blue.quantity, -1, 'an empty quantity cell is unlimited');
    assert.equal(blue.status, 'draft');
    assert.deepEqual(blue.tags, ['blue', 'fast']);
    assert.equal(blue.attributes.scale, '1:24', 'attribute columns match whatever the case');
  });

  test('updating changes only what the file has, and leaves empty cells alone', async () => {
    const result = ok(await importFile('slug,name,price,description\nred-car,Red car,59.00,', { onMatch: 'update' }));
    assert.equal(result.updated, 1);
    const red = ok(await getProduct('red-car'));
    assert.equal(red.price, 5900);
    assert.match(red.description, /second line/, 'the empty description did not clear it');
    assert.equal(red.quantity, 3);
    assert.equal(red.options.length, 1, 'options were not in the file, so they are unchanged');
  });

  test('options in a spreadsheet are JSON in one cell', async () => {
    const options = JSON.stringify([{ label: 'Wheels', choices: [{ label: 'Quantity' }, { label: 'Chrome', price: 500 }] }]);
    const csv = `name,price,options\nWheeled,10,"${options.replace(/"/g, '""')}"`;
    ok(await importFile(csv));
    const wheeled = ok(await getProduct('wheeled'));
    assert.equal(wheeled.options[0].choices[1].price, 500);
  });

  test('rows that cannot be read are reported with their line, and the rest carry on', async () => {
    const csv = ['name,status,price,options', 'Fine,published,5.00,', ',published,1.00,', 'Bad status,live,1.00,', 'Bad price,draft,abc,', 'Bad json,draft,1.00,{nope'].join('\n');
    const result = ok(await importFile(csv));
    assert.equal(result.created, 1);
    assert.deepEqual(result.errors.map(error => error.line), [3, 4, 5, 6]);
    assert.match(result.errors[0].message, /name is required/);
    assert.match(result.errors[1].message, /status must be one of/);
    assert.match(result.errors[2].message, /not an amount/);
    assert.match(result.errors[3].message, /options is not valid JSON/);
    assert.equal(ok(await getProducts({ q: 'Fine' })).total, 1);
  });

  test('a file the importer cannot understand is refused with a message', async () => {
    assert.equal((await importFile('')).at(0).code, 400);
    assert.match((await importFile('price\n1')).at(0).msg, /"name" column/);
    assert.match((await importFile('name\n"never closed')).at(0).msg, /never closed/);
    assert.match((await importFile('{ not json')).at(0).msg, /not valid JSON/);
    assert.match((await importFile('{"a":1}')).at(0).msg, /list of products/);
    assert.equal((await importFile('name\nx', { onMatch: 'delete' })).at(0).code, 400);
  });

  test('a JSON export imports into an empty catalog, creating the attributes too', async () => {
    const { body } = ok(await buildExport({ format: 'json' }));
    await purge();
    const result = ok(await importFile(body));
    assert.equal(result.errors.length, 0, JSON.stringify(result.errors));
    assert.equal(result.created, ok(JSON.parse(body) && [null, JSON.parse(body).products.length]));
    assert.deepEqual(ok(await getAttributes()).map(attribute => attribute.key).sort(), ['engineSize', 'scale']);
    const red = ok(await getProduct('red-car'));
    assert.equal(red.price, 5900);
    assert.equal(red.attributes.engineSize, 5.7);
    assert.equal(red.options[0].choices[1].price, -100);
    assert.equal(red.quantity, 3);
  });

  test('parsing alone reads rows without touching the database', async () => {
    const parsed = ok(await parseImport('name,price\nA,1.00\nB,2.00'));
    assert.equal(parsed.rows.length, 2);
    assert.equal(parsed.rows[1].slug, 'b');
    assert.equal(parsed.format, 'csv');
  });

  test('a JSON export carries the templates and the template of each product, and a CSV can name one', async () => {
    await purge();
    ok(await createTemplate({ name: 'Model car', defaults: { } }));
    ok(await createProduct({ name: 'From a template', price: 100, template: 'model-car', attributeDefs: [{ label: 'Engine', type: 'text' }], attributes: { engine: 'V8' } }));
    const { body } = ok(await buildExport({ format: 'json' }));
    assert.deepEqual(JSON.parse(body).templates.map(template => template.key), ['model-car']);
    await purge();
    const result = ok(await importFile(body));
    assert.equal(result.errors.length, 0, JSON.stringify(result.errors));
    const product = ok(await getProduct('from-a-template'));
    assert.equal(product.template, 'model-car');
    assert.deepEqual(product.attributes, { engine: 'V8' });
    const csv = ok(await importFile('name,template\nFrom a csv,Model car\nNo such,Spaceship\n'));
    assert.equal(csv.created, 1);
    assert.match(csv.errors[0].message, /no template "Spaceship"/);
    assert.equal(ok(await getProduct('from-a-csv')).template, 'model-car');
  });

  test('a file exported before attributes were called that still imports its field columns and keys', async () => {
    await purge();
    ok(await createAttribute({ label: 'Scale', type: 'select', options: ['1:18', '1:24'] }));
    const csv = ok(await importFile('name,field.scale\nLegacy csv,1:24\n'));
    assert.equal(csv.created, 1, JSON.stringify(csv.errors));
    assert.equal(ok(await getProduct('legacy-csv')).attributes.scale, '1:24');
    const json = ok(await importFile(JSON.stringify({ products: [{ name: 'Legacy json', fields: { scale: '1:18' } }] })));
    assert.equal(json.created, 1, JSON.stringify(json.errors));
    assert.equal(ok(await getProduct('legacy-json')).attributes.scale, '1:18');
  });
});
