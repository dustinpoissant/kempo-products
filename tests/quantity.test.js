import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeQuantity, hasQuantityFor, unavailableReason, isPurchasable, UNLIMITED } from '../server/utils/quantity.js';

const live = { status: 'published', availability: 'available', quantity: UNLIMITED, price: 1000 };

test('quantity is unlimited when blank or -1', () => {
  assert.deepEqual(normalizeQuantity(''), [null, UNLIMITED]);
  assert.deepEqual(normalizeQuantity(undefined), [null, UNLIMITED]);
  assert.deepEqual(normalizeQuantity(-1), [null, UNLIMITED]);
  assert.deepEqual(normalizeQuantity('5'), [null, 5]);
  assert.deepEqual(normalizeQuantity(0), [null, 0]);
});

test('quantity must be a whole number', () => {
  assert.ok(normalizeQuantity(1.5)[0]);
  assert.ok(normalizeQuantity(-2)[0]);
  assert.ok(normalizeQuantity('abc')[0]);
});

test('unlimited quantity covers any quantity', () => {
  assert.equal(hasQuantityFor(UNLIMITED, 1000), true);
  assert.equal(hasQuantityFor(3, 3), true);
  assert.equal(hasQuantityFor(3, 4), false);
  assert.equal(hasQuantityFor(0, 1), false);
});

test('a live, priced, in-stock product can be bought', () => {
  assert.equal(isPurchasable(live), true);
  assert.equal(isPurchasable({ ...live, quantity: 2 }), true);
});

test('each reason a product cannot be bought is reported', () => {
  assert.equal(unavailableReason({ ...live, status: 'draft' }), 'This product is not for sale');
  assert.equal(unavailableReason({ ...live, status: 'archived' }), 'This product is not for sale');
  assert.equal(unavailableReason({ ...live, availability: 'sold' }), 'Sold');
  assert.equal(unavailableReason({ ...live, availability: 'pending' }), 'Sale pending');
  assert.equal(unavailableReason({ ...live, quantity: 0 }), 'Out of stock');
  assert.equal(unavailableReason({ ...live, price: null }), 'No price');
  assert.equal(unavailableReason(live), '');
});
