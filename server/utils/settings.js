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
