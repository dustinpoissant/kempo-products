import { parseCsv, toCsv, toRecords } from './csv.js';
import { getCategories, getCategory, normalizeCategory, createCategory, updateCategory } from './categories.js';

/*
  Categories as a spreadsheet (.csv) or everything (.json), and back in. A category is matched by its
  key, so importing a file twice never duplicates anything. A row whose key already exists is left
  alone unless onMatch is 'update', and then its name, description and position come from the file.
  A blank position in a spreadsheet keeps the category's own.
*/

const COLUMNS = ['key', 'name', 'description', 'position'];

export const buildCategoryExport = async ({ format = 'csv' } = {}) => {
  if(!['csv', 'json'].includes(format)) return [{ code: 400, msg: 'format must be one of: csv, json' }, null];
  const [error, categories] = await getCategories();
  if(error) return [error, null];

  const rows = categories.map(category => Object.fromEntries(COLUMNS.map(column => [column, category[column] ?? ''])));
  if(format === 'json'){
    return [null, { filename: 'categories.json', contentType: 'application/json; charset=utf-8', body: JSON.stringify({ categories: rows }, null, 2) }];
  }
  return [null, { filename: 'categories.csv', contentType: 'text/csv; charset=utf-8', body: toCsv([COLUMNS, ...rows.map(row => COLUMNS.map(column => String(row[column])))]) }];
};

/* The file's rows, each with the line it came from for the error report. Throws when it is not readable. */
const readRows = content => {
  const text = String(content ?? '').trim();
  if(text.startsWith('{') || text.startsWith('[')){
    const data = JSON.parse(text);
    const list = Array.isArray(data) ? data : data.categories;
    if(!Array.isArray(list)) throw new Error('No categories list');
    return list.map((record, index) => ({ line: index + 1, record }));
  }
  return toRecords(parseCsv(text)).map((record, index) => ({ line: index + 2, record }));
};

export const importCategories = async ({ content, onMatch = 'skip', dryRun = false, actor = '' } = {}) => {
  let rows;
  try {
    rows = readRows(content);
  } catch {
    return [{ code: 400, msg: 'The file could not be read. Use a .csv file or a .json export' }, null];
  }
  if(!rows.length) return [{ code: 400, msg: 'The file has no categories in it' }, null];

  const result = { created: 0, updated: 0, skipped: 0, errors: [], notes: [] };
  for(const { line, record } of rows){
    const position = String(record.position ?? '').trim();
    const [invalid, category] = normalizeCategory({
      key: String(record.key ?? '').trim(),
      name: String(record.name ?? '').trim(),
      description: String(record.description ?? '').trim(),
      position: position === '' ? undefined : Number(position),
    });
    if(invalid){
      result.errors.push({ line, name: String(record.name ?? ''), message: invalid.msg });
      continue;
    }

    const [, existing] = await getCategory(category.key);
    if(existing){
      if(onMatch !== 'update'){
        result.skipped++;
        continue;
      }
      const changes = { name: category.name, description: category.description };
      if(position !== '') changes.position = category.position;
      if(!dryRun){
        const [error] = await updateCategory(category.key, changes, { actor });
        if(error){
          result.errors.push({ line, name: category.name, message: error.msg });
          continue;
        }
      }
      result.updated++;
    } else {
      if(!dryRun){
        const [error] = await createCategory(category, { actor });
        if(error){
          result.errors.push({ line, name: category.name, message: error.msg });
          continue;
        }
      }
      result.created++;
    }
  }
  return [null, result];
};
