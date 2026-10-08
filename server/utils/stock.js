/*
  Pure rules about what can be bought. Stock is a whole number where -1 means unlimited, so a
  catalog that never counts anything never shows "out of stock".
*/
export const UNLIMITED = -1;

export const STATUSES = ['draft', 'published', 'archived'];
export const AVAILABILITIES = ['available', 'pending', 'sold'];

export const isUnlimited = stock => stock === UNLIMITED;

/* Stock as entered: blank or -1 is unlimited, otherwise a whole number of 0 or more. Returns [error, stock]. */
export const normalizeStock = input => {
  if(input === undefined || input === null || input === '') return [null, UNLIMITED];
  const value = typeof input === 'number' ? input : Number(String(input).trim());
  if(!Number.isInteger(value) || value < UNLIMITED) return [{ code: 400, msg: 'Stock must be a whole number, or blank for unlimited' }, null];
  return [null, value];
};

export const hasStockFor = (stock, quantity = 1) => isUnlimited(stock) || stock >= quantity;

export const inStock = product => product.stock !== 0;

/*
  Whether a product can be bought right now: published, marked available, in stock and priced.
  The reason a product cannot be bought is returned for display, or '' when it can.
*/
export const unavailableReason = product => {
  if(product.status !== 'published') return 'This product is not for sale';
  if(product.availability === 'sold') return 'Sold';
  if(product.availability === 'pending') return 'Sale pending';
  if(product.stock === 0) return 'Out of stock';
  if(product.price === null || product.price === undefined) return 'No price';
  return '';
};

export const isPurchasable = product => !unavailableReason(product);

/*
  The new stock after selling `quantity`: unlimited stays unlimited. Returns null when there is not
  enough, which is how callers decide to refuse.
*/
export const stockAfterSale = (stock, quantity) => {
  if(isUnlimited(stock)) return UNLIMITED;
  return stock >= quantity ? stock - quantity : null;
};

/* The stock after putting `quantity` back (a reversed purchase). Unlimited stays unlimited. */
export const stockAfterReturn = (stock, quantity) => isUnlimited(stock) ? UNLIMITED : stock + quantity;
