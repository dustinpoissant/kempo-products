import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { sql } from 'drizzle-orm';
import db from 'kempo/server/db/index.js';
import { kempoProduct, kempoProductLedger, kempoProductOption, kempoProductAttribute, kempoProductCategory } from '../server/db/schema.js';
import { createProduct } from '../server/utils/products.js';
import { getTags } from '../server/utils/productTags.js';
import install from '../install.js';

/*
  The tags products carry, for the tag selector. Visitors are counted over published products only; people who manage
  the catalog are counted over every product. Like categories.test.js this needs a throwaway database.
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

after(() => unitTier ? db.$client.close() : db.$client.end());

describe('tags', { skip: reachable ? false : 'no throwaway database (set DATABASE_URL to one ending in _test)' }, () => {
  before(async () => {
    await install();
    await purge();
  });

  after(async () => {
    if(reachable) await purge();
  });

  test('visitors count tags over the published products, and managers over every product', async () => {
    ok(await createProduct({ name: 'Red acrylic paint', status: 'published', tags: ['acrylic', 'red'] }));
    ok(await createProduct({ name: 'Blue acrylic paint', status: 'published', tags: ['acrylic', 'blue'] }));
    ok(await createProduct({ name: 'Draft red paint', status: 'draft', tags: ['red', 'draft-only'] }));

    const visitors = ok(await getTags({ includeDrafts: false }));
    assert.deepEqual(visitors, [
      { tag: 'acrylic', count: 2 },
      { tag: 'blue', count: 1 },
      { tag: 'red', count: 1 }
    ]);

    const managers = ok(await getTags({ includeDrafts: true }));
    assert.equal(managers.find(entry => entry.tag === 'red').count, 2);
    assert.equal(managers.find(entry => entry.tag === 'draft-only').count, 1);
    assert.equal(managers[0].tag, 'acrylic', 'the most used tag comes first');
  });

  test('a catalogue with no tags gives an empty list', async () => {
    await purge();
    ok(await createProduct({ name: 'Plain product', status: 'published' }));
    assert.deepEqual(ok(await getTags({ includeDrafts: false })), []);
  });
});
