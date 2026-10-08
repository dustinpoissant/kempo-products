/*
  Pure helpers for product slugs, with no database access so they can be tested without a server.

  A slug is the last part of a product's public address: /products/<slug>/. The product pages live
  in the same folder as the extension's own routes, so a slug that matches one of them would make
  the product unreachable and shadow the route; those words are reserved.
*/
export const MAX_SLUG = 80;

export const RESERVED_SLUGS = ['api', 'components', 'vendor', 'sdk', 'sdk.js', 'index', 'admin', 'new', 'edit'];

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const slugify = text => String(text ?? '')
  .normalize('NFKD')
  .replace(/[̀-ͯ]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, MAX_SLUG)
  .replace(/-+$/g, '');

/*
  Resolves to [error, slug]. An explicit slug is validated as given (after lower-casing and
  trimming); with none, one is made from the name.
*/
export const normalizeSlug = (input, name) => {
  const supplied = String(input ?? '').trim().toLowerCase();
  const slug = supplied || slugify(name);
  if(!slug) return [{ code: 400, msg: 'A slug could not be made from that name. Enter one using letters and numbers' }, null];
  if(slug.length > MAX_SLUG) return [{ code: 400, msg: `The slug must be ${MAX_SLUG} characters or fewer` }, null];
  if(!SLUG_PATTERN.test(slug)) return [{ code: 400, msg: 'The slug can only use lower-case letters, numbers and single dashes' }, null];
  if(RESERVED_SLUGS.includes(slug)) return [{ code: 400, msg: `"${slug}" is reserved and cannot be used as a slug` }, null];
  return [null, slug];
};

/* The next slug to try when `slug` is taken: x, x-2, x-3 ... */
export const withSuffix = (slug, attempt) => {
  if(attempt <= 1) return slug;
  const suffix = `-${attempt}`;
  return `${slug.slice(0, MAX_SLUG - suffix.length).replace(/-+$/g, '')}${suffix}`;
};
