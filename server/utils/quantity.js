/*
  Pure rules about what can be bought. Quantity is a whole number where -1 means unlimited, so a
  catalog that never counts anything never shows "out of stock".
*/
export const UNLIMITED = -1;

export const STATUSES = ['draft', 'published', 'archived'];
export const AVAILABILITIES = ['available', 'pending', 'sold'];

export const isUnlimited = quantity => quantity === UNLIMITED;

/* Quantity as entered: blank or -1 is unlimited, otherwise a whole number of 0 or more. Returns [error, quantity]. */
export const normalizeQuantity = input => {
  if(input === undefined || input === null || input === '') return [null, UNLIMITED];
  const value = typeof input === 'number' ? input : Number(String(input).trim());
  if(!Number.isInteger(value) || value < UNLIMITED) return [{ code: 400, msg: 'Quantity must be a whole number, or blank for unlimited' }, null];
  return [null, value];
};

export const hasQuantityFor = (quantity, wanted = 1) => isUnlimited(quantity) || quantity >= wanted;

export const inStock = product => product.quantity !== 0;

/*
  Whether a product can be bought right now: published, marked available, in stock and priced.
  The reason a product cannot be bought is returned for display, or '' when it can.
*/
export const unavailableReason = product => {
  if(product.status !== 'published') return 'This product is not for sale';
  if(product.availability === 'sold') return 'Sold';
  if(product.availability === 'pending') return 'Sale pending';
  if(product.quantity === 0) return 'Out of stock';
  if(product.price === null || product.price === undefined) return 'No price';
  return '';
};

export const isPurchasable = product => !unavailableReason(product);
