import authorize from '../../../../server/utils/authorize.js';
import { deleteCategory } from '../../../../server/utils/categories.js';

export default async (request, response) => {
  const [authError] = await authorize(request, 'categories:manage');
  if(authError) return response.status(authError.code).json({ error: authError.msg });

  const [error, result] = await deleteCategory(request.params.key);
  if(error) return response.status(error.code).json({ error: error.msg });
  response.json(result);
};
