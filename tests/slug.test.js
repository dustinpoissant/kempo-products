import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slugify, normalizeSlug, withSuffix, MAX_SLUG } from '../server/utils/slug.js';

test('names become readable slugs', () => {
  assert.equal(slugify('1969 Camaro Z/28'), '1969-camaro-z-28');
  assert.equal(slugify('  Café Racer!! '), 'cafe-racer');
  assert.equal(slugify('---'), '');
});

test('a slug is made from the name when none is given', () => {
  assert.deepEqual(normalizeSlug('', 'Model Car'), [null, 'model-car']);
  assert.deepEqual(normalizeSlug(undefined, 'Model Car'), [null, 'model-car']);
});

test('an explicit slug is validated as given', () => {
  assert.deepEqual(normalizeSlug(' My-Car ', 'x'), [null, 'my-car']);
  assert.ok(normalizeSlug('my car', 'x')[0]);
  assert.ok(normalizeSlug('my--car', 'x')[0]);
  assert.ok(normalizeSlug('-car', 'x')[0]);
});

test('words the extension uses for its own routes are reserved', () => {
  for(const word of ['api', 'components', 'sdk.js', 'admin']) assert.ok(normalizeSlug(word, 'x')[0], word);
  assert.ok(normalizeSlug('', 'API')[0]);
});

test('a name that yields no slug asks for one', () => {
  assert.match(normalizeSlug('', '!!!')[0].msg, /Enter one/);
});

test('long slugs are refused when given and trimmed when made', () => {
  assert.ok(normalizeSlug('a'.repeat(MAX_SLUG + 1), 'x')[0]);
  assert.ok(slugify('a '.repeat(100)).length <= MAX_SLUG);
});

test('taken slugs get a numeric suffix', () => {
  assert.equal(withSuffix('camaro', 1), 'camaro');
  assert.equal(withSuffix('camaro', 2), 'camaro-2');
  assert.ok(withSuffix('a'.repeat(MAX_SLUG), 12).length <= MAX_SLUG);
});
