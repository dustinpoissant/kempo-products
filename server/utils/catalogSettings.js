import { createRequire } from 'module';
import { getSetting, setSetting } from 'kempo/server/sdk.js';
import { creditsEnabled } from './credits.js';

/*
  The catalog's settings as the settings page edits them. The list, with each one's type and
  description, is read from kempo-config.json so there is one place they are declared: a setting
  written without its description would erase the text /admin/settings shows beside it.

  Saving is strict. A name that is not declared is refused rather than created, because a typo that
  silently stored a new setting would look saved and change nothing.
*/

const require = createRequire(import.meta.url);
const config = require('../../kempo-config.json');

const OWNER = 'kempo-products';

const DECLARED = new Map((config.settings || []).map(setting => [setting.name, setting]));

const whole = (min, max, label) => value => {
  const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return Number.isSafeInteger(number) && number >= min && number <= max
    ? [null, number]
    : [{ code: 400, msg: `${label} must be a whole number from ${min} to ${max}` }, null];
};

const VALIDATORS = {
  currency: value => {
    const code = String(value ?? '').trim().toLowerCase();
    return /^[a-z]{3}$/.test(code) ? [null, code] : [{ code: 400, msg: 'A currency is a three-letter code such as usd, eur or gbp' }, null];
  },
  prices_visible: value => {
    const flag = value === 'true' ? true : value === 'false' ? false : value;
    return typeof flag === 'boolean' ? [null, flag] : [{ code: 400, msg: 'Show prices is true or false' }, null];
  },
  page_size: whole(1, 100, 'Products per page'),
  credits_per_unit: whole(1, 1000000, 'Credits per unit'),
};

const DEFAULTS = { currency: 'usd', prices_visible: true, page_size: 24, credits_per_unit: 100 };

const coerce = (name, raw) => {
  const [error, value] = VALIDATORS[name](raw);
  return error ? DEFAULTS[name] : value;
};

/* Every declared setting with its current value, plus whether kempo-credits is in use. */
export const readCatalogSettings = async () => {
  const settings = [];
  for(const [name, declared] of DECLARED){
    const [, raw] = await getSetting(OWNER, name, DEFAULTS[name]);
    settings.push({
      name,
      type: declared.type,
      description: declared.description,
      value: VALIDATORS[name] ? coerce(name, raw) : raw,
      default: DEFAULTS[name],
    });
  }
  return [null, { settings, credits: await creditsEnabled() }];
};

/* Saves { name: value }. Nothing is written unless every value is acceptable. */
export const saveCatalogSettings = async changes => {
  if(!changes || typeof changes !== 'object' || Array.isArray(changes)) return [{ code: 400, msg: 'Send an object of setting names and values' }, null];

  const clean = {};
  for(const [name, raw] of Object.entries(changes)){
    if(!DECLARED.has(name) || !VALIDATORS[name]) return [{ code: 400, msg: `There is no setting called "${name}"` }, null];
    const [error, value] = VALIDATORS[name](raw);
    if(error) return [error, null];
    clean[name] = value;
  }
  if(!Object.keys(clean).length) return [{ code: 400, msg: 'Nothing to save' }, null];

  for(const [name, value] of Object.entries(clean)){
    const declared = DECLARED.get(name);
    const [error] = await setSetting(OWNER, name, value, declared.type, false, declared.description);
    if(error) return [{ code: 500, msg: `Could not save ${name}` }, null];
  }
  return readCatalogSettings();
};
