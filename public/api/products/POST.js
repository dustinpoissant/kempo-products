import authorize from '../../../server/utils/authorize.js';
import { createProduct } from '../../../server/utils/products.js';

export default async (request, response) => {
  const [authError, auth] = await authorize(request, 'create');
  if(authError) return response.status(authError.code).json({ error: authError.msg });

  const { name, slug, type, description, status, availability, price, priceLabel, stock, images, tags, fields, options } = request.body || {};
  const [error, product] = await createProduct({ name, slug, type, description, status, availability, price, priceLabel, stock, images, tags, fields, options, userId: auth.userId });
  if(error) return response.status(error.code).json({ error: error.msg });
  response.status(201).json({ product });
};
