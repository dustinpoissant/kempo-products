import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, toCsv, toRecords } from '../server/utils/csv.js';

test('plain rows parse, with LF or CRLF endings', () => {
  assert.deepEqual(parseCsv('a,b,c\n1,2,3'), [['a', 'b', 'c'], ['1', '2', '3']]);
  assert.deepEqual(parseCsv('a,b\r\n1,2\r\n'), [['a', 'b'], ['1', '2']]);
});

test('quoted cells hold commas, doubled quotes and line breaks', () => {
  assert.deepEqual(parseCsv('"a,b","say ""hi""","line\nbreak"'), [['a,b', 'say "hi"', 'line\nbreak']]);
});

test('empty cells and empty lines', () => {
  assert.deepEqual(parseCsv('a,,c\n\n1,,'), [['a', '', 'c'], ['1', '', '']]);
});

test('a byte-order mark from Excel is ignored', () => {
  assert.deepEqual(parseCsv('﻿name,price\nCar,1'), [['name', 'price'], ['Car', '1']]);
});

test('an unclosed quote is an error, not silently swallowed text', () => {
  assert.throws(() => parseCsv('a,"never closed\nb'), /never closed/);
});

test('writing quotes only what needs it, and reading it back gives the same cells', () => {
  const rows = [['name', 'description'], ['Camaro, red', 'He said "wow"\nand left'], [' padded ', '']];
  const text = toCsv(rows);
  assert.ok(text.includes('"Camaro, red"'));
  assert.deepEqual(parseCsv(text), rows);
});

test('a cell that a spreadsheet would run as a formula is written as text, and read back as it was', () => {
  for(const formula of ['=HYPERLINK("http://evil")', '+1 555', '@SUM(A1)', '-cmd']){
    const written = toCsv([[formula]]);
    assert.ok(written.replace(/^"/, '').startsWith("'"), formula);
    assert.deepEqual(toRecords(parseCsv(`name\r\n${written}`)), [{ name: formula }]);
  }
});

test('a negative amount is not a formula', () => {
  assert.equal(toCsv([['-1.00']]), '-1.00\r\n');
});

test('records are keyed by lower-cased header and missing cells are empty', () => {
  assert.deepEqual(toRecords(parseCsv('Name , Price\nCar,10\nBoat')), [{ name: 'Car', price: '10' }, { name: 'Boat', price: '' }]);
});
