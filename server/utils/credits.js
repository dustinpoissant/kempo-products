import { getExtension } from 'kempo/server/sdk.js';
import { decimalsFor } from './money.js';
import { getCreditsPerUnit } from './settings.js';

/*
  The optional integration with kempo-credits. Products knows about credits in three ways, all of
  which only exist while kempo-credits is installed *and enabled* on the site:

    creditsGranted   how many credits a buyer is given for each one bought
    creditsOnly      the product is nothing but credits (a credit pack); no goods change hands
    creditPercent    how much of the price may be paid in credits, 0 to 100

  Nothing here imports kempo-credits when the file loads. It is an optional peer, so it is
  imported on demand, and a site without it never touches it.
*/

const NAME = 'kempo-credits';
const OWNER = 'kempo-products';

export const MAX_CREDITS = 1000000000;

/* True when kempo-credits is installed on this site and switched on. */
export const creditsEnabled = async () => {
  const [error, extension] = await getExtension({ name: NAME });
  return !error && extension?.enabled === true;
};

const loadCredits = async () => {
  try {
    return await import('kempo-credits/sdk');
  } catch {
    return null;
  }
};

const wholeNumber = (value, label, min, max) => {
  const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if(!Number.isSafeInteger(number) || number < min || number > max){
    return [{ code: 400, msg: `${label} must be a whole number from ${min} to ${max}` }, null];
  }
  return [null, number];
};

/*
  Checks the credit properties of a create or an update. `supplied` is what the caller sent and
  `existing` what the product has now, because the rules cross properties: a credit-only product
  has to grant something, and cannot itself be paid for in credits (that would be buying credits
  with credits).

  Returns [error, values] where `values` holds only what was supplied.
*/
export const normalizeCredits = async (supplied, existing = {}) => {
  const values = {};

  if(supplied.creditsGranted !== undefined){
    const [error, number] = wholeNumber(supplied.creditsGranted, 'Credits given', 0, MAX_CREDITS);
    if(error) return [error, null];
    values.creditsGranted = number;
  }
  if(supplied.creditsOnly !== undefined){
    if(typeof supplied.creditsOnly !== 'boolean') return [{ code: 400, msg: 'creditsOnly must be true or false' }, null];
    values.creditsOnly = supplied.creditsOnly;
  }
  if(supplied.creditPercent !== undefined){
    const [error, number] = wholeNumber(supplied.creditPercent, 'The percentage payable in credits', 0, 100);
    if(error) return [error, null];
    values.creditPercent = number;
  }
  if(!Object.keys(values).length) return [null, values];

  const final = {
    creditsGranted: values.creditsGranted ?? existing.creditsGranted ?? 0,
    creditsOnly: values.creditsOnly ?? existing.creditsOnly ?? false,
    creditPercent: values.creditPercent ?? existing.creditPercent ?? 0,
  };

  /* Turning something off is always allowed; turning it on needs kempo-credits. */
  const turnsOn = (values.creditsGranted ?? 0) > 0 || values.creditsOnly === true || (values.creditPercent ?? 0) > 0;
  if(turnsOn && !(await creditsEnabled())){
    return [{ code: 409, msg: 'Credits need the kempo-credits extension to be installed and enabled' }, null];
  }

  if(final.creditsOnly){
    if(final.creditsGranted < 1) return [{ code: 400, msg: 'A credit-only product has to give at least 1 credit' }, null];
    if(final.creditPercent > 0) return [{ code: 400, msg: 'A credit-only product cannot be paid for with credits' }, null];
  }
  return [null, values];
};

/*
  What paying with credits looks like for one unit at `unitPrice` (the smallest currency unit): the
  most credits that may be used, and the money left over. Null when credits are not accepted or
  there is nothing to pay. Credits round up and money rounds down, so rounding never gives a
  discount. `perUnit` is how many credits equal one whole unit of the currency (the
  `credits_per_unit` setting).
*/
export const creditQuote = ({ percent, unitPrice, currency, perUnit }) => {
  if(!percent || unitPrice === null || unitPrice === undefined || unitPrice <= 0) return null;
  const coveredMinor = Math.floor(unitPrice * percent / 100);
  const maxCredits = Math.ceil(coveredMinor * perUnit / 10 ** decimalsFor(currency));
  return { percent, perUnit, maxCredits, coveredMinor, remainingMinor: unitPrice - coveredMinor };
};

/* The quote for a shaped product, or null when credits are off for this site or this product. */
export const quoteFor = async (product, unitPrice, currency) => {
  if(!product.creditPercent || !(await creditsEnabled())) return null;
  return creditQuote({ percent: product.creditPercent, unitPrice, currency, perUnit: await getCreditsPerUnit() });
};

const totalCredits = purchase => (purchase.lines ?? []).reduce((sum, line) => sum + (Number(line.creditsGranted) || 0) * (Number(line.quantity) || 0), 0);

/*
  Gives the buyer the credits a recorded purchase carries. Idempotent on the purchase's ref, so it
  is safe to call again for a purchase whose grant failed (kempo-credits was down, say). A purchase
  with no user, or with nothing that grants credits, does nothing.
*/
export const grantPurchaseCredits = async purchase => {
  const amount = totalCredits(purchase);
  if(!amount || !purchase.userId) return [null, { granted: 0 }];

  const credits = await loadCredits();
  if(!credits) return [{ code: 501, msg: 'kempo-credits is not installed' }, null];

  const [error, result] = await credits.grantCredits({
    userId: purchase.userId,
    amount,
    kind: 'purchase',
    reason: 'product-purchase',
    reference: { owner: OWNER, ref: purchase.ref },
    idempotencyKey: `products:purchase:${purchase.ref}`,
  });
  if(error) return [error, null];
  return [null, { granted: amount, duplicate: Boolean(result.duplicate) }];
};

/*
  Takes back the credits a purchase gave when the purchase is reversed. What the buyer still holds
  is taken; what they have already spent becomes a shortfall that kempo-credits records and reports.
  A purchase that gave nothing has nothing to take back.
*/
export const takeBackPurchaseCredits = async purchase => {
  if(!totalCredits(purchase) || !purchase.userId) return [null, { taken: 0 }];

  const credits = await loadCredits();
  if(!credits) return [{ code: 501, msg: 'kempo-credits is not installed' }, null];

  const [error, result] = await credits.clawBackGrant({
    reference: { owner: OWNER, ref: purchase.ref },
    reason: 'purchase-reversed',
    idempotencyKey: `products:reverse:${purchase.ref}`,
  });
  if(error && error.code !== 404) return [error, null];
  return [null, result ?? { taken: 0 }];
};
