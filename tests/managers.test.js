import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { sql, eq } from 'drizzle-orm';
import { join } from 'node:path';
import db from 'kempo/server/db/index.js';
import { extension, hook } from 'kempo/server/db/schema.js';
import createHook from 'kempo/server/utils/hooks/createHook.js';
import { clearHandlerCache } from 'kempo/server/utils/hooks/triggerHook.js';
import { kempoProduct, kempoProductOption, kempoProductLedger, kempoProductAttribute } from '../server/db/schema.js';
import { createProduct, getProduct, setManagedBy } from '../server/utils/products.js';
import { setQuantity, adjustQuantity, addLedgerEntry, getLedgerEntry } from '../server/utils/ledger.js';
import install from '../install.js';
import { state, reset } from './fixtures/manager.js';

/*
  A product an extension manages: the lock only holds while that extension is installed and enabled,
  and ledger entries for managed products are answered by the manager, whose quantity products
  never writes itself.
*/
const url = process.env.DATABASE_URL ?? '';
const unitTier = process.env.KEMPO_DB === 'pglite';
const reachable = (unitTier || /_test$/.test(url.split('?')[0])) && await db.execute(sql`select 1`).then(() => true).catch(() => false);

if(!reachable && process.env.KEMPO_TEST_TIER === 'integration'){
  throw new Error('The integration tier needs DATABASE_URL pointing at a throwaway Postgres named *_test with the schema applied (npx drizzle-kit push --force).');
}

const OWNER = 'test-manager';
const root = join(import.meta.dirname, 'fixtures');

const purge = async () => {
  for(const table of [kempoProductLedger, kempoProductOption, kempoProduct, kempoProductAttribute]) await db.delete(table);
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

const setInstalled = enabled => db.insert(extension).values({ name: OWNER, version: '0.0.0', enabled, kempo: {}, installedAt: new Date(), updatedAt: new Date() })
  .onConflictDoUpdate({ target: extension.name, set: { enabled } });

const quantityOf = async id => ok(await getProduct(id)).quantity;

let count = 0;

after(() => unitTier ? db.$client.close() : db.$client.end());

describe('managers', { skip: reachable ? false : 'no throwaway database (set DATABASE_URL to one ending in _test)' }, () => {
  before(async () => {
    await install();
    await purge();
    await db.delete(hook).where(eq(hook.owner, OWNER));
    ok(await createHook({ owner: OWNER, event: 'kempo-products:ledger:before_add', callback: join(root, 'manager-guard.js') }));
    ok(await createHook({ owner: OWNER, event: 'kempo-products:ledger:add_failed', callback: join(root, 'manager-failed.js') }));
    clearHandlerCache();
    await setInstalled(true);
  });

  after(async () => {
    if(reachable){
      await purge();
      await db.delete(hook).where(eq(hook.owner, OWNER));
      await db.delete(extension).where(eq(extension.name, OWNER));
    }
  });

  const managed = async (quantity = 5) => {
    const product = ok(await createProduct({ name: `Managed ${count++}`, price: 1000, status: 'published', quantity }));
    ok(await setManagedBy(product.id, OWNER));
    return product;
  };

  const plain = async (quantity = 5) => ok(await createProduct({ name: `Plain ${count++}`, price: 500, status: 'published', quantity }));

  describe('the lock', () => {
    test('a manager that is not installed does not lock its products', async () => {
      const product = ok(await createProduct({ name: 'Orphan', quantity: 5 }));
      ok(await setManagedBy(product.id, 'never-installed'));
      assert.equal(ok(await getProduct(product.id)).managedBy, '');
      assert.equal(ok(await setQuantity(product.id, 9)).quantity, 9);
      ok(await setManagedBy(product.id, OWNER));
      refused(await setQuantity(product.id, 1), 403);
    });

    test('disabling the manager frees its products, enabling it takes them back, and removing it frees them for good', async () => {
      const product = await managed();
      refused(await setQuantity(product.id, 1), 403);
      await setInstalled(false);
      assert.equal(ok(await getProduct(product.id)).managedBy, '');
      assert.equal(ok(await setQuantity(product.id, 3)).quantity, 3);
      await setInstalled(true);
      assert.equal(ok(await getProduct(product.id)).managedBy, OWNER);
      refused(await adjustQuantity(product.id, -1), 403);
      await db.delete(extension).where(eq(extension.name, OWNER));
      assert.equal(ok(await adjustQuantity(product.id, -1)).quantity, 2);
      ok(await setManagedBy(product.id, 'a-new-manager'));
      await setInstalled(true);
    });
  });

  describe('ledger entries', () => {
    test('the manager is asked, and products leaves a managed quantity alone', async () => {
      reset();
      const item = await managed(5);
      const entry = ok(await addLedgerEntry({ ref: 'mgr-1', lines: [{ productId: item.id, change: -2 }] }));
      assert.deepEqual(state.asked.map(call => call.ref), ['mgr-1']);
      assert.deepEqual(state.asked[0].managed, [item.id]);
      assert.equal(await quantityOf(item.id), 5, 'the manager writes it, not products');
      assert.deepEqual(entry.lines, [], 'and products writes no row for it');
    });

    test('the manager can refuse, and nothing changes', async () => {
      reset();
      const item = await managed(5);
      const plainOne = await plain(5);
      state.refuse = { code: 409, msg: 'Not enough resin' };
      const error = refused(await addLedgerEntry({ ref: 'mgr-2', lines: [{ productId: item.id, change: -1 }, { productId: plainOne.id, change: -1 }] }), 409);
      assert.equal(error.msg, 'Not enough resin');
      refused(await getLedgerEntry('mgr-2'), 404);
      assert.equal(await quantityOf(plainOne.id), 5);
    });

    test('a catalog with no managed products never asks anyone, and changes its own quantity', async () => {
      reset();
      const item = await plain(5);
      ok(await addLedgerEntry({ ref: 'mgr-3', lines: [{ productId: item.id, change: -2 }] }));
      assert.equal(state.asked.length, 0);
      assert.equal(await quantityOf(item.id), 3);
    });

    test('when the plain product of a mixed entry is short, the manager is told to undo', async () => {
      reset();
      const item = await managed(5);
      const other = await plain(1);
      refused(await addLedgerEntry({ ref: 'mgr-4', lines: [{ productId: item.id, change: -1 }, { productId: other.id, change: -2 }] }), 409);
      assert.deepEqual(state.failed, ['mgr-4']);
      assert.equal(await quantityOf(other.id), 1);
    });

    test('a repeated ref does not ask again or tell the manager to undo', async () => {
      reset();
      const plainOne = await plain(5);
      const item = await managed(5);
      ok(await addLedgerEntry({ ref: 'mgr-5', lines: [{ productId: item.id, change: -1 }, { productId: plainOne.id, change: -1 }] }));
      const again = ok(await addLedgerEntry({ ref: 'mgr-5', lines: [{ productId: item.id, change: -1 }, { productId: plainOne.id, change: -1 }] }));
      assert.equal(again.duplicate, true);
      assert.equal(state.asked.length, 1);
      assert.equal(state.failed.length, 0);
      assert.equal(await quantityOf(plainOne.id), 4);
    });

    test('the manager itself writes its quantity, and it is in the ledger', async () => {
      reset();
      const item = await managed(5);
      const entry = ok(await addLedgerEntry({ lines: [{ productId: item.id, change: -2 }], actor: OWNER, reason: 'recalculated' }));
      assert.equal(state.asked.length, 0, 'the manager is not asked about its own change');
      assert.equal(entry.lines[0].quantity, 3);
      assert.equal(await quantityOf(item.id), 3);
    });
  });
});
