import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

/*
  Another extension puts files into a product through the Media tab's `upload` slot. That is a contract made of markup, so it
  is checked as markup: the pages have the location inside the tab, the tab forwards the slot to the field, the field has the
  slot and listens for what an uploader says, and nothing in it uploads on its own any more.
*/

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => readFile(path.join(root, file), 'utf8');

test('the product edit and new pages put the media upload location inside the media tab', async () => {
  for(const page of ['admin/edit/index.page.html', 'admin/new/index.page.html']){
    const html = await read(page);
    assert.match(html, /<k-products-media-tab>\s*<location name="products-admin-media-upload"\s*\/>\s*<\/k-products-media-tab>/, page);
  }
});

test('the media tab forwards its upload slot into the field, and the field has the slot', async () => {
  const tab = await read('public/components/ProductMediaTab.js');
  assert.match(tab, /<k-products-images[\s\S]*?<slot name="upload" slot="upload"><\/slot>\s*<\/k-products-images>/);
  const field = await read('public/components/ImagesField.js');
  assert.match(field, /<slot name="upload"><\/slot>/);
});

test('the field adds each uploaded asset to the product and does not upload for itself', async () => {
  const field = await read('public/components/ImagesField.js');
  assert.match(field, /addEventListener\('media-uploaded'/);
  assert.match(field, /removeEventListener\('media-uploaded'/);
  assert.ok(!/type="file"|uploadMedia|XMLHttpRequest/.test(field), 'the field should leave uploading to whatever is in the slot');
});
