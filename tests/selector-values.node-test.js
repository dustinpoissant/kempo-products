import test from 'node:test';
import assert from 'node:assert/strict';
import { listOf, textOf } from '../public/utils/listValue.js';

/*
  The category, tag and product selectors keep their value as a comma-separated list, the text a list's attribute holds.
  These check the two ways round, so a value chosen in a selector reads back as the same list on the page.
*/

test('a list reads from its text, dropping blanks and spaces', () => {
  assert.deepEqual(listOf('shirts, hats ,,'), ['shirts', 'hats']);
  assert.deepEqual(listOf(''), []);
  assert.deepEqual(listOf(undefined), []);
});

test('a list is written back without repeats or blanks, in the order chosen', () => {
  assert.equal(textOf(['camaro', 'mustang', 'camaro', '']), 'camaro,mustang');
  assert.equal(textOf([]), '');
});

test('a list survives the way round and back', () => {
  const chosen = ['red', 'acrylic', 'water-based'];
  assert.deepEqual(listOf(textOf(chosen)), chosen);
});
