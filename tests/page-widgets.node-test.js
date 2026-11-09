import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

/*
  The product widgets the page builder offers. kempo's registry code cleans each declaration (so a declaration it
  would refuse fails here and not in somebody's editor), and kempo-ui's page renderer takes a page through each
  widget. The kempo-ui modules are loaded from the installed kempo-ui, so they are the ones kempo's registry adds the
  widgets to.
*/

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const load = async file => import(pathToFileURL(file).href);
const kempo = relative => load(path.join(root, 'node_modules', 'kempo', relative));
const ui = relative => load(path.join(root, 'node_modules', 'kempo-ui', 'src', relative));

const config = JSON.parse(await readFile(path.join(root, 'kempo-config.json'), 'utf8'));
const { normalizeExtensionWidget } = await kempo('server/utils/sitebuilder/registry.js');
const validateTree = (await kempo('server/utils/sitebuilder/validateTree.js')).default;
const { widgets, addWidget, registryOf } = await ui('utils/pageWidgets.js');
const { renderPage, collectModules } = await ui('utils/renderPage.js');
const { createNode } = await ui('utils/pageTree.js');

const declared = config.page_widgets.map(definition => normalizeExtensionWidget('kempo-products', definition));
declared.filter(([error]) => !error).forEach(([, widget]) => addWidget(widget));
const registry = registryOf(widgets);
const listingName = 'kempo-products-listing';
const productName = 'kempo-products-product';
const parentName = 'kempo-products-parent';
const galleryName = 'kempo-products-gallery';
const titleName = 'kempo-products-title';
const priceName = 'kempo-products-price';
const optionsName = 'kempo-products-options';
const detailsName = 'kempo-products-details';
const shortDescriptionName = 'kempo-products-short-description';
const descriptionName = 'kempo-products-description';
const productId = '9a76f81adc324890';

/* What the server keeps of a page's widgets, which is what is written to the page. */
const written = nodes => renderPage(validateTree(nodes, registry)[1], registry);

test('every declaration is one kempo accepts', () => {
  const errors = declared.filter(([error]) => error).map(([error]) => error.msg);
  assert.deepEqual(errors, []);
  assert.equal(config.page_widgets.length, 10);
});

test('the files the declarations point at exist', async () => {
  const files = {};
  for(const definition of config.page_widgets){
    const { page_component, editor_component, settings_component, iconSrc } = definition;
    files[page_component] = `public/${page_component.replace(/^\/products\//, '')}`;
    if(editor_component) files[editor_component] = `admin/${editor_component.split('/kempo-products/')[1]}`;
    if(settings_component) files[settings_component] = `admin/${settings_component.split('/kempo-products/')[1]}`;
    if(iconSrc) files[iconSrc] = `public/${iconSrc.replace(/^\/products\//, '')}`;
  }
  for(const [url, file] of Object.entries(files)){
    await assert.doesNotReject(access(path.join(root, file)), `${url} should be ${file}`);
  }
});

test('a plain product list is written as its element with nothing set', () => {
  const html = renderPage([createNode(listingName, {})], registry);
  assert.ok(html.startsWith('<k-products-listing-widget'), html);
  assert.doesNotMatch(html, /category=|tag=|sort=|page-size=/);
});

test('a limited product list is written with every limit it was given', () => {
  const attrs = { category: 'shirts', tag: 'new', availability: 'available', 'in-stock': true, sort: 'price-asc', 'page-size': 24, 'hide-controls': true };
  const html = written([createNode(listingName, attrs)]);
  for(const part of ['category="shirts"', 'tag="new"', 'availability="available"', ' in-stock', 'sort="price-asc"', 'page-size="24"', ' hide-controls']){
    assert.ok(html.includes(part), `${part} is missing: ${html}`);
  }
});

test('a product is written with its id, and with none when it has none', () => {
  const html = renderPage([createNode(productName, { 'product-id': productId })], registry);
  assert.ok(html.startsWith('<k-products-product-widget') && html.includes(`product-id="${productId}"`), html);
  assert.doesNotMatch(renderPage([createNode(productName, {})], registry), /product-id/);
});

test('the editor shows cards for the list and the product, and each has settings of its own', () => {
  for(const [name, editorTag, settingsTag] of [[listingName, 'k-products-listing-editor', 'k-products-listing-settings'], [productName, 'k-products-product-editor', 'k-products-product-settings']]){
    assert.ok(renderPage([createNode(name, {})], registry, { editor: true }).startsWith(`<${editorTag}`), name);
    assert.equal(registry.get(name).settingsTag, settingsTag);
  }
  assert.equal(registry.get(parentName).settingsTag, 'k-products-product-settings');
});

test('the product gallery is written with its settings, and with none by default', () => {
  const html = written([createNode(galleryName, { 'thumbs-position': 'left', ratio: '4/3', 'no-fullscreen': true })]);
  for(const part of ['thumbs-position="left"', 'ratio="4/3"', ' no-fullscreen']) assert.ok(html.includes(part), `${part} in ${html}`);
  const plain = written([createNode(galleryName, {})]);
  assert.ok(!/thumbs-position|ratio|no-fullscreen/.test(plain), plain);
});

test('a product\'s media is its images and videos, and its picture is the first image or a video with a thumbnail', async () => {
  const { mediaOf, primaryPicture } = await load(path.join(root, 'public', 'utils', 'productMedia.js'));
  const assets = {
    a: { kind: 'video', path: '/m/a.mp4', thumbnail: null },
    b: { kind: 'video', path: '/m/b.mp4', thumbnail: '/m/b.jpg' },
    c: { kind: 'image', path: '/m/c.jpg', thumbnail: '/m/c-small.jpg' },
    d: { kind: 'archive', path: '/m/d.zip', thumbnail: null }
  };
  assert.deepEqual(mediaOf({ images: ['a', 'b', 'c', 'd', 'gone'] }, assets).map(asset => asset.path), ['/m/a.mp4', '/m/b.mp4', '/m/c.jpg']);
  assert.equal(primaryPicture({ images: ['a', 'b', 'c'] }, assets).path, '/m/c.jpg');
  assert.equal(primaryPicture({ images: ['a', 'b'] }, assets).path, '/m/b.mp4');
  assert.equal(primaryPicture({ images: ['a', 'd'] }, assets), null);
  assert.equal(primaryPicture({ images: [] }, assets), null);
});

test('the product title and price can be set inline, and are written with no inline attribute otherwise', () => {
  for(const name of [titleName, priceName]){
    assert.ok(written([createNode(name, { inline: true })]).includes('inline="true"'), name);
    assert.ok(!written([createNode(name, {})]).includes('inline='), name);
  }
});

test('a parent product holds its parts in columns, and loads each part\'s component once', () => {
  const columns = createNode('columns', {}, { default: [
    createNode('column', {}, { default: [createNode(titleName, {})] }),
    createNode('column', {}, { default: [createNode(priceName, {})] })
  ] });
  const parts = [columns, createNode(galleryName, {}), createNode(shortDescriptionName, {}), createNode(optionsName, {}), createNode(descriptionName, {}), createNode(detailsName, {})];
  const nodes = [createNode(parentName, { 'product-id': productId }, { default: parts })];
  const [error, kept] = validateTree(nodes, registry);
  assert.equal(error, null);
  const html = renderPage(kept, registry);
  assert.ok(html.startsWith('<k-products-parent-widget') && html.includes(`product-id="${productId}"`), html);
  assert.ok(html.indexOf('<k-products-title-widget') < html.indexOf('<k-products-price-widget') && html.includes('<k-products-gallery-widget'), html);
  const modules = collectModules(kept, registry);
  assert.equal(modules.filter(url => url === '/products/components/ParentProductWidget.js').length, 1);
  for(const part of ['Title', 'Price', 'Gallery', 'ShortDescription', 'Options', 'Description', 'Details']) assert.ok(modules.includes(`/products/components/${part}Widget.js`), part);
});

test('every product widget is in the Products group, as the commerce widgets are', () => {
  for(const definition of config.page_widgets){
    assert.equal(definition.category, 'products', definition.key);
    assert.equal(definition.category_title, 'Products', definition.key);
  }
});

test('the product options widget is written with the choices a page starts on, and keeps nothing when none are set', async () => {
  const { parseDefaults, defaultsText, usableDefaults } = await import(pathToFileURL(path.join(root, 'public/utils/optionDefaults.js')).href);
  const text = defaultsText({ size: 'large', colour: 'red' });
  const html = written([createNode(optionsName, { defaults: text })]);
  assert.ok(html.startsWith('<k-products-options-widget') && html.includes('defaults="'), html);
  assert.deepEqual(parseDefaults(text), { colour: 'red', size: 'large' });
  assert.ok(!written([createNode(optionsName, {})]).includes('defaults='));
  assert.deepEqual(parseDefaults('not json'), {});
  assert.deepEqual(parseDefaults(defaultsText({ size: '', colour: 'red' })), { colour: 'red', size: '' });
  const product = { options: [{ key: 'size', choices: [{ key: 'small', available: true }, { key: 'large', available: false }] }] };
  assert.deepEqual(usableDefaults(product, { size: 'large', extra: 'x' }), {});
  assert.deepEqual(usableDefaults(product, { size: 'small' }), { size: 'small' });
});

test('the short and full description widgets are written as their own elements, with nothing to set', () => {
  const short = renderPage([createNode(shortDescriptionName, {})], registry);
  const full = renderPage([createNode(descriptionName, {})], registry);
  assert.ok(short.startsWith('<k-products-short-description-widget'), short);
  assert.ok(full.startsWith('<k-products-description-widget'), full);
  assert.doesNotMatch(short + full, /defaults=|inline=|product-id/);
});

test('the Product widget has the product page\'s slots, written on the page with the slot attribute and in the builder as places to drop into', () => {
  const definition = registry.get(productName);
  assert.deepEqual(definition.slots.map(slot => slot.name), ['actions', 'before-options', 'before-description', 'after-description', 'extra', 'price']);
  const nodes = [createNode(productName, { 'product-id': productId }, { actions: [createNode(titleName, {})], 'after-description': [createNode(priceName, {})] })];
  const page = written(nodes);
  assert.ok(page.startsWith('<k-products-product-widget'), page);
  assert.match(page, /<k-products-title-widget[^>]* slot="actions"/);
  assert.match(page, /<k-products-price-widget[^>]* slot="after-description"/);
  assert.doesNotMatch(page, /data-pb/);
  const builder = renderPage(nodes, registry, { editor: true });
  assert.ok(builder.startsWith('<k-products-product-editor'), builder);
  for(const slot of definition.slots) assert.ok(builder.includes(`<div slot="${slot.name}" data-pb-id=`), `${slot.name} is not a place to drop into`);
  assert.match(builder, /data-pb-slot="actions" data-pb-title="Under the options"><k-products-title-widget/);
});

test('the Product widget passes its slots on to the product page, and its builder copy draws every place to drop into', async () => {
  const { readFile } = await import('node:fs/promises');
  const page = await readFile(path.join(root, 'public/components/ProductWidget.js'), 'utf8');
  const editor = await readFile(path.join(root, 'admin/components/sitebuilder/ProductWidgetEditor.js'), 'utf8');
  const detail = await readFile(path.join(root, 'public/components/ProductDetail.js'), 'utf8');
  for(const name of ['actions', 'before-options', 'before-description', 'after-description', 'extra', 'price']){
    assert.ok(page.includes(`'${name}'`), `${name} is not passed on`);
  }
  assert.ok(page.includes('<slot name=${name} slot=${name}></slot>'));
  assert.ok(detail.includes("this.renderSlot('before-options'") && detail.includes('<slot name="price">'));
  assert.ok(editor.includes('extends ProductWidget') && editor.includes('get editing()'));
  for(const part of ['get product()', 'get selections()', 'get price()', 'get complete()', 'get config()', 'money(minor)']){
    assert.ok(page.includes(part), `a part inside cannot read ${part} from the Product widget`);
  }
});
