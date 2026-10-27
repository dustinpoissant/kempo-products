import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coerceValue, canConvert, ATTRIBUTE_TYPES } from '../server/utils/attributeTypes.js';

const attribute = { label: 'Shipping', type: 'currency' };

test('a money attribute is a whole number of the smallest unit, and anything else is refused', () => {
  assert.deepEqual(coerceValue(attribute, 499), [null, 499]);
  assert.deepEqual(coerceValue(attribute, '0'), [null, 0]);
  assert.equal(coerceValue(attribute, '4.99')[0].code, 400);
  assert.equal(coerceValue(attribute, 'free')[0].code, 400);
});

test('money is an attribute type of its own, and can become a plain number but not the other way', () => {
  assert.ok(ATTRIBUTE_TYPES.includes('currency'));
  assert.equal(canConvert('currency', 'number'), true);
  assert.equal(canConvert('number', 'currency'), false);
});

test('an attribute has no tab: the product form decides where attributes go', async () => {
  const { normalizeAttributeDefinition } = await import('../server/utils/attributeTypes.js');
  assert.equal(normalizeAttributeDefinition({ label: 'Weight', type: 'number' })[1].tab, undefined);
});
