import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/*
  This extension's icons ship with it, in public/icons (served at /products/icons/…), and the admin menu
  names them with icon-src. A link to a file that is not in the package would show the fallback icon.
*/
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('every icon the admin menu loads from this extension is in the package, and drawn the way k-icon expects', async () => {
  const nav = await readFile(path.join(root, 'admin', 'nav.global.html'), 'utf8');
  const sources = [...nav.matchAll(/(?:icon-src|group-icon-src)="([^"]+)"/g)].map(match => match[1]);
  assert.ok(sources.length >= 2, 'the Products link and its group use an icon file');
  for(const source of new Set(sources)){
    assert.ok(source.startsWith('/products/icons/'), `${source} is under this extension's scope`);
    const file = path.join(root, 'public', source.slice('/products/'.length));
    assert.ok(existsSync(file), `${source} is in public/`);
    const svg = await readFile(file, 'utf8');
    assert.match(svg, /viewBox="0 (?:-960|0) 960 960"/, "a 960 square, which is what k-icon draws correctly");
    assert.doesNotMatch(svg, /stroke=/, 'filled, not outlined with strokes');
  }
});

test('the icons folder is published with the package', async () => {
  const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  assert.ok(packageJson.files.includes('public'), 'public/, and so public/icons, is in "files"');
});
