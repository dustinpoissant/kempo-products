import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { renderExternalPage } from 'kempo-server/templating';

/*
  This extension answers on two scopes: /products from public/, and /categories from public-categories/.
  Kempo reads that from kempo-config.json ("public-scopes"), refuses to install or enable it beside an
  extension that claims either address, and serves each from its own folder.
*/

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const kempo = file => import(pathToFileURL(path.join(root, 'node_modules', 'kempo', 'server', 'utils', 'extensions', file)).href);

const config = JSON.parse(await readFile(path.join(root, 'kempo-config.json'), 'utf8'));
const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));

test('the declaration is valid, and each scope names a folder that exists', async () => {
  const { normalizeScopes } = await kempo('scopes.js');
  const [error, scopes] = normalizeScopes(config);
  assert.equal(error, null);
  assert.deepEqual(scopes, [{ scope: 'products', dir: 'public' }, { scope: 'categories', dir: 'public-categories' }]);
  for(const { dir } of scopes) assert.ok(existsSync(path.join(root, dir)), `${dir} exists`);
});

test('the folder that serves /categories is published with the package', () => {
  assert.ok(packageJson.files.includes('public-categories'), 'it is in "files", or an installed copy would have no categories page');
  assert.ok(packageJson.files.includes('public'));
});

test('the extension\'s own addresses do not collide with each other', async () => {
  const { claimsOf, findClaimConflicts } = await kempo('claims.js');
  assert.deepEqual(claimsOf(config), ['/products', '/categories']);
  assert.deepEqual(findClaimConflicts([{ name: 'kempo-products', kempo: config }], [{ name: 'kempo-products', kempo: config }]), []);
});

test('the /categories page lists the categories', async () => {
  const base = await mkdtemp(path.join(tmpdir(), 'kempo-products-scopes-'));
  const site = path.join(base, 'site');
  try {
    await mkdir(site);
    await writeFile(path.join(site, 'default.template.html'), '<!DOCTYPE html><html><body><main><location /></main></body></html>');
    const html = await renderExternalPage(path.join(root, 'public-categories', 'index.page.html'), site, site, {}, {}, 10, [], [path.join(root, 'public')]);
    assert.match(html, /<h1>Categories<\/h1>/);
    assert.ok(html.includes('<k-products-category-list></k-products-category-list>'));
    assert.ok(html.includes('/products/components/CategoryList.js'), 'it loads its component from the products scope');
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test('the categories component links each category to the filtered product list, and leaves out empty ones', async () => {
  const source = await readFile(path.join(root, 'public', 'components', 'CategoryList.js'), 'utf8');
  assert.ok(source.includes('/products/?category=${encodeURIComponent(category.key)}'));
  assert.ok(source.includes('category.count > 0'));
  assert.ok(source.includes("customElements.define('k-products-category-list'"));
});
