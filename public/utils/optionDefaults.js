/*
  The choices a page starts a product's options on: `{ optionKey: choiceKey }`. An option left out follows the product's
  own default; an empty choice (`''`) starts that option on nothing, so the buyer must choose. The Product options widget
  keeps them as the text of its `defaults` attribute (JSON). No browser imports, so the tests read the same code the page runs.
*/
export const parseDefaults = text => {
  try {
    const value = JSON.parse(text || '{}');
    if(!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter(([, choice]) => typeof choice === 'string'));
  } catch {
    return {};
  }
};

export const defaultsText = picked => {
  const entries = Object.entries(picked ?? {}).filter(([, choice]) => typeof choice === 'string').sort(([a], [b]) => a.localeCompare(b));
  return entries.length ? JSON.stringify(Object.fromEntries(entries)) : '';
};

/* The choices of `picked` that the product really has and can sell, so a stale default is ignored. Blanks are kept apart from this. */
export const usableDefaults = (product, picked) => {
  const chosen = {};
  for(const option of product?.options ?? []){
    const key = picked?.[option.key];
    if(option.choices.some(choice => choice.key === key && choice.available)) chosen[option.key] = key;
  }
  return chosen;
};
