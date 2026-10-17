import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { sql } from 'drizzle-orm';
import db from 'kempo/server/db/index.js';
import { kempoProduct } from '../server/db/schema.js';
import { createProduct, getProduct } from '../server/utils/products.js';
import { parseImport } from '../server/utils/importExport.js';
import install from '../install.js';

/*
  A site that installed before the stock column became quantity: the update renames it once, keeps every
  number, and is safe to run again. And a file exported before the rename still imports.
*/
const url = process.env.DATABASE_URL ?? '';
const unitTier = process.env.KEMPO_DB === 'pglite';
const reachable = (unitTier || /_test$/.test(url.split('?')[0])) && await db.execute(sql`select 1`).then(() => true).catch(() => false);

const columns = async () => new Set((await db.execute(sql`select column_name from information_schema.columns where table_name = 'kempoProduct'`)).map(row => row.column_name));

after(() => unitTier ? db.$client.close() : db.$client.end());

describe('the stock to quantity rename', { skip: reachable ? false : 'no throwaway database' }, () => {
  before(async () => {
    await install();
    await db.delete(kempoProduct);
  });

  after(async () => {
    if(reachable){
      await db.delete(kempoProduct);
      if((await columns()).has('stock')) await db.execute(sql`ALTER TABLE "kempoProduct" RENAME COLUMN "stock" TO "quantity"`);
    }
  });

  test('an older database is renamed by install, keeping every quantity, and again is a no-op', async () => {
    const [, product] = await createProduct({ name: 'Old site product', price: 100, quantity: 7, status: 'published' });
    await db.execute(sql`ALTER TABLE "kempoProduct" RENAME COLUMN "quantity" TO "stock"`);
    assert.ok((await columns()).has('stock') && !(await columns()).has('quantity'));

    await install();
    assert.ok((await columns()).has('quantity') && !(await columns()).has('stock'));
    assert.equal((await getProduct(product.id))[1].quantity, 7);

    await install();
    assert.ok((await columns()).has('quantity'));
  });

  test('a CSV or JSON file exported before the rename still imports its stock column', async () => {
    const [csvError, csv] = await parseImport('name,price,stock\nOld export,5.00,12\n');
    assert.equal(csvError, null);
    assert.equal(csv.rows[0].data.quantity, '12');

    const [jsonError, json] = await parseImport(JSON.stringify({ products: [{ name: 'Old json', price: 500, stock: 3 }] }));
    assert.equal(jsonError, null);
    assert.equal(json.rows[0].data.quantity, 3);
  });
});
