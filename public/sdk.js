const BASE = '/products/api';

const req = async (method, path, data) => {
  const opts = { method, headers: {} };
  if(data !== undefined && method !== 'GET'){
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(data);
  }
  try {
    const res = await fetch(path, opts);
    const json = await res.json().catch(() => ({}));
    if(!res.ok) return [{ code: res.status, msg: json.error || 'An error occurred' }, null];
    return [null, json];
  } catch {
    return [{ code: 503, msg: 'Network error' }, null];
  }
};

const buildQuery = params => {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '' && v !== false);
  if(!entries.length) return '';
  return '?' + entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(typeof v === 'object' ? JSON.stringify(v) : v)}`).join('&');
};

const enc = encodeURIComponent;

/*
  What the page needs to know to render: currency, whether prices are shown, whether the caller
  can manage the catalog, whether images are available, and the allowed statuses and field types.
*/
export const getConfig = () => req('GET', `${BASE}/config`);

/*
  Products. `filters` is an object of field key -> exact value, e.g. { scale: '1:18' }. Visitors
  only ever see published products; people who can manage the catalog can pass `status`.
*/
export const getProducts = (params = {}) => req('GET', `${BASE}/products${buildQuery(params)}`);
export const getProduct = idOrSlug => req('GET', `${BASE}/products/${enc(idOrSlug)}`);
export const createProduct = data => req('POST', `${BASE}/products`, data);
export const updateProduct = (id, data) => req('PATCH', `${BASE}/products/${enc(id)}`, data);
export const deleteProduct = id => req('DELETE', `${BASE}/products/${enc(id)}`);

/*
  The server's price for a product and the buyer's selections: { optionKey: choiceKey }.
*/
export const getPrice = (product, options = {}) => req('GET', `${BASE}/price${buildQuery({ product, options })}`);

/*
  Types and fields. A field belongs to one type or, with no type, to every product; fields are
  identified by their key and type, so changing or deleting a type's field passes { type }.
*/
export const getTypes = () => req('GET', `${BASE}/types`);
export const createType = data => req('POST', `${BASE}/types`, data);
export const updateType = (key, data) => req('PATCH', `${BASE}/types/${enc(key)}`, data);
export const deleteType = key => req('DELETE', `${BASE}/types/${enc(key)}`);
export const getFields = (params = {}) => req('GET', `${BASE}/fields${buildQuery(params)}`);
export const createField = data => req('POST', `${BASE}/fields`, data);
export const updateField = (key, data, { type = '' } = {}) => req('PATCH', `${BASE}/fields/${enc(key)}${buildQuery({ type })}`, data);
export const deleteField = (key, { type = '' } = {}) => req('DELETE', `${BASE}/fields/${enc(key)}${buildQuery({ type })}`);

/*
  Purchases made elsewhere (Etsy, in person). Each takes stock and fires the purchase hook; a
  reversal puts it back.
*/
export const getPurchases = (params = {}) => req('GET', `${BASE}/purchases${buildQuery(params)}`);
export const recordPurchase = data => req('POST', `${BASE}/purchases`, data);
export const reversePurchase = ref => req('POST', `${BASE}/purchases/${enc(ref)}/reverse`, {});

/*
  Money. Prices are whole numbers of the smallest currency unit (4999 is $49.99).
*/
export const parseMoney = (text, decimals = 2) => {
  const match = String(text ?? '').trim().replace(/[\s,]/g, '').match(/^([+-])?(?:\$)?(\d+)?(?:\.(\d+))?$/);
  if(!match || (match[2] === undefined && match[3] === undefined)) return null;
  const [, sign, whole = '0', fraction = ''] = match;
  if(fraction.length > decimals) return null;
  const minor = Number(whole) * 10 ** decimals + Number(fraction.padEnd(decimals, '0') || 0);
  return sign === '-' ? -minor : minor;
};

export const formatMoney = (minor, decimals = 2, { signed = false } = {}) => {
  const amount = Math.abs(Number(minor) || 0);
  const text = decimals ? (amount / 10 ** decimals).toFixed(decimals) : String(amount);
  if(minor < 0) return `-${text}`;
  return signed && minor > 0 ? `+${text}` : text;
};

export const displayMoney = (minor, currency = 'usd', decimals = 2, locale = undefined) => {
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: String(currency).toUpperCase(), minimumFractionDigits: decimals, maximumFractionDigits: decimals })
      .format((Number(minor) || 0) / 10 ** decimals);
  } catch {
    return formatMoney(minor, decimals);
  }
};

/*
  Import and export. exportUrl('csv' | 'json') is a download link: CSV is a spreadsheet, JSON is
  everything including types and fields. importProducts({ content, onMatch, dryRun }) takes the text
  of a file; onMatch is 'skip' or 'update' for a slug that already exists, and dryRun reports what
  would happen without changing anything. Resolves to { created, updated, skipped, errors, notes }.
*/
export const exportUrl = format => `${BASE}/export?format=${format === 'json' ? 'json' : 'csv'}`;
export const importProducts = data => req('POST', `${BASE}/import`, data);
