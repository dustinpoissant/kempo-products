import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseListParam } from '../server/utils/query.js';

test('a list in a query string is comma separated or a JSON array, and empty means no filter', () => {
  assert.deepEqual(parseListParam('a,b'), ['a', 'b']);
  assert.deepEqual(parseListParam(' a , b ,, '), ['a', 'b']);
  assert.deepEqual(parseListParam('["a","b"]'), ['a', 'b']);
  assert.equal(parseListParam('[]'), undefined, 'the browser SDK sends an empty array as [], which is no filter');
  assert.equal(parseListParam(''), undefined);
  assert.equal(parseListParam(undefined), undefined);
  assert.equal(parseListParam('[not json'), undefined);
});
