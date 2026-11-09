/*
  The value of a selector is a comma-separated list, the same text a widget's attribute holds (`category="shirts,hats"`).
  These turn it into a list and back. No browser imports, so the tests can use them too.
*/
export const listOf = text => String(text ?? '').split(',').map(item => item.trim()).filter(Boolean);

export const textOf = items => [...new Set(items.map(item => String(item).trim()).filter(Boolean))].join(',');
