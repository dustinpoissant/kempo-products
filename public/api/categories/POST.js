import authorize from '../../../server/utils/authorize.js';
import { createCategory } from '../../../server/utils/categories.js';

export default async (request, response) => {
  const [authError] = await authorize(request, 'categories:manage');
  if(authError) return response.status(authError.code).json({ error: authError.msg });

  const { key, name, description, position } = request.body || {};
  const [error, category] = await createCategory({ key, name, description, position });
  if(error) return response.status(error.code).json({ error: error.msg });
  response.status(201).json({ category });
};
