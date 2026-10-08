import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMoney, formatMoney, decimalsFor } from '../server/utils/money.js';

test('prices parse into the smallest unit', () => {
  assert.deepEqual(parseMoney('49.99'), [null, 4999]);
  assert.deepEqual(parseMoney('$49.99'), [null, 4999]);
  assert.deepEqual(parseMoney('49'), [null, 4900]);
  assert.deepEqual(parseMoney('0.5'), [null, 50]);
  assert.deepEqual(parseMoney('1,234.50'), [null, 123450]);
});

test('signed amounts parse for option adjustments', () => {
  assert.deepEqual(parseMoney('+1.00'), [null, 100]);
  assert.deepEqual(parseMoney('-1.00'), [null, -100]);
  assert.deepEqual(parseMoney('0.00'), [null, 0]);
  assert.deepEqual(parseMoney('-0.5'), [null, -50]);
});

test('too many decimals and non-numbers are refused, not rounded', () => {
  assert.ok(parseMoney('1.999')[0]);
  assert.ok(parseMoney('abc')[0]);
  assert.ok(parseMoney('')[0]);
  assert.ok(parseMoney('-')[0]);
  assert.ok(parseMoney('1.2.3')[0]);
});

test('currencies without cents are whole numbers', () => {
  assert.equal(decimalsFor('jpy'), 0);
  assert.deepEqual(parseMoney('500', 'jpy'), [null, 500]);
  assert.ok(parseMoney('5.5', 'jpy')[0]);
  assert.equal(decimalsFor('kwd'), 3);
  assert.deepEqual(parseMoney('1.234', 'kwd'), [null, 1234]);
});

test('amounts format back, with an optional sign', () => {
  assert.equal(formatMoney(4999), '49.99');
  assert.equal(formatMoney(-100, 'usd', { signed: true }), '-1.00');
  assert.equal(formatMoney(100, 'usd', { signed: true }), '+1.00');
  assert.equal(formatMoney(0, 'usd', { signed: true }), '0.00');
  assert.equal(formatMoney(500, 'jpy'), '500');
});

test('what is parsed formats back to the same amount', () => {
  for(const text of ['49.99', '-1.00', '0.05', '1234.50']){
    const [, minor] = parseMoney(text);
    assert.equal(parseMoney(formatMoney(minor))[1], minor);
  }
});
