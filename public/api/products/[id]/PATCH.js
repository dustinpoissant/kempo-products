import authorize from '../../../../server/utils/authorize.js';
import { updateProduct } from '../../../../server/utils/products.js';

export default async (request, response) => {
  const [authError, auth] = await authorize(request, 'update');
  if(authError) return response.status(authError.code).json({ error: authError.msg });

  const body = request.body || {};
  const data = { userId: auth.userId };
  for(const property of ['name', 'slug', 'type', 'description', 'status', 'availability', 'price', 'priceLabel', 'stock', 'images', 'tags', 'fields', 'options']){
    if(body[property] !== undefined) data[property] = body[property];
  }
  const [error, product] = await updateProduct(request.params.id, data);
  if(error) return response.status(error.code).json({ error: error.msg });
  response.json({ product });
};
