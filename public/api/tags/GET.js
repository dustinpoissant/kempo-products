import { readAccess } from '../../../server/utils/access.js';
import { getTags } from '../../../server/utils/productTags.js';

/*
  The tags products carry, for the tag selector. Anyone can read them; visitors get the published products' tags only,
  and people who manage the catalog get every product's tags. Each comes with how many products have it.
*/
export default async (request, response) => {
  const access = await readAccess(request);
  const [error, tags] = await getTags({ includeDrafts: access.canManage });
  if(error) return response.status(error.code).json({ error: error.msg });
  response.json({ tags });
};
