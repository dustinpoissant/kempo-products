import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { sql } from 'drizzle-orm';
import db from 'kempo/server/db/index.js';
import {
  kempoProduct, kempoProductType, kempoProductField, kempoProductOption, kempoProductPurchase,
} from '../server/db/schema.js';
import { createProduct, getProduct, getProducts } from '../server/utils/products.js';
import { createType, getTypes } from '../server/utils/types.js';
import { createField, getFields } from '../server/utils/fields.js';
import { buildExport, importFile, parseImport } from '../server/utils/importExport.js';
import { parseCsv } from '../server/utils/csv.js';
import install from '../install.js';

/*
  Export and import against a real database. It skips itself when none is reachable, or when the
  database is not obviously a throwaway one (its name must end in _test): it empties the tables.
*/
const url = process.env.DATABASE_URL ?? '';
const reachable = /_test$/.test(url.split('?')[0]) && await db.execute(sql`select 1`).then(() => true).catch(() => false);

const purge = async () => {
  for(const table of [kempoProductPurchase, kempoProductOption, kempoProduct, kempoProductField, kempoProductType]) await db.delete(table);
};

const ok = ([error, value]) => {
  assert.equal(error, null, error?.msg);
  return value;
};

after(() => db.$client.end());

describe('import and export', { skip: reachable ? false : 'no throwaway database (set DATABASE_URL to one ending in _test)' }, () => {
  before(async () => {
    await install();
    await purge();
    ok(await createType({ name: 'Model car' }));
    ok(await createField({ label: 'Scale', type: 'select', options: ['1:18', '1:24'], productType: 'model-car' }));
    ok(await createField({ label: 'Engine size', type: 'number' }));
    ok(await createProduct({
      name: 'Red car', type: 'model-car', price: 4999, status: 'published', stock: 3, tags: ['red', 'muscle'], description: 'A red, fast car.\nWith a second line.',
      fields: { scale: '1:18', engineSize: 5.7 },
      options: [{ label: 'Clear coat', choices: [{ label: 'Yes' }, { label: 'No', price: -100 }] }],
    }));
    ok(await createProduct({ name: '=cmd|\' /C calc\'!A0', price: 100, status: 'draft' }));
  });

  after(async () => {
    if(reachable) await purge();
  });

  test('a CSV export has a column per field and one row per product, with prices as decimals', async () => {
    const { body, filename, contentType } = ok(await buildExport({ format: 'csv' }));
    assert.equal(filename, 'products.csv');
    assert.match(contentType, /text\/csv/);
    const [header, ...rows] = parseCsv(body);
    assert.deepEqual(header.slice(0, 11), ['slug', 'name', 'type', 'status', 'availability', 'price', 'price_label', 'stock', 'tags', 'description', 'options']);
    assert.ok(header.includes('field.scale') && header.includes('field.engineSize'));
    assert.equal(rows.length, 2);
    const red = rows.find(row => row[0] === 'red-car');
    assert.equal(red[header.indexOf('price')], '49.99');
    assert.equal(red[header.indexOf('stock')], '3');
    assert.equal(red[header.indexOf('tags')], 'red, muscle');
    assert.equal(red[header.indexOf('field.scale')], '1:18');
    assert.equal(JSON.parse(red[header.indexOf('options')])[0].choices[1].price, -100);
  });

  test('a product name that a spreadsheet would run as a formula is exported as text', async () => {
    const { body } = ok(await buildExport({ format: 'csv' }));
    assert.ok(!/^=/m.test(body), 'no line starts with a formula');
    assert.ok(body.includes("'=cmd"));
  });

  test('a JSON export carries the types and fields as well', async () => {
    const data = JSON.parse(ok(await buildExport({ format: 'json' })).body);
    assert.equal(data.format, 'kempo-products');
    assert.deepEqual(data.types.map(type => type.key), ['model-car']);
    assert.deepEqual(data.fields.map(field => field.key).sort(), ['engineSize', 'scale']);
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

  test('new products are created from a spreadsheet with the defaults, matching a type by its name', async () => {
    const csv = 'Name,Type,Price,Stock,Tags,FIELD.SCALE\nBlue car,Model car,25.50,,"blue, fast",1:24\n';
    const result = ok(await importFile(csv));
    assert.equal(result.created, 1, JSON.stringify(result.errors));
    const blue = ok(await getProduct('blue-car'));
    assert.equal(blue.type, 'model-car');
    assert.equal(blue.price, 2550);
    assert.equal(blue.stock, -1, 'an empty stock cell is unlimited');
    assert.equal(blue.status, 'draft');
    assert.deepEqual(blue.tags, ['blue', 'fast']);
    assert.equal(blue.fields.scale, '1:24', 'field columns match whatever the case');
  });

  test('updating changes only what the file has, and leaves empty cells alone', async () => {
    const result = ok(await importFile('slug,name,price,description\nred-car,Red car,59.00,', { onMatch: 'update' }));
    assert.equal(result.updated, 1);
    const red = ok(await getProduct('red-car'));
    assert.equal(red.price, 5900);
    assert.match(red.description, /second line/, 'the empty description did not clear it');
    assert.equal(red.stock, 3);
    assert.equal(red.options.length, 1, 'options were not in the file, so they are unchanged');
  });

  test('options in a spreadsheet are JSON in one cell', async () => {
    const options = JSON.stringify([{ label: 'Wheels', choices: [{ label: 'Stock' }, { label: 'Chrome', price: 500 }] }]);
    const csv = `name,price,options\nWheeled,10,"${options.replace(/"/g, '""')}"`;
    ok(await importFile(csv));
    const wheeled = ok(await getProduct('wheeled'));
    assert.equal(wheeled.options[0].choices[1].price, 500);
  });

  test('rows that cannot be read are reported with their line, and the rest carry on', async () => {
    const csv = ['name,status,price,type,options', 'Fine,published,5.00,,', ',published,1.00,,', 'Bad status,live,1.00,,', 'Bad price,draft,abc,,', 'Bad type,draft,1.00,Spaceship,', 'Bad json,draft,1.00,,{nope'].join('\n');
    const result = ok(await importFile(csv));
    assert.equal(result.created, 1);
    assert.deepEqual(result.errors.map(error => error.line), [3, 4, 5, 7, 6]);
    assert.match(result.errors[0].message, /name is required/);
    assert.match(result.errors[1].message, /status must be one of/);
    assert.match(result.errors[2].message, /not an amount/);
    assert.match(result.errors[3].message, /options is not valid JSON/);
    assert.match(result.errors[4].message, /no product type "Spaceship"/);
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

  test('a JSON export imports into an empty catalog, creating the types and fields too', async () => {
    const { body } = ok(await buildExport({ format: 'json' }));
    await purge();
    const result = ok(await importFile(body));
    assert.equal(result.errors.length, 0, JSON.stringify(result.errors));
    assert.equal(result.created, ok(JSON.parse(body) && [null, JSON.parse(body).products.length]));
    assert.deepEqual(ok(await getTypes()).map(type => type.key), ['model-car']);
    assert.deepEqual(ok(await getFields()).map(field => field.key).sort(), ['engineSize', 'scale']);
    const red = ok(await getProduct('red-car'));
    assert.equal(red.price, 5900);
    assert.equal(red.fields.engineSize, 5.7);
    assert.equal(red.options[0].choices[1].price, -100);
    assert.equal(red.stock, 3);
  });

  test('parsing alone reads rows without touching the database', async () => {
    const parsed = ok(await parseImport('name,price\nA,1.00\nB,2.00'));
    assert.equal(parsed.rows.length, 2);
    assert.equal(parsed.rows[1].slug, 'b');
    assert.equal(parsed.format, 'csv');
  });
});
