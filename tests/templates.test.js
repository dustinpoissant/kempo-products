import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import db from 'kempo/server/db/index.js';
import { kempoProduct, kempoProductTemplate, kempoProductAttribute } from '../server/db/schema.js';
import { createProduct, updateProduct, getProduct, getProducts, getPrice, setChoiceAvailability } from '../server/utils/products.js';
import { createTemplate, updateTemplate, deleteTemplate, getTemplates, registerTemplate, unregisterTemplates } from '../server/utils/templates.js';
import { createAttribute } from '../server/utils/attributes.js';
import { createCategory } from '../server/utils/categories.js';
import { registerProductType, unregisterProductTypes } from '../server/utils/productTypes.js';
import { effectiveAttributes } from '../server/utils/inherit.js';
import install from '../install.js';

/*
  Product templates: attributes, options and default values a product inherits from the template it is made from, and
  can add to. A product keeps a live link, so changing the template changes its products.
*/

const ok = ([error, value]) => {
  assert.equal(error, null, error?.msg);
  return value;
};

const refused = ([error, value], code) => {
  assert.equal(value, null);
  assert.ok(error, 'expected an error');
  if(code) assert.equal(error.code, code, error.msg);
  return error;
};

const color = (choices, extra = {}) => ({ key: 'color', label: 'Color', priceType: 'adjust', choices, ...extra });

after(() => process.env.KEMPO_DB === 'pglite' ? db.$client.close() : db.$client.end());

before(async () => {
  await install();
  await db.delete(kempoProduct);
  await db.delete(kempoProductTemplate);
  await db.delete(kempoProductAttribute);
  ok(await createAttribute({ key: 'weight', label: 'Weight', type: 'number' }));
});

describe('templates', () => {
  test('a template gets a key from its name, holds validated attributes, defaults and options', async () => {
    const template = ok(await createTemplate({
      name: 'Model Car',
      attributes: [{ label: 'Scale', type: 'select', options: ['1:18', '1:24'] }, { label: 'Size', type: 'text' }],
      defaults: { weight: '16', size: '5in x 3in', scale: '1:24' },
      options: [color([{ label: 'Black' }, { label: 'White' }])],
    }));
    assert.equal(template.key, 'model-car');
    assert.deepEqual(template.attributes.map(attribute => attribute.key), ['scale', 'size']);
    assert.deepEqual(template.defaults, { weight: 16, size: '5in x 3in', scale: '1:24' });
    assert.deepEqual(template.options[0].choices.map(choice => choice.key), ['black', 'white']);
    refused(await createTemplate({ name: 'Model Car' }), 409);
  });

  test('its attributes cannot reuse a key every product has, and a default must fit its attribute', async () => {
    refused(await createTemplate({ name: 'Clash', attributes: [{ label: 'Weight', type: 'text' }] }), 409);
    refused(await updateTemplate('model-car', { defaults: { scale: '9:9' } }), 400);
    refused(await updateTemplate('model-car', { defaults: { nonsense: 1 } }), 400);
  });

  test('a product made from a template inherits its defaults and options, and its own value wins', async () => {
    const plain = ok(await createProduct({ name: 'Mustang', price: 1000, template: 'model-car' }));
    assert.equal(plain.template, 'model-car');
    assert.deepEqual(plain.inherited, { weight: 16, size: '5in x 3in', scale: '1:24' });
    assert.deepEqual(plain.options.map(option => [option.key, option.fromTemplate]), [['color', true]]);
    assert.deepEqual(plain.ownOptions, []);
    const own = ok(await updateProduct(plain.id, { attributes: { size: '7in x 3in' } }));
    assert.equal(own.inherited.size, undefined);
    assert.equal(effectiveAttributes(own).size, '7in x 3in');
    assert.equal(effectiveAttributes(own).weight, 16);
    refused(await createProduct({ name: 'Orphan', price: 1, template: 'nope' }), 400);
  });

  test('a template change reaches the products made from it', async () => {
    ok(await updateTemplate('model-car', { defaults: { weight: 20 } }));
    const found = ok(await getProducts({ template: 'model-car' })).items;
    assert.ok(found.length > 0);
    assert.ok(found.every(product => product.inherited.weight === 20));
    ok(await updateTemplate('model-car', { defaults: { weight: 16, size: '5in x 3in', scale: '1:24' } }));
  });

  test('a product can add choices to a template option, and the buyer sees all of them', async () => {
    const product = ok(await createProduct({ name: 'Charger', price: 1000, template: 'model-car', options: [color([{ label: 'Red', price: 250 }, { label: 'Blue', price: 100 }])] }));
    assert.equal(product.options.length, 1);
    assert.deepEqual(product.options[0].choices.map(choice => [choice.key, Boolean(choice.fromTemplate)]), [['black', true], ['white', true], ['red', false], ['blue', false]]);
    assert.deepEqual(product.ownOptions[0].choices.map(choice => choice.key), ['red', 'blue']);
    assert.equal(ok(await getPrice(product.id, { color: 'red' })).unit, 1250);
    const [error] = await setChoiceAvailability(product.id, 'color', 'black', false);
    assert.equal(error.code, 400);
    ok(await setChoiceAvailability(product.id, 'color', 'red', false));
  });

  test('a product can add options and attributes of its own', async () => {
    const product = ok(await createProduct({
      name: 'Camaro', price: 1000, template: 'model-car',
      options: [{ key: 'wheels', label: 'Wheels', choices: [{ label: 'Chrome' }] }],
      attributeDefs: [{ label: 'Engine', type: 'text' }],
      attributes: { engine: 'V8', scale: '1:18' },
    }));
    assert.deepEqual(product.options.map(option => option.key), ['color', 'wheels']);
    assert.deepEqual(product.attributeDefs.map(attribute => attribute.key), ['engine']);
    assert.deepEqual(product.attributes, { engine: 'V8', scale: '1:18' });
    refused(await createProduct({ name: 'Clash', price: 1, template: 'model-car', attributeDefs: [{ label: 'Scale', type: 'text' }] }), 409);
    refused(await createProduct({ name: 'Clash two', price: 1, attributeDefs: [{ label: 'Weight', type: 'text' }] }), 409);
    refused(await createProduct({ name: 'Unknown', price: 1, attributes: { engine: 'V8' } }), 400);
    const dropped = ok(await updateProduct(product.id, { attributeDefs: [] }));
    assert.deepEqual(dropped.attributes, { scale: '1:18' });
  });

  test('a required attribute a template gives a default can be left blank', async () => {
    ok(await updateTemplate('model-car', { attributes: [{ label: 'Scale', type: 'select', options: ['1:18', '1:24'] }, { label: 'Size', type: 'text', required: true }], defaults: { weight: 16, scale: '1:24', size: '5in x 3in' } }));
    const product = ok(await createProduct({ name: 'Needs size', price: 1, template: 'model-car' }));
    assert.equal(product.inherited.size, '5in x 3in');
    ok(await updateTemplate('model-car', { defaults: { weight: 16, scale: '1:24' } }));
    refused(await createProduct({ name: 'No size', price: 1, template: 'model-car' }), 400);
    ok(await updateTemplate('model-car', { defaults: { weight: 16, scale: '1:24', size: '5in x 3in' } }));
  });

  test('a filter sees a template default for a product that leaves the attribute blank', async () => {
    const plain = ok(await createProduct({ name: 'Filter plain', price: 1, status: 'published', template: 'model-car' }));
    const own = ok(await createProduct({ name: 'Filter own', price: 1, status: 'published', template: 'model-car', attributes: { scale: '1:18' } }));
    const found = ok(await getProducts({ filters: { scale: '1:24' } })).items.map(product => product.id);
    assert.ok(found.includes(plain.id));
    assert.ok(!found.includes(own.id));
  });

  test('a template that products are made from cannot be deleted', async () => {
    refused(await deleteTemplate('model-car'), 409);
    ok(await createTemplate({ name: 'Spare' }));
    ok(await deleteTemplate('spare'));
  });

  test('an extension registers a template, owns its name, and others can still edit its contents', async () => {
    ok(await registerTemplate('ext-cars', { name: 'Truck', defaults: { weight: 40 } }));
    ok(await registerTemplate('ext-cars', { name: 'Truck', defaults: { weight: 40 } }));
    refused(await registerTemplate('ext-other', { name: 'Truck' }), 409);
    refused(await updateTemplate('truck', { name: 'Lorry' }), 403);
    ok(await updateTemplate('truck', { defaults: { weight: 45 } }));
    refused(await deleteTemplate('truck'), 403);
    assert.equal(ok(await unregisterTemplates('ext-cars')).removed, 1);
    assert.equal(ok(await getTemplates({ owner: 'ext-cars' })).length, 0);
  });

  test('a product with no template is unchanged', async () => {
    const product = ok(await createProduct({ name: 'Plain old', price: 5 }));
    assert.equal(product.template, '');
    assert.deepEqual(product.inherited, {});
    assert.deepEqual(ok(await getProduct(product.id)).options, []);
  });

  test('a template can give a product its type, price, price label, description, tags and categories', async () => {
    ok(await registerProductType('ext-ship', { key: 'physical', name: 'Physical Item' }));
    ok(await createCategory({ name: 'Model cars' }));
    ok(await createTemplate({ name: 'Priced', product: { productType: 'physical', price: 1999, minimumPrice: 1500, priceLabel: 'Ask us', description: '<p>Hand built</p>', tags: ['Die cast'], categories: ['model-cars'] } }));
    const plain = ok(await createProduct({ name: 'Inherits all', template: 'priced' }));
    assert.equal(plain.productType, 'physical');
    assert.equal(plain.price, 1999);
    assert.equal(plain.minimumPrice, 1500);
    assert.equal(plain.priceLabel, 'Ask us');
    assert.equal(plain.description, '<p>Hand built</p>');
    assert.deepEqual(plain.tags, ['die cast']);
    assert.deepEqual(plain.categories, ['model-cars']);
    assert.deepEqual(plain.own, { productType: '', price: null, minimumPrice: null, priceLabel: '', description: '', tags: [], categories: [] });
    assert.equal(ok(await getPrice(plain.id)).unit, 1999);

    const own = ok(await createProduct({ name: 'Overrides', template: 'priced', price: 2500, productType: 'generic', tags: ['rare'] }));
    assert.equal(own.price, 2500);
    assert.equal(own.productType, 'generic');
    assert.deepEqual(own.tags, ['rare']);
    assert.equal(own.priceLabel, 'Ask us');
    assert.equal(own.own.price, 2500);

    const cleared = ok(await updateProduct(own.id, { price: null, productType: '' }));
    assert.equal(cleared.price, 1999);
    assert.equal(cleared.productType, 'physical');

    ok(await updateTemplate('priced', { product: { productType: 'physical', price: 2999 } }));
    assert.equal(ok(await getProduct(plain.id)).price, 2999);
    assert.equal(ok(await getProduct(plain.id)).description, '');
    assert.equal(ok(await getProduct(own.id)).price, 2999);
    ok(await updateProduct(own.id, { template: '' }));
    assert.equal(ok(await getProduct(own.id)).price, null);
    assert.equal(ok(await getProduct(own.id)).productType, 'generic');
  });

  test('what a template gives a product is checked', async () => {
    refused(await createTemplate({ name: 'Bad type', product: { productType: 'no-such-type' } }), 400);
    refused(await createTemplate({ name: 'Bad price', product: { price: -5 } }), 400);
    refused(await createTemplate({ name: 'Floor over price', product: { price: 100, minimumPrice: 200 } }), 400);
    refused(await createTemplate({ name: 'Bad category', product: { categories: ['nope'] } }), 400);
    refused(await createTemplate({ name: 'Not an object', product: 'x' }), 400);
    const blank = ok(await createTemplate({ name: 'Blanks', product: { price: '', priceLabel: '  ', tags: [], categories: [] } }));
    assert.deepEqual(blank.product, {});
    ok(await unregisterProductTypes('ext-ship'));
  });
});
