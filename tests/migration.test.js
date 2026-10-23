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

describe('the item type to product type rename', { skip: reachable ? false : 'no throwaway database' }, () => {
  before(async () => {
    await install();
    await db.delete(kempoProduct);
  });

  after(async () => {
    if(reachable){
      await db.delete(kempoProduct);
      await db.execute(sql`DROP TABLE IF EXISTS "kempoProductTypeLegacy"`);
    }
  });

  test('an older database keeps its old types out of the way and its item types become product types', async () => {
    const [, product] = await createProduct({ name: 'Old item type product', price: 100 });
    await db.execute(sql`ALTER TABLE "kempoProductType" RENAME TO "kempoProductItemType"`);
    await db.execute(sql`ALTER INDEX "kempoProductTypeKeyIdx" RENAME TO "kempoProductItemTypeKeyIdx"`);
    await db.execute(sql`ALTER TABLE "kempoProduct" RENAME COLUMN "productType" TO "itemType"`);
    await db.execute(sql`CREATE TABLE "kempoProductType" ("id" text PRIMARY KEY, "key" text NOT NULL, "name" text NOT NULL, "description" text NOT NULL DEFAULT '', "owner" text NOT NULL DEFAULT '', "position" integer NOT NULL DEFAULT 0, "created" timestamp NOT NULL)`);
    await db.execute(sql`CREATE UNIQUE INDEX "kempoProductTypeKeyIdx" ON "kempoProductType" ("key")`);
    await db.execute(sql`INSERT INTO "kempoProductType" ("id", "key", "name", "created") VALUES ('x', 'model-car', 'Model car', now())`);

    await install();
    const types = await db.execute(sql`select "key" from "kempoProductType"`);
    assert.deepEqual(types.map(row => row.key), ['generic']);
    const legacy = await db.execute(sql`select "key" from "kempoProductTypeLegacy"`);
    assert.deepEqual(legacy.map(row => row.key), ['model-car']);
    assert.equal((await getProduct(product.id))[1].productType, 'generic');

    await install();
    assert.equal((await db.execute(sql`select "key" from "kempoProductType"`)).length, 1);
  });
});

describe('product types become templates', { skip: reachable ? false : 'no throwaway database' }, () => {
  before(async () => {
    await install();
    await db.delete(kempoProduct);
    await db.execute(sql`DELETE FROM "kempoProductTemplate"`);
  });

  after(async () => {
    if(reachable){
      await db.delete(kempoProduct);
      await db.execute(sql`DELETE FROM "kempoProductTemplate"`);
      await db.execute(sql`DROP TABLE IF EXISTS "kempoProductTypeLegacy"`);
      await db.execute(sql`ALTER TABLE "kempoProduct" DROP COLUMN IF EXISTS "type"`);
      await db.execute(sql`ALTER TABLE "kempoProductAttribute" DROP COLUMN IF EXISTS "productType"`);
      await db.execute(sql`DELETE FROM "kempoProductAttribute"`);
    }
  });

  test('an old type, its scoped attributes, defaults and products become a template and its products', async () => {
    const [, product] = await createProduct({ name: 'Old typed car', price: 100 });
    await db.execute(sql`ALTER TABLE "kempoProduct" ADD COLUMN "type" text NOT NULL DEFAULT ''`);
    await db.execute(sql`ALTER TABLE "kempoProductAttribute" ADD COLUMN "productType" text NOT NULL DEFAULT ''`);
    await db.execute(sql`UPDATE "kempoProduct" SET "type" = 'model-car' WHERE "id" = ${product.id}`);
    await db.execute(sql`CREATE TABLE "kempoProductTypeLegacy" ("id" text PRIMARY KEY, "key" text NOT NULL, "name" text NOT NULL, "description" text NOT NULL DEFAULT '', "owner" text NOT NULL DEFAULT '', "position" integer NOT NULL DEFAULT 0, "options" jsonb NOT NULL DEFAULT '[]'::jsonb, "defaults" jsonb NOT NULL DEFAULT '{}'::jsonb, "created" timestamp NOT NULL)`);
    await db.execute(sql`INSERT INTO "kempoProductTypeLegacy" ("id", "key", "name", "defaults", "created") VALUES ('x', 'model-car', 'Model car', '{"size": "5in"}'::jsonb, now())`);
    await db.execute(sql`INSERT INTO "kempoProductAttribute" ("id", "key", "label", "type", "productType", "created") VALUES ('f', 'size', 'Size', 'text', 'model-car', now())`);

    await install();
    const [template] = await db.execute(sql`select * from "kempoProductTemplate" where "key" = 'model-car'`);
    assert.equal(template.name, 'Model car');
    assert.deepEqual(template.attributes.map(attribute => attribute.key), ['size']);
    assert.deepEqual(template.defaults, { size: '5in' });
    assert.equal((await getProduct(product.id))[1].template, 'model-car');
    assert.equal((await db.execute(sql`select 1 from "kempoProductAttribute" where "productType" = 'model-car'`)).length, 0);

    await install();
    assert.equal((await db.execute(sql`select 1 from "kempoProductTemplate"`)).length, 1);
  });
});

describe('fields become attributes', { skip: reachable ? false : 'no throwaway database' }, () => {
  before(async () => {
    await install();
    await db.delete(kempoProduct);
  });

  test('an older database has its field table and columns renamed, keeping every row', async () => {
    const [, product] = await createProduct({ name: 'Old field product', price: 100, attributes: {} });
    await db.execute(sql`INSERT INTO "kempoProductAttribute" ("id", "key", "label", "type", "created") VALUES ('old', 'scale', 'Scale', 'text', now())`);
    await db.execute(sql`ALTER TABLE "kempoProductAttribute" RENAME TO "kempoProductField"`);
    await db.execute(sql`ALTER INDEX "kempoProductAttributeKeyIdx" RENAME TO "kempoProductFieldKeyIdx"`);
    await db.execute(sql`ALTER TABLE "kempoProductTemplate" RENAME COLUMN "attributes" TO "fields"`);
    await db.execute(sql`ALTER TABLE "kempoProduct" RENAME COLUMN "attributeDefs" TO "fieldDefs"`);
    await db.execute(sql`CREATE TABLE "kempoProductAttribute" ("id" text PRIMARY KEY, "key" text NOT NULL, "label" text NOT NULL, "type" text NOT NULL, "description" text NOT NULL DEFAULT '', "required" boolean NOT NULL DEFAULT false, "listed" boolean NOT NULL DEFAULT true, "tab" text NOT NULL DEFAULT '', "filterable" boolean NOT NULL DEFAULT false, "options" jsonb NOT NULL DEFAULT '[]'::jsonb, "owner" text NOT NULL DEFAULT '', "position" integer NOT NULL DEFAULT 0, "created" timestamp NOT NULL)`);

    await install();
    assert.equal((await db.execute(sql`select 1 from information_schema.tables where table_name = 'kempoProductField'`)).length, 0);
    assert.deepEqual((await db.execute(sql`select "key" from "kempoProductAttribute"`)).map(row => row.key), ['scale']);
    assert.equal((await db.execute(sql`select 1 from information_schema.columns where table_name = 'kempoProductTemplate' and column_name = 'attributes'`)).length, 1);
    assert.deepEqual((await getProduct(product.id))[1].attributeDefs, []);

    await install();
    assert.equal((await db.execute(sql`select 1 from "kempoProductAttribute"`)).length, 1);
    await db.execute(sql`DELETE FROM "kempoProductAttribute"`);
    await db.delete(kempoProduct);
  });
});
