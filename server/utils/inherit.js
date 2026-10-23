/*
  What a product's custom attributes are worth once its template's defaults are counted. A template can give a default
  for any attribute (every model car is the same size); a product uses its own value when it has one, and the
  template's when it leaves the attribute blank. A product reports its own values as `attributes` and the defaults it falls
  back to as `inherited`. Pure.
*/
const blank = value => value === null || value === undefined || value === '';

/* The defaults a product falls back to: those of its template for attributes the product has left blank. */
export const inheritedFor = (templateDefaults, ownAttributes) => Object.fromEntries(
  Object.entries(templateDefaults ?? {}).filter(([key, value]) => !blank(value) && blank(ownAttributes?.[key])),
);

/* A product's own values over its template's defaults: what is actually in force. */
export const effectiveAttributes = product => ({
  ...(product?.inherited ?? {}),
  ...Object.fromEntries(Object.entries(product?.attributes ?? {}).filter(([, value]) => !blank(value))),
});
