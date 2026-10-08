import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { EVENTS } from '../server/utils/events.js';
import { RESERVED_SLUGS } from '../server/utils/slug.js';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const config = JSON.parse(read('kempo-config.json'));
const pkg = JSON.parse(read('package.json'));
const permissionNames = config.permissions.map(permission => permission.name);

test('every permission is products:<something>', () => {
  for(const name of permissionNames) assert.match(name, /^products:[a-z:]+$/);
});

test('groups only reference declared permissions (or panel access)', () => {
  for(const group of config.groups){
    assert.match(group.name, /^kempo-products:/);
    for(const permission of group.permissions) assert.ok(permissionNames.includes(permission) || permission === 'system:admin:access', permission);
  }
});

test('groups form a ladder: viewer < manager < admin, and only admin sets up types', () => {
  const group = name => new Set(config.groups.find(candidate => candidate.name === `kempo-products:${name}`).permissions);
  const [viewer, manager, admin] = ['viewer', 'manager', 'admin'].map(group);
  for(const permission of viewer) assert.ok(manager.has(permission));
  for(const permission of manager) assert.ok(admin.has(permission));
  assert.ok(!manager.has('products:types:manage'));
  assert.ok(admin.has('products:types:manage'));
  assert.ok(!viewer.has('products:update'));
});

test('settings are declared with a name, a value, a type and a description', () => {
  for(const setting of config.settings){
    assert.ok(setting.name && setting.description);
    assert.ok(['string', 'number', 'boolean'].includes(setting.type), setting.name);
    assert.notEqual(setting.value, undefined);
  }
});

test('the public scope matches between the config and the package', () => {
  assert.equal(config['public-scope'], pkg.kempo['public-scope']);
  assert.equal(config['public-scope'], 'products');
});

test('every event is prefixed and documented in the README', () => {
  const lines = read('README.md').split(/\r?\n/);
  /* Documented means a README line names the resource's events and the event's own word: "product:created", ..., "updated". */
  const documented = event => {
    const [prefix, resource, name] = event.split(':');
    return lines.some(line => line.includes(`${prefix}:${resource}:`) && line.split(/[^a-z_]+/).includes(name));
  };
  for(const event of Object.values(EVENTS)){
    assert.match(event, /^kempo-products:/);
    assert.ok(documented(event), `${event} is not in the README`);
  }
});

test('every permission and setting is documented in the README', () => {
  const readme = read('README.md');
  for(const name of permissionNames) assert.ok(readme.includes(name), name);
  for(const setting of config.settings) assert.ok(readme.includes(`\`${setting.name}\``), setting.name);
});

test('the files the package ships exist', () => {
  for(const file of pkg.files) assert.ok(existsSync(new URL(`../${file}`, import.meta.url)), file);
  for(const target of Object.values(pkg.exports)) assert.ok(existsSync(new URL(`../${target}`, import.meta.url)), target);
});

test('the reserved slugs cover every top-level name in public/', () => {
  const top = ['api', 'components', 'sdk.js', 'index.page.html', '[slug]'];
  for(const name of top.filter(entry => !entry.startsWith('[') && !entry.endsWith('.html'))) assert.ok(RESERVED_SLUGS.includes(name) || RESERVED_SLUGS.includes(name.replace('.js', '')), name);
});
