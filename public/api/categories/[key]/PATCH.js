import authorize from '../../../../server/utils/authorize.js';
import { updateCategory } from '../../../../server/utils/categories.js';

export default async (request, response) => {
  const [authError] = await authorize(request, 'categories:manage');
  if(authError) return response.status(authError.code).json({ error: authError.msg });

  const body = request.body || {};
  const changes = {};
  for(const property of ['name', 'description', 'position']){
    if(body[property] !== undefined) changes[property] = body[property];
  }
  const [error, category] = await updateCategory(request.params.key, changes);
  if(error) return response.status(error.code).json({ error: error.msg });
  response.json({ category });
};
