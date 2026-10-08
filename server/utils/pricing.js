/*
  Option definitions and the one function that decides a price. Pure, with no database access, so
  the rules can be tested without a server.

  A product has a base price. An option is a choice the buyer makes (colour, clear coat, size); each
  choice carries an amount that is, by default, *relative* to the base: -100 takes a dollar off,
  0 changes nothing. An option set to `replace` instead lets a choice stand in for the base price
  (how most shops price variations). At most one option per product replaces the base.
*/
export const PRICE_TYPES = ['adjust', 'replace'];

export const KEY_PATTERN = /^[a-z][a-z0-9_-]{0,39}$/;

export const MAX_OPTIONS = 10;
export const MAX_CHOICES = 100;
export const MAX_LABEL = 100;

/* "Clear coat" -> "clear-coat". Used to suggest a key from a label; keys are lower-case so they read well in a URL. */
export const keyFromLabel = label => String(label ?? '')
  .normalize('NFKD')
  .replace(/[̀-ͯ]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .replace(/^[^a-z]+/, '')
  .slice(0, 40)
  .replace(/-+$/g, '');

const bad = msg => [{ code: 400, msg }, null];

const normalizeChoice = (input, optionLabel, taken) => {
  const label = String(input?.label ?? '').trim();
  if(!label) return bad(`${optionLabel}: every choice needs a label`);
  if(label.length > MAX_LABEL) return bad(`${optionLabel}: a choice label must be ${MAX_LABEL} characters or fewer`);
  const key = String(input?.key ?? '').trim() || keyFromLabel(label);
  if(!KEY_PATTERN.test(key)) return bad(`${optionLabel}: "${label}" needs a key of lower-case letters, numbers and dashes`);
  if(taken.has(key)) return bad(`${optionLabel}: two choices share the key "${key}"`);
  taken.add(key);
  const price = input?.price === undefined || input?.price === null || input?.price === '' ? 0 : Number(input.price);
  if(!Number.isSafeInteger(price)) return bad(`${optionLabel}: the price of "${label}" must be a whole number in the smallest currency unit`);
  return [null, { key, label, price, available: input?.available === undefined ? true : Boolean(input.available) }];
};

/*
  Validates a product's whole list of options. Returns [error, options] with each option's keys,
  positions and choices tidied. Choice `price` is an integer in minor units (signed for `adjust`).
*/
export const normalizeOptions = (input = []) => {
  if(!Array.isArray(input)) return bad('options must be a list');
  if(input.length > MAX_OPTIONS) return bad(`A product can have at most ${MAX_OPTIONS} options`);
  const options = [];
  const keys = new Set();
  for(const [index, raw] of input.entries()){
    const label = String(raw?.label ?? '').trim();
    if(!label) return bad('Every option needs a label');
    if(label.length > MAX_LABEL) return bad(`An option label must be ${MAX_LABEL} characters or fewer`);
    const key = String(raw?.key ?? '').trim() || keyFromLabel(label);
    if(!KEY_PATTERN.test(key)) return bad(`"${label}" needs a key of lower-case letters, numbers and dashes`);
    if(keys.has(key)) return bad(`Two options share the key "${key}"`);
    keys.add(key);
    const priceType = raw?.priceType ?? 'adjust';
    if(!PRICE_TYPES.includes(priceType)) return bad(`${label}: the price type must be one of ${PRICE_TYPES.join(', ')}`);
    const list = Array.isArray(raw?.choices) ? raw.choices : [];
    if(!list.length) return bad(`${label} needs at least one choice`);
    if(list.length > MAX_CHOICES) return bad(`${label} can have at most ${MAX_CHOICES} choices`);
    const taken = new Set();
    const choices = [];
    for(const [position, item] of list.entries()){
      const [error, choice] = normalizeChoice(item, label, taken);
      if(error) return [error, null];
      choices.push({ ...choice, position });
    }
    options.push({ key, label, required: raw?.required === undefined ? true : Boolean(raw.required), priceType, position: index, choices });
  }
  if(options.filter(option => option.priceType === 'replace').length > 1){
    return bad('Only one option can replace the base price. Set the others to adjust it');
  }
  return [null, options];
};

/*
  Checks a buyer's selections ({ optionKey: choiceKey }) against the product's options: every
  required option chosen, every choice real and in stock, nothing unknown. Returns
  [error, selections] where selections holds only the chosen options.
*/
export const checkSelections = (options, selections = {}) => {
  if(selections === null || typeof selections !== 'object' || Array.isArray(selections)){
    return bad('options must be an object of option key to choice key');
  }
  const byKey = new Map(options.map(option => [option.key, option]));
  for(const key of Object.keys(selections)){
    if(!byKey.has(key)) return bad(`"${key}" is not an option on this product`);
  }
  const chosen = {};
  for(const option of options){
    const value = selections[option.key];
    if(value === undefined || value === null || value === ''){
      if(option.required) return bad(`Choose a ${option.label.toLowerCase()}`);
      continue;
    }
    const choice = option.choices.find(candidate => candidate.key === value);
    if(!choice) return bad(`"${value}" is not a choice for ${option.label}`);
    if(!choice.available) return bad(`${choice.label} is not available for ${option.label}`);
    chosen[option.key] = choice.key;
  }
  return [null, chosen];
};

/*
  The unit price for a product with the given selections. Start from the base price; the chosen
  choice of a `replace` option takes its place; then every `adjust` option's chosen amount is added.
  The total never goes below zero. Returns [error, { unit, base, lines }]; `lines` is the breakdown
  for display and for the purchase record.
*/
export const computePrice = (product, options, selections = {}) => {
  if(product.price === null || product.price === undefined){
    return [{ code: 409, msg: 'This product has no price' }, null];
  }
  const [error, chosen] = checkSelections(options, selections);
  if(error) return [error, null];

  let base = product.price;
  const lines = [];
  for(const option of options.filter(candidate => candidate.priceType === 'replace')){
    const choice = option.choices.find(candidate => candidate.key === chosen[option.key]);
    if(choice){
      base = choice.price;
      lines.push({ option: option.key, optionLabel: option.label, choice: choice.key, choiceLabel: choice.label, amount: choice.price, replaces: true });
    }
  }
  let unit = base;
  for(const option of options.filter(candidate => candidate.priceType === 'adjust')){
    const choice = option.choices.find(candidate => candidate.key === chosen[option.key]);
    if(!choice) continue;
    unit += choice.price;
    lines.push({ option: option.key, optionLabel: option.label, choice: choice.key, choiceLabel: choice.label, amount: choice.price, replaces: false });
  }
  return [null, { unit: Math.max(unit, 0), base, selections: chosen, lines }];
};
