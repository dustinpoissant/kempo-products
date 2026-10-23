import { readAccess, forCaller, visibleTo } from '../../../../server/utils/access.js';
import { getProduct, resolveImages } from '../../../../server/utils/products.js';
import { getAttributes } from '../../../../server/utils/attributes.js';
import { getTemplate } from '../../../../server/utils/templates.js';
import { applicableAttributes } from '../../../../server/utils/attributeTypes.js';
import { getCurrency } from '../../../../server/utils/settings.js';

export default async (request, response) => {
  const access = await readAccess(request);
  const [error, product] = await getProduct(request.params.id);
  if(error) return response.status(error.code).json({ error: error.msg });
  if(!visibleTo(product, access)) return response.status(404).json({ error: 'Product not found' });

  const [, shared] = await getAttributes();
  const [, template] = product.template ? await getTemplate(product.template) : [null, null];
  const attributes = applicableAttributes(shared ?? [], template, product.attributeDefs);
  response.json({
    product: forCaller(product, access),
    attributes,
    template: template ? { key: template.key, name: template.name } : null,
    images: await resolveImages([product]),
    currency: await getCurrency(),
  });
};
