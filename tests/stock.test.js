import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeStock, hasStockFor, unavailableReason, isPurchasable, stockAfterSale, stockAfterReturn, UNLIMITED } from '../server/utils/stock.js';

const live = { status: 'published', availability: 'available', stock: UNLIMITED, price: 1000 };

test('stock is unlimited when blank or -1', () => {
  assert.deepEqual(normalizeStock(''), [null, UNLIMITED]);
  assert.deepEqual(normalizeStock(undefined), [null, UNLIMITED]);
  assert.deepEqual(normalizeStock(-1), [null, UNLIMITED]);
  assert.deepEqual(normalizeStock('5'), [null, 5]);
  assert.deepEqual(normalizeStock(0), [null, 0]);
});

test('stock must be a whole number', () => {
  assert.ok(normalizeStock(1.5)[0]);
  assert.ok(normalizeStock(-2)[0]);
  assert.ok(normalizeStock('abc')[0]);
});

test('unlimited stock covers any quantity', () => {
  assert.equal(hasStockFor(UNLIMITED, 1000), true);
  assert.equal(hasStockFor(3, 3), true);
  assert.equal(hasStockFor(3, 4), false);
  assert.equal(hasStockFor(0, 1), false);
});

test('a live, priced, in-stock product can be bought', () => {
  assert.equal(isPurchasable(live), true);
  assert.equal(isPurchasable({ ...live, stock: 2 }), true);
});

test('each reason a product cannot be bought is reported', () => {
  assert.equal(unavailableReason({ ...live, status: 'draft' }), 'This product is not for sale');
  assert.equal(unavailableReason({ ...live, status: 'archived' }), 'This product is not for sale');
  assert.equal(unavailableReason({ ...live, availability: 'sold' }), 'Sold');
  assert.equal(unavailableReason({ ...live, availability: 'pending' }), 'Sale pending');
  assert.equal(unavailableReason({ ...live, stock: 0 }), 'Out of stock');
  assert.equal(unavailableReason({ ...live, price: null }), 'No price');
  assert.equal(unavailableReason(live), '');
});

test('selling takes stock, and refuses to go below zero', () => {
  assert.equal(stockAfterSale(5, 2), 3);
  assert.equal(stockAfterSale(2, 2), 0);
  assert.equal(stockAfterSale(1, 2), null);
  assert.equal(stockAfterSale(UNLIMITED, 99), UNLIMITED);
});

test('returning puts stock back, except when it is unlimited', () => {
  assert.equal(stockAfterReturn(3, 2), 5);
  assert.equal(stockAfterReturn(0, 1), 1);
  assert.equal(stockAfterReturn(UNLIMITED, 2), UNLIMITED);
});
