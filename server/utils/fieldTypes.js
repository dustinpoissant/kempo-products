/*
  Pure helpers with no database access, so field definitions and values can be validated and unit
  tested without a server. This follows kempo-inventory's field engine; it is copied, not shared,
  until a third extension needs it.
*/
export const FIELD_TYPES = ['text', 'longtext', 'number', 'boolean', 'date', 'color', 'rating', 'select', 'media'];

/* Types that need another extension. They are valid in a definition, but creating one is refused when it is missing. */
export const OPTIONAL_TYPES = { media: 'kempo-media' };

export const MAX_MEDIA = 20;
export const MAX_RATING = 5;
export const MAX_TEXT = 1000;
export const MAX_LONGTEXT = 20000;

/*
  The only type changes that cannot lose or reject what products already hold: a choice list becomes
  free text, and short text becomes long text. Anything else is refused: delete the field and make a
  new one instead.
*/
export const CONVERSIONS = { select: ['text'], text: ['longtext'] };

export const canConvert = (from, to) => from === to || (CONVERSIONS[from] ?? []).includes(to);

export const CORE_KEYS = [
  'id', 'slug', 'name', 'type', 'description', 'status', 'availability', 'price', 'priceLabel', 'stock',
  'managedBy', 'images', 'tags', 'data', 'fields', 'options', 'owner', 'created', 'updated', 'publishedAt',
];

export const KEY_PATTERN = /^[a-z][a-zA-Z0-9]{0,39}$/;

const MEDIA_ID = /^[a-f0-9]{16}$/;

export const isEmpty = value => value === undefined || value === null || value === '';

/* "Engine size" -> "engineSize". */
export const keyFromLabel = label => {
  const words = String(label ?? '').replace(/[^a-zA-Z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
  if(!words.length) return '';
  const key = words.map((w, i) => i === 0 ? w.charAt(0).toLowerCase() + w.slice(1) : w.charAt(0).toUpperCase() + w.slice(1)).join('');
  return /^[a-z]/.test(key) ? key.slice(0, 40) : '';
};

/* A product type's key is lower-case with dashes: "Model car" -> "model-car". */
export const TYPE_KEY_PATTERN = /^[a-z][a-z0-9-]{0,39}$/;

export const typeKeyFromName = name => String(name ?? '')
  .normalize('NFKD')
  .replace(/[̀-ͯ]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .replace(/^[^a-z]+/, '')
  .slice(0, 40)
  .replace(/-+$/g, '');

/* Validates and normalises a field definition. Returns [error, definition]. */
export const normalizeFieldDefinition = (input = {}) => {
  const label = String(input.label ?? '').trim();
  if(!label) return [{ code: 400, msg: 'Field label is required' }, null];

  const key = String(input.key ?? keyFromLabel(label)).trim();
  if(!KEY_PATTERN.test(key)){
    return [{ code: 400, msg: 'Field key must start with a lowercase letter and contain only letters and numbers (max 40)' }, null];
  }
  if(CORE_KEYS.includes(key)) return [{ code: 400, msg: `"${key}" is reserved` }, null];

  if(!FIELD_TYPES.includes(input.type)) return [{ code: 400, msg: `Field type must be one of: ${FIELD_TYPES.join(', ')}` }, null];

  let options = [];
  if(input.type === 'select'){
    options = [...new Set((Array.isArray(input.options) ? input.options : []).map(o => String(o).trim()).filter(Boolean))];
    if(!options.length) return [{ code: 400, msg: 'A select field needs at least one option' }, null];
  }

  return [null, {
    key,
    label,
    type: input.type,
    description: String(input.description ?? ''),
    required: Boolean(input.required),
    listed: input.listed === undefined ? true : Boolean(input.listed),
    filterable: input.filterable === undefined ? input.type === 'select' : Boolean(input.filterable),
    options,
    position: Number.isInteger(input.position) ? input.position : 0,
  }];
};

/*
  Coerces one raw value to the field's type. Returns [error, value]; an empty input yields
  [null, null], meaning "no value".
*/
export const coerceValue = (field, raw) => {
  if(field.type !== 'boolean' && (isEmpty(raw) || (Array.isArray(raw) && !raw.length))) return [null, null];
  const bad = msg => [{ code: 400, msg: `${field.label}: ${msg}` }, null];

  switch(field.type){
    case 'text': {
      const value = String(raw).trim();
      if(!value) return [null, null];
      return value.length > MAX_TEXT ? bad(`must be ${MAX_TEXT} characters or fewer`) : [null, value];
    }
    case 'longtext': {
      const value = String(raw).trim();
      if(!value) return [null, null];
      return value.length > MAX_LONGTEXT ? bad(`must be ${MAX_LONGTEXT} characters or fewer`) : [null, value];
    }
    case 'number': {
      const value = typeof raw === 'number' ? raw : Number(String(raw).trim());
      return Number.isFinite(value) ? [null, value] : bad('must be a number');
    }
    case 'rating': {
      const value = typeof raw === 'number' ? raw : Number(String(raw).trim());
      if(!Number.isInteger(value) || value < 0 || value > MAX_RATING) return bad(`must be a whole number of stars from 1 to ${MAX_RATING}`);
      return [null, value === 0 ? null : value];
    }
    case 'boolean': {
      if(isEmpty(raw)) return [null, null];
      if(typeof raw === 'boolean') return [null, raw];
      if(raw === 'true') return [null, true];
      if(raw === 'false') return [null, false];
      return bad('must be true or false');
    }
    case 'date': {
      const value = String(raw);
      const valid = /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
        && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
      return valid ? [null, value] : bad('must be a date (YYYY-MM-DD)');
    }
    case 'color': {
      const text = String(raw).trim().toLowerCase();
      const short = text.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])([0-9a-f])?$/);
      const value = short ? `#${short.slice(1).filter(Boolean).map(c => c + c).join('')}` : text;
      return /^#(?:[0-9a-f]{6}|[0-9a-f]{8})$/.test(value) ? [null, value.endsWith('ff') && value.length === 9 ? value.slice(0, 7) : value] : bad('must be a hex color such as #ff8800');
    }
    case 'select': {
      const value = String(raw).trim();
      if(!value) return [null, null];
      return field.options.includes(value) ? [null, value] : bad(`must be one of: ${field.options.join(', ')}`);
    }
    case 'media': {
      const list = Array.isArray(raw) ? raw : String(raw).split(',');
      const ids = [...new Set(list.map(v => String(v).trim()).filter(Boolean))];
      if(!ids.length) return [null, null];
      if(ids.length > MAX_MEDIA) return bad(`can hold at most ${MAX_MEDIA} files`);
      return ids.every(id => MEDIA_ID.test(id)) ? [null, ids] : bad('must be a list of media files');
    }
    default:
      return bad('has an unsupported type');
  }
};

/*
  The fields a product shows: the default ones (type '') plus those scoped to its type. An untyped
  product gets only the defaults.
*/
export const applicableFields = (fields, productType) => fields.filter(f => !f.productType || f.productType === (productType ?? ''));

/*
  Validates `input` (an object keyed by field key) against `fields`.
    partial=false: every required field must be present (creating a product)
    partial=true:  only the keys supplied are checked (updating a product)
  Returns [error, values] where `values[key]` is the coerced value, or null to clear it.
*/
export const coerceValues = (fields, input = {}, { partial = false } = {}) => {
  if(input === null || typeof input !== 'object' || Array.isArray(input)){
    return [{ code: 400, msg: 'fields must be an object' }, null];
  }
  const byKey = new Map(fields.map(f => [f.key, f]));
  const values = {};

  for(const key of Object.keys(input)){
    if(!byKey.has(key)) return [{ code: 400, msg: `Unknown field "${key}"` }, null];
  }

  for(const field of fields){
    const supplied = Object.prototype.hasOwnProperty.call(input, field.key);
    if(partial && !supplied) continue;
    const [error, value] = coerceValue(field, supplied ? input[field.key] : undefined);
    if(error) return [error, null];
    if(value === null && field.required){
      return [{ code: 400, msg: `${field.label} is required` }, null];
    }
    if(supplied || value !== null) values[field.key] = value;
  }
  return [null, values];
};
