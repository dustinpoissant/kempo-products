import { getSetting } from 'kempo/server/sdk.js';

const NAME = 'kempo-products';

export const getCurrency = async () => {
  const [, value] = await getSetting(NAME, 'currency', 'usd');
  const code = String(value ?? '').trim().toLowerCase();
  return /^[a-z]{3}$/.test(code) ? code : 'usd';
};

export const pricesVisible = async () => {
  const [, value] = await getSetting(NAME, 'prices_visible', true);
  return value !== false && value !== 'false';
};

export const getPageSize = async () => {
  const [, value] = await getSetting(NAME, 'page_size', 24);
  const size = Number(value);
  return Number.isInteger(size) && size > 0 ? Math.min(size, 100) : 24;
};

/*
  How many credits equal one whole unit of the currency: 100 means 1 credit is worth 1 cent (and 1
  credit is a yen where the currency has no cents). It only matters while kempo-credits is in use.
*/
export const DEFAULT_CREDITS_PER_UNIT = 100;

export const getCreditsPerUnit = async () => {
  const [, value] = await getSetting(NAME, 'credits_per_unit', DEFAULT_CREDITS_PER_UNIT);
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : DEFAULT_CREDITS_PER_UNIT;
};
