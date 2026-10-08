/*
  Reading and writing CSV, with no database access so it can be tested without a server.

  Follows RFC 4180: a cell may be quoted, a quoted cell may hold commas, quotes (doubled) and line
  breaks, and rows end in CRLF or LF. A leading byte-order mark, which Excel adds, is ignored.
*/

/* Text -> rows of cells. A completely empty line is skipped. */
export const parseCsv = input => {
  const text = String(input ?? '').replace(/^﻿/, '');
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  let index = 0;
  const endCell = () => {
    row.push(cell);
    cell = '';
  };
  const endRow = () => {
    endCell();
    if(!(row.length === 1 && row[0] === '')) rows.push(row);
    row = [];
  };

  while(index < text.length){
    const character = text[index];
    if(quoted){
      if(character === '"'){
        if(text[index + 1] === '"'){
          cell += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += character;
      }
    } else if(character === '"' && cell === ''){
      quoted = true;
    } else if(character === ','){
      endCell();
    } else if(character === '\n'){
      endRow();
    } else if(character === '\r'){
      if(text[index + 1] === '\n') index += 1;
      endRow();
    } else {
      cell += character;
    }
    index += 1;
  }
  if(quoted) throw new Error('A quoted cell is never closed');
  if(cell !== '' || row.length) endRow();
  return rows;
};

/*
  A cell that starts with = + - @ is read as a formula by a spreadsheet, which can run code from
  whatever someone typed into a product name. It is written with a leading apostrophe so it is read
  as text; a negative number is the one exception, since "-1.00" is a price adjustment, not a formula.
*/
const FORMULA_START = /^[=+@\t\r]/;
const NEGATIVE_NUMBER = /^-\d+(\.\d+)?$/;

const safe = value => {
  const text = String(value ?? '');
  if(FORMULA_START.test(text) || (text.startsWith('-') && !NEGATIVE_NUMBER.test(text))) return `'${text}`;
  return text;
};

const quote = value => {
  const text = safe(value);
  return /[",\r\n]/.test(text) || /^\s|\s$/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/* Rows of cells -> text, ending every row in CRLF. */
export const toCsv = rows => rows.map(row => row.map(quote).join(',')).join('\r\n') + '\r\n';

/* The apostrophe `safe` adds to a cell that looks like a formula, taken off again so a file that was exported can be imported unchanged. */
const unsafe = value => value.replace(/^'(?=[=+@\t\r-])/, '');

/* A parsed CSV as objects keyed by the (lower-cased, trimmed) header. Rows shorter than the header leave the rest empty. */
export const toRecords = rows => {
  if(!rows.length) return [];
  const header = rows[0].map(name => name.trim().toLowerCase());
  return rows.slice(1).map(cells => Object.fromEntries(header.map((name, i) => [name, unsafe(cells[i] ?? '')])));
};
