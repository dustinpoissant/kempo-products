/*
  A list in a query string: a comma separated value (`a,b`), or a JSON array (`["a","b"]`, which is how the
  browser SDK sends an array). An empty value and an empty array are both no filter, not a filter on nothing.
  Returns undefined for no filter, otherwise an array of trimmed, non-empty strings.
*/
export const parseListParam = value => {
  if(typeof value !== 'string' || !value.trim()) return undefined;
  let parts;
  if(value.trim().startsWith('[')){
    try {
      const parsed = JSON.parse(value);
      if(!Array.isArray(parsed)) return undefined;
      parts = parsed;
    } catch {
      return undefined;
    }
  } else {
    parts = value.split(',');
  }
  const list = parts.map(part => String(part ?? '').trim()).filter(Boolean);
  return list.length ? list : undefined;
};
