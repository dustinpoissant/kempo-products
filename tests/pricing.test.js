import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeOptions, checkSelections, computePrice } from '../server/utils/pricing.js';

const cars = [
  { key: 'clear-coat', label: 'Clear coat', required: true, priceType: 'adjust', position: 0, choices: [
    { key: 'yes', label: 'Clear coat', price: 0, available: true },
    { key: 'no', label: 'No clear coat', price: -100, available: true },
  ] },
  { key: 'color', label: 'Color', required: true, priceType: 'adjust', position: 1, choices: [
    { key: 'red', label: 'Red', price: 0, available: true },
    { key: 'gold', label: 'Gold', price: 250, available: true },
    { key: 'blue', label: 'Blue', price: 0, available: false },
  ] },
];

const product = { price: 4999 };

test('an adjusting choice is relative to the base price', () => {
  const [error, result] = computePrice(product, cars, { 'clear-coat': 'no', color: 'red' });
  assert.equal(error, null);
  assert.equal(result.unit, 4899);
});

test('adjustments add up across options', () => {
  const [, result] = computePrice(product, cars, { 'clear-coat': 'no', color: 'gold' });
  assert.equal(result.unit, 5149);
  assert.equal(result.lines.length, 2);
});

test('a zero adjustment does not change the price', () => {
  const [, result] = computePrice(product, cars, { 'clear-coat': 'yes', color: 'red' });
  assert.equal(result.unit, 4999);
});

test('a replacing choice stands in for the base price, and adjustments still apply', () => {
  const sizes = [{ key: 'size', label: 'Size', required: true, priceType: 'replace', position: 0, choices: [
    { key: 's', label: 'Small', price: 2000, available: true },
    { key: 'l', label: 'Large', price: 3500, available: true },
  ] }];
  const [, plain] = computePrice({ price: 9999 }, sizes, { size: 'l' });
  assert.equal(plain.unit, 3500);
  const [, mixed] = computePrice({ price: 9999 }, [...sizes, cars[0]], { size: 's', 'clear-coat': 'no' });
  assert.equal(mixed.unit, 1900);
  assert.equal(mixed.base, 2000);
});

test('the price never goes below zero', () => {
  const [, result] = computePrice({ price: 50 }, cars, { 'clear-coat': 'no', color: 'red' });
  assert.equal(result.unit, 0);
});

test('a product with no price cannot be priced', () => {
  const [error] = computePrice({ price: null }, cars, { 'clear-coat': 'yes', color: 'red' });
  assert.equal(error.code, 409);
});

test('a required option must be chosen', () => {
  const [error] = checkSelections(cars, { color: 'red' });
  assert.equal(error.code, 400);
  assert.match(error.msg, /clear coat/i);
});

test('an optional option can be left out', () => {
  const optional = [{ ...cars[0], required: false }];
  const [error, chosen] = checkSelections(optional, {});
  assert.equal(error, null);
  assert.deepEqual(chosen, {});
});

test('an unknown option, an unknown choice and an unavailable choice are refused', () => {
  assert.ok(checkSelections(cars, { 'clear-coat': 'yes', color: 'red', engine: 'v8' })[0]);
  assert.ok(checkSelections(cars, { 'clear-coat': 'maybe', color: 'red' })[0]);
  const [error] = checkSelections(cars, { 'clear-coat': 'yes', color: 'blue' });
  assert.match(error.msg, /not available/);
});

test('options are tidied: keys come from labels, positions from order, prices default to 0', () => {
  const [error, options] = normalizeOptions([{ label: 'Clear coat', choices: [{ label: 'Yes' }, { label: 'No', price: -100 }] }]);
  assert.equal(error, null);
  assert.equal(options[0].key, 'clear-coat');
  assert.equal(options[0].priceType, 'adjust');
  assert.equal(options[0].required, true);
  assert.deepEqual(options[0].choices.map(c => [c.key, c.price, c.position]), [['yes', 0, 0], ['no', -100, 1]]);
});

test('only one option may replace the base price', () => {
  const choices = [{ label: 'A', price: 100 }];
  const [error] = normalizeOptions([{ label: 'One', priceType: 'replace', choices }, { label: 'Two', priceType: 'replace', choices }]);
  assert.match(error.msg, /Only one option/);
});

test('duplicate keys, empty options and bad prices are refused', () => {
  const choices = [{ label: 'A' }];
  assert.ok(normalizeOptions([{ label: 'X', choices }, { label: 'X', choices }])[0]);
  assert.ok(normalizeOptions([{ label: 'X', choices: [] }])[0]);
  assert.ok(normalizeOptions([{ label: 'X', choices: [{ label: 'A' }, { label: 'A' }] }])[0]);
  assert.ok(normalizeOptions([{ label: 'X', choices: [{ label: 'A', price: 1.5 }] }])[0]);
  assert.ok(normalizeOptions([{ label: 'X', priceType: 'multiply', choices }])[0]);
});
