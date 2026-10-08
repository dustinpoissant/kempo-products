import { readAccess, forCaller, visibleTo } from '../../../../server/utils/access.js';
import { getProduct, resolveImages } from '../../../../server/utils/products.js';
import { getFields } from '../../../../server/utils/fields.js';
import { getType } from '../../../../server/utils/types.js';
import { getCurrency } from '../../../../server/utils/settings.js';

export default async (request, response) => {
  const access = await readAccess(request);
  const [error, product] = await getProduct(request.params.id);
  if(error) return response.status(error.code).json({ error: error.msg });
  if(!visibleTo(product, access)) return response.status(404).json({ error: 'Product not found' });

  const [, fields] = await getFields({ productType: product.type });
  const [, type] = product.type ? await getType(product.type) : [null, null];
  response.json({
    product: forCaller(product, access),
    fields: fields ?? [],
    type: type ? { key: type.key, name: type.name } : null,
    images: await resolveImages([product]),
    currency: await getCurrency(),
  });
};
