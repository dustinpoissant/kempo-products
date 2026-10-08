import { readAccess, forCaller } from '../../../server/utils/access.js';
import { getProducts, resolveImages } from '../../../server/utils/products.js';
import { getCurrency, getPageSize } from '../../../server/utils/settings.js';
import { parseTagParam } from '../../../server/utils/tags.js';

export default async (request, response) => {
  const access = await readAccess(request);
  const { q, type, status, availability, tag, filters, sort, inStock, owner, limit, offset } = request.query;

  let parsedFilters = {};
  if(filters){
    try {
      parsedFilters = JSON.parse(filters);
    } catch {
      return response.status(400).json({ error: 'filters must be a JSON object' });
    }
    if(parsedFilters === null || typeof parsedFilters !== 'object' || Array.isArray(parsedFilters)){
      return response.status(400).json({ error: 'filters must be a JSON object' });
    }
  }

  const fallback = await getPageSize();
  const [error, data] = await getProducts({
    q,
    type,
    status: access.canManage ? status : 'published',
    availability,
    tag: parseTagParam(tag),
    filters: parsedFilters,
    sort,
    inStock: inStock === 'true',
    owner: access.canManage ? owner : undefined,
    limit: Math.min(parseInt(limit) || fallback, 200),
    offset: parseInt(offset) || 0,
  });
  if(error) return response.status(error.code).json({ error: error.msg });
  response.json({
    items: data.items.map(product => forCaller(product, access)),
    total: data.total,
    images: await resolveImages(data.items),
    currency: await getCurrency(),
  });
};
