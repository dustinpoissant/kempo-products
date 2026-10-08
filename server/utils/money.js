/*
  Money is an integer in the currency's smallest unit, always: $12.99 is 1299. This module turns
  what a person types into that integer and back, and nothing else touches decimals.

  The tables of which currencies have no minor unit or three of them are the same as kempo-payments'
  so both extensions agree on what an amount means.
*/
const ZERO_DECIMAL = new Set(['bif', 'clp', 'djf', 'gnf', 'jpy', 'kmf', 'krw', 'mga', 'pyg', 'rwf', 'ugx', 'vnd', 'vuv', 'xaf', 'xof', 'xpf']);
const THREE_DECIMAL = new Set(['bhd', 'jod', 'kwd', 'omr', 'tnd']);

export const normalizeCurrency = currency => String(currency ?? '').trim().toLowerCase();

export const decimalsFor = currency => {
  const code = normalizeCurrency(currency);
  if(ZERO_DECIMAL.has(code)) return 0;
  if(THREE_DECIMAL.has(code)) return 3;
  return 2;
};

/*
  "49.99" -> 4999, "-1.00" -> -100, "+1" -> 100. Returns [error, minor]. Empty input is an error
  here; callers decide whether empty means "no price" before calling.
*/
export const parseMoney = (input, currency = 'usd') => {
  const decimals = decimalsFor(currency);
  const text = String(input ?? '').trim().replace(/[\s,]/g, '');
  const match = text.match(/^([+-])?(?:\$)?(\d+)?(?:\.(\d+))?$/);
  if(!text || !match || (match[2] === undefined && match[3] === undefined)){
    return [{ code: 400, msg: 'Enter an amount such as 49.99' }, null];
  }
  const [, sign, whole = '0', fraction = ''] = match;
  if(fraction.length > decimals){
    return [{ code: 400, msg: decimals ? `An amount can have at most ${decimals} decimal places` : 'An amount must be a whole number' }, null];
  }
  const minor = Number(whole) * 10 ** decimals + Number(fraction.padEnd(decimals, '0') || 0);
  if(!Number.isSafeInteger(minor)) return [{ code: 400, msg: 'That amount is too large' }, null];
  return [null, sign === '-' ? -minor : minor];
};

/* 4999 -> "49.99". `signed` prefixes + for positive amounts, for option adjustments. */
export const formatMoney = (minor, currency = 'usd', { signed = false } = {}) => {
  const decimals = decimalsFor(currency);
  const amount = Math.abs(Number(minor) || 0);
  const text = decimals ? (amount / 10 ** decimals).toFixed(decimals) : String(amount);
  if(minor < 0) return `-${text}`;
  return signed && minor > 0 ? `+${text}` : text;
};

/* A display string with the currency symbol where the browser knows one: "$49.99". */
export const displayMoney = (minor, currency = 'usd', locale = 'en-US') => {
  const decimals = decimalsFor(currency);
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: normalizeCurrency(currency).toUpperCase(), minimumFractionDigits: decimals, maximumFractionDigits: decimals })
      .format((Number(minor) || 0) / 10 ** decimals);
  } catch {
    return formatMoney(minor, currency);
  }
};
