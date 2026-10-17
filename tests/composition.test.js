import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderExternalPage } from 'kempo-server/templating';

/*
  Extensions sit outside the site's folder, as they do in node_modules, or they would be scanned twice.

  Other extensions add to the product list and the product page by composition: the pages carry
  locations, an extension fills them with a *.global.html file, and the browser-side components find
  where they sit. This renders the real pages through kempo-server, as a site does, with a stand-in
  extension, to prove the server half: what an extension contributes ends up inside the one card
  template and the detail page's slots, and its script lands outside the template.
*/

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(root, 'public');

const withSite = async (extensions, fn) => {
  const base = await mkdtemp(path.join(tmpdir(), 'kempo-products-composition-'));
  const dir = path.join(base, 'site');
  try {
    await mkdir(dir);
    await writeFile(path.join(dir, 'default.template.html'), '<!DOCTYPE html><html><body><main><location /></main><location name="scripts" /></body></html>');
    const dirs = [];
    for(const [name, files] of Object.entries(extensions)){
      const extensionPublic = path.join(base, 'node_modules', name, 'public');
      await mkdir(extensionPublic, { recursive: true });
      for(const [file, content] of Object.entries(files)) await writeFile(path.join(extensionPublic, file), content);
      dirs.push(extensionPublic);
    }
    await fn(dir, dirs);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
};

const render = (dir, dirs, page) => renderExternalPage(path.join(publicDir, page), dir, dir, {}, {}, 10, dirs, [publicDir, ...dirs]);

const SHOP = {
  'product-actions.global.html': [
    '<content location="products-scripts"><script type="module" src="/shop/AddToCart.js"></script></content>',
    '<content location="products-card-actions" priority="60"><k-shop-add-to-cart slot="actions"></k-shop-add-to-cart></content>',
    '<content location="products-detail-actions" priority="60"><k-shop-add-to-cart slot="actions"></k-shop-add-to-cart></content>',
  ].join('\n'),
};

const SALES = {
  'sale-price.global.html': [
    '<content location="products-card-price"><k-sales-price slot="price"></k-sales-price></content>',
    '<content location="products-detail-price"><k-sales-price slot="price"></k-sales-price></content>',
  ].join('\n'),
};

const templateOf = html => html.match(/<template data-products-card>([\s\S]*?)<\/template>/)?.[1] ?? null;

test('the product list carries one card template, and an extension fills it', async () => {
  await withSite({ 'kempo-shop': SHOP }, async (dir, dirs) => {
    const html = await render(dir, dirs, 'index.page.html');
    assert.equal(html.match(/<template data-products-card>/g)?.length, 1, 'exactly one template');
    assert.match(templateOf(html), /<k-shop-add-to-cart slot="actions"><\/k-shop-add-to-cart>/, 'names the card slot it fills');
    assert.doesNotMatch(templateOf(html), /<div/, 'no wrapper, which would always occupy a slot');
    assert.ok(html.includes('<k-products-list></k-products-list>'));
    assert.doesNotMatch(html, /<location/, 'every location is filled or removed');
  });
});

test('an extension\'s script is loaded outside the template, so it runs once', async () => {
  await withSite({ 'kempo-shop': SHOP }, async (dir, dirs) => {
    const html = await render(dir, dirs, 'index.page.html');
    const script = '<script type="module" src="/shop/AddToCart.js"></script>';
    assert.equal(html.split(script).length - 1, 1);
    assert.ok(!templateOf(html).includes('<script'), 'no script inside the template');
    assert.ok(html.indexOf(script) > html.indexOf('</template>'), 'after the template');
  });
});

test('several extensions stack in the card, highest priority first', async () => {
  await withSite({
    'kempo-shop': SHOP,
    'kempo-wishlist': { 'wish.global.html': '<content location="products-card-actions" priority="40"><k-wish-heart slot="actions"></k-wish-heart></content>' },
    'kempo-badges': { 'badge.global.html': '<content location="products-card-actions" priority="90"><k-badge-new slot="actions"></k-badge-new></content>' },
  }, async (dir, dirs) => {
    const card = templateOf(await render(dir, dirs, 'index.page.html'));
    const at = tag => card.indexOf(tag);
    assert.ok(at('<k-badge-new') >= 0 && at('<k-badge-new') < at('<k-shop-add-to-cart') && at('<k-shop-add-to-cart') < at('<k-wish-heart'), card);
  });
});

test('with no extension adding to it the list still renders, and nothing occupies a slot', async () => {
  await withSite({}, async (dir, dirs) => {
    const html = await render(dir, dirs, 'index.page.html');
    assert.doesNotMatch(templateOf(html), /slot=|<k-|<div/, 'nothing in the template, so every slot shows its default');
    assert.ok(html.includes('<k-products-list>'));
  });
});

test('an extension fills the price slot, which has a default, through its own location', async () => {
  await withSite({ 'kempo-sales': SALES }, async (dir, dirs) => {
    const card = templateOf(await render(dir, dirs, 'index.page.html'));
    assert.match(card, /<k-sales-price slot="price"><\/k-sales-price>/);
    const page = (await render(dir, dirs, '[slug]/index.page.html')).split(/>\s+</).join('><');
    assert.match(page, /<k-products-detail><k-sales-price slot="price"><\/k-sales-price><\/k-products-detail>/, 'a direct child of the page, with no wrapper');
  });
});

test('with nothing contributing, the product page has no children, so every slot shows its default', async () => {
  await withSite({}, async (dir, dirs) => {
    const page = (await render(dir, dirs, '[slug]/index.page.html')).split(/>\s+</).join('><');
    assert.match(page, /<k-products-detail><\/k-products-detail>/);
  });
});

test('the product page fills its slots from the two locations, and loads scripts once', async () => {
  await withSite({
    'kempo-shop': SHOP,
    'kempo-reviews': { 'reviews.global.html': '<content location="products-detail-extra"><k-reviews-list slot="extra"></k-reviews-list></content>' },
  }, async (dir, dirs) => {
    const html = (await render(dir, dirs, '[slug]/index.page.html')).split(/>\s+</).join('><');
    assert.match(html, /<k-products-detail><k-shop-add-to-cart slot="actions"><\/k-shop-add-to-cart>/);
    assert.match(html, /<k-reviews-list slot="extra"><\/k-reviews-list><\/k-products-detail>/);
    assert.equal(html.split('/shop/AddToCart.js').length - 1, 1);
    assert.doesNotMatch(html, /<location/);
  });
});

test('the card declares a slot and the list fills it, so the card knows nothing about templates', async () => {
  const { readFile } = await import('node:fs/promises');
  const card = await readFile(path.join(publicDir, 'components/ProductCard.js'), 'utf8');
  assert.ok(card.includes('<slot name="actions"></slot>'));
  assert.ok(card.includes("setAttribute('product-id'"));
  assert.doesNotMatch(card, /importNode|LightComponent|\.template/, 'no template handling in the card');
  const list = await readFile(path.join(publicDir, 'components/ProductList.js'), 'utf8');
  assert.ok(list.includes('document.importNode(template.content, true)'));
  assert.ok(list.includes('${this.slottedFor(product)}</k-products-card>'));
  const detail = await readFile(path.join(publicDir, 'components/ProductDetail.js'), 'utf8');
  assert.ok(detail.includes('get product()') && detail.includes('<slot name="actions"></slot>'));
});

test('what an extension is likely to want to replace is a slot with real default content', async () => {
  const { readFile } = await import('node:fs/promises');
  const card = await readFile(path.join(publicDir, 'components/ProductCard.js'), 'utf8');
  const detail = await readFile(path.join(publicDir, 'components/ProductDetail.js'), 'utf8');
  assert.match(card, /<slot name="price">\$\{this\.priceText \? [\s\S]*?\}<\/slot>/, 'the card\'s price shows by default');
  assert.match(detail, /<slot name="price"><div class="large mb" aria-live="polite">\$\{this\.priceLine\}[\s\S]*?<\/slot>/, 'the page\'s price line shows by default');
});

/*
  The admin pages take buttons the same way: the product form has an `actions` slot, and each category's row
  clones one template into a small item element that has one.
*/
const adminDir = path.join(root, 'admin');
const renderAdmin = (dir, dirs, page) => renderExternalPage(path.join(adminDir, page), dir, dir, {}, {}, 10, dirs, [publicDir, ...dirs]);

const DISCOUNTS = {
  'admin-buttons.global.html': [
    '<content location="products-admin-scripts"><script type="module" src="/discounts/Buttons.js"></script></content>',
    '<content location="products-admin-product-actions"><k-discounts-product-button slot="actions"></k-discounts-product-button></content>',
    '<content location="products-admin-category-actions"><k-discounts-category-button slot="actions"></k-discounts-category-button></content>',
  ].join('\n'),
};

test('the product edit and new pages put an extension\'s button straight into the form, with its script outside', async () => {
  await withSite({ 'kempo-discounts': DISCOUNTS }, async (dir, dirs) => {
    for(const page of ['edit/index.page.html', 'new/index.page.html']){
      const html = (await renderAdmin(dir, dirs, page)).split(/>\s+</).join('><');
      assert.match(html, /<k-discounts-product-button slot="actions"><\/k-discounts-product-button><\/k-products-form>/, `${page}: a direct child of the form`);
      assert.equal(html.split('/discounts/Buttons.js').length - 1, 1, `${page}: the script loads once`);
      assert.ok(html.indexOf('/discounts/Buttons.js') > html.indexOf('</k-products-form>'), `${page}: outside the form`);
      assert.doesNotMatch(html, /<location/, `${page}: every location is filled or removed`);
    }
  });
});

test('the category page carries one template for the rows, filled by an extension, with its script outside it', async () => {
  await withSite({ 'kempo-discounts': DISCOUNTS }, async (dir, dirs) => {
    const html = (await renderAdmin(dir, dirs, 'categories/index.page.html')).split(/>\s+</).join('><');
    assert.equal(html.match(/<template>/g)?.length, 1, 'exactly one template');
    assert.match(html, /<template><k-discounts-category-button slot="actions"><\/k-discounts-category-button><\/template>/);
    assert.ok(html.indexOf('/discounts/Buttons.js') > html.indexOf('</template>'), 'the script is after the template');
    assert.doesNotMatch(html, /<location/);
  });
});

test('with nothing contributing the admin pages have no extra buttons', async () => {
  await withSite({}, async (dir, dirs) => {
    const html = (await renderAdmin(dir, dirs, 'edit/index.page.html')).split(/>\s+</).join('><');
    assert.doesNotMatch(html, /slot="actions"|<location/);
    const categories = (await renderAdmin(dir, dirs, 'categories/index.page.html')).split(/>\s+</).join('><');
    assert.match(categories, /<template><\/template>/, 'an empty template adds nothing to a row');
  });
});

test('the form declares an actions slot, and the category list fills a per-row item the same way the product list fills a card', async () => {
  const { readFile } = await import('node:fs/promises');
  const form = await readFile(path.join(publicDir, 'components/ProductForm.js'), 'utf8');
  assert.ok(form.includes('<slot name="actions"></slot>'));
  const item = await readFile(path.join(publicDir, 'components/CategoryActions.js'), 'utf8');
  assert.ok(item.includes('<slot name="actions"></slot>') && item.includes("'k-products-category-actions'"));
  assert.doesNotMatch(item, /importNode|template/, 'the item knows nothing about templates');
  const list = await readFile(path.join(publicDir, 'components/CategoriesManager.js'), 'utf8');
  assert.ok(list.includes('document.importNode(template.content, true)') && list.includes('new WeakMap()'));
  assert.ok(list.includes('<k-products-category-actions .category=${category}>${this.itemContent(category)}</k-products-category-actions>'));
});
