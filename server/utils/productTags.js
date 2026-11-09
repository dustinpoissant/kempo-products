import db from 'kempo/server/db/index.js';
import { kempoProduct } from '../db/schema.js';
import { countTags } from './tags.js';

/*
  Every tag products carry, with how many products have it, most used first. Visitors get the published products only,
  so a tag that only drafts carry is not offered to them; people who manage the catalog get every product.
*/
export const getTags = async ({ includeDrafts = false } = {}) => {
  try {
    const rows = await db.select({ tags: kempoProduct.tags, status: kempoProduct.status }).from(kempoProduct);
    const lists = rows.filter(row => includeDrafts || row.status === 'published').map(row => row.tags ?? []);
    return [null, countTags(lists)];
  } catch {
    return [{ code: 500, msg: 'Failed to retrieve tags' }, null];
  }
};
