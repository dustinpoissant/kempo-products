import authorize from '../../../../server/utils/authorize.js';
import { deleteProduct } from '../../../../server/utils/products.js';

export default async (request, response) => {
  const [authError, auth] = await authorize(request, 'delete');
  if(authError) return response.status(authError.code).json({ error: authError.msg });

  const [error, result] = await deleteProduct(request.params.id, { userId: auth.userId });
  if(error) return response.status(error.code).json({ error: error.msg });
  response.json(result);
};
