import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { sql, eq } from 'drizzle-orm';
import db from 'kempo/server/db/index.js';
import { extension } from 'kempo/server/db/schema.js';
import {
  kempoProduct, kempoProductType, kempoProductField, kempoProductOption,
} from '../server/db/schema.js';
import { createProduct, updateProduct, getPrice } from '../server/utils/products.js';
import { saveCatalogSettings, readCatalogSettings } from '../server/utils/catalogSettings.js';
import install from '../install.js';

/*
  The kempo-credits integration against a real database, with the real kempo-credits.

  It needs kempo-credits installed in node_modules, which is an optional peer: when it is not (it
  is not on the registry until it has had its first release), the suite says so and skips rather
  than failing, so the rest of the catalog is still tested. Like the data-layer suite it empties the
  tables, so it only runs against a throwaway database.
*/
const url = process.env.DATABASE_URL ?? '';
const unitTier = process.env.KEMPO_DB === 'pglite';
const reachable = (unitTier || /_test$/.test(url.split('?')[0])) && await db.execute(sql`select 1`).then(() => true).catch(() => false);

const credits = await import('kempo-credits/sdk').catch(() => null);
const ready = Boolean(reachable && credits);

const skip = ready ? false : credits ? 'no throwaway database' : 'kempo-credits is not installed (it is an optional peer)';

const purge = async () => {
  for(const table of [kempoProductOption, kempoProduct, kempoProductField, kempoProductType]) await db.delete(table);
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

/* kempo-credits counts as installed when it has an enabled row in the extension table. */
const setCredits = async enabled => {
  await db.delete(extension).where(eq(extension.name, 'kempo-credits'));
  if(enabled === null) return;
  const now = new Date();
  await db.insert(extension).values({ name: 'kempo-credits', version: '0.1.0', enabled, kempo: {}, installedAt: now, updatedAt: now });
};

let counter = 0;
const user = () => `credits-test-user-${Date.now()}-${++counter}`;
const ref = () => `credits-test-order-${Date.now()}-${++counter}`;

after(() => unitTier ? db.$client.close() : db.$client.end());

describe('kempo-credits integration', { skip }, () => {
  before(async () => {
    await install();
    await purge();
  });

  after(async () => {
    await setCredits(null);
    if(ready) await purge();
  });

  describe('when kempo-credits is not installed', () => {
    before(() => setCredits(null));

    test('products work as before, and credit settings cannot be turned on', async () => {
      const plain = ok(await createProduct({ name: 'No credits here', price: 1000 }));
      assert.equal(plain.creditsGranted, 0);
      assert.equal(plain.creditsOnly, false);
      assert.equal(plain.creditPercent, 0);

      refused(await createProduct({ name: 'Wants credits', creditsGranted: 50 }), 409);
      refused(await updateProduct(plain.id, { creditPercent: 50 }), 409);
      ok(await updateProduct(plain.id, { creditPercent: 0, creditsGranted: 0, creditsOnly: false }));
    });

    test('a price has no credits in it', async () => {
      const product = ok(await createProduct({ name: 'Priced', price: 2000 }));
      assert.equal('credits' in ok(await getPrice(product.id)), false);
    });

    test('a disabled kempo-credits counts as not installed', async () => {
      await setCredits(false);
      refused(await createProduct({ name: 'Disabled', creditsGranted: 5 }), 409);
      await setCredits(null);
    });
  });

  describe('when kempo-credits is installed and enabled', () => {
    before(() => setCredits(true));

    test('a product can give credits and accept some as payment', async () => {
      const product = ok(await createProduct({ name: 'Bundle', price: 1000, creditsGranted: 250, creditPercent: 50 }));
      assert.equal(product.creditsGranted, 250);
      assert.equal(product.creditPercent, 50);

      /* $10.00 at 50% is $5.00 payable in credits; at 100 credits to the dollar that is 500. */
      const price = ok(await getPrice(product.id));
      assert.deepEqual(price.credits, { percent: 50, perUnit: 100, maxCredits: 500, coveredMinor: 500, remainingMinor: 500 });
    });

    test('0% means credits are not accepted, and 100% means entirely', async () => {
      const none = ok(await createProduct({ name: 'Money only', price: 1000 }));
      assert.equal('credits' in ok(await getPrice(none.id)), false);

      const all = ok(await createProduct({ name: 'Credits fine', price: 1999, creditPercent: 100 }));
      const price = ok(await getPrice(all.id));
      assert.equal(price.credits.remainingMinor, 0);
      assert.equal(price.credits.maxCredits, 1999);
    });

    test('the rate comes from the credits_per_unit setting, and rounding never gives a discount', async () => {
      const product = ok(await createProduct({ name: 'Odd price', price: 333, creditPercent: 50 }));
      ok(await saveCatalogSettings({ credits_per_unit: 250 }));
      const price = ok(await getPrice(product.id)).credits;
      /* 50% of 333 is 166 (rounded down); 1.66 * 250 = 415 credits. */
      assert.equal(price.coveredMinor, 166);
      assert.equal(price.maxCredits, 415);
      assert.equal(price.remainingMinor, 167);
      ok(await saveCatalogSettings({ credits_per_unit: 100 }));
    });

    test('the values are checked', async () => {
      refused(await createProduct({ name: 'Too much', creditPercent: 101 }), 400);
      refused(await createProduct({ name: 'Negative', creditsGranted: -1 }), 400);
      refused(await createProduct({ name: 'Fraction', creditsGranted: 1.5 }), 400);
      refused(await createProduct({ name: 'Nothing', creditsOnly: true }), 400);
      refused(await createProduct({ name: 'Circular', creditsOnly: true, creditsGranted: 100, creditPercent: 10 }), 400);
      refused(await createProduct({ name: 'Text', creditsOnly: 'yes', creditsGranted: 1 }), 400);
    });

    test('a credit-only product cannot be changed into one that buys credits with credits', async () => {
      const pack = ok(await createProduct({ name: 'Starter pack', price: 499, creditsOnly: true, creditsGranted: 500 }));
      refused(await updateProduct(pack.id, { creditPercent: 25 }), 400);
      refused(await updateProduct(pack.id, { creditsGranted: 0 }), 400);
      ok(await updateProduct(pack.id, { creditsOnly: false, creditPercent: 25 }));
    });
  });

  describe('the settings page', () => {
    test('shows every declared setting, and only saves ones that are acceptable', async () => {
      await setCredits(true);
      const { settings, credits: enabled } = ok(await readCatalogSettings());
      assert.equal(enabled, true);
      assert.deepEqual(settings.map(setting => setting.name).sort(), ['credits_per_unit', 'currency', 'page_size', 'prices_visible']);

      refused(await saveCatalogSettings({ page_sise: 10 }), 400);
      refused(await saveCatalogSettings({ page_size: 0 }), 400);
      refused(await saveCatalogSettings({ page_size: 101 }), 400);
      refused(await saveCatalogSettings({ currency: 'dollars' }), 400);
      refused(await saveCatalogSettings({ prices_visible: 'maybe' }), 400);
      refused(await saveCatalogSettings({ credits_per_unit: 0 }), 400);
      refused(await saveCatalogSettings({ page_size: 10, currency: 'nope' }), 400);

      const saved = ok(await saveCatalogSettings({ page_size: 12, currency: 'EUR', prices_visible: false }));
      const byName = Object.fromEntries(saved.settings.map(setting => [setting.name, setting.value]));
      assert.equal(byName.page_size, 12);
      assert.equal(byName.currency, 'eur');
      assert.equal(byName.prices_visible, false);

      ok(await saveCatalogSettings({ page_size: 24, currency: 'usd', prices_visible: true }));
      await setCredits(null);
    });
  });
});
