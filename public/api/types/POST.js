import authorize from '../../../server/utils/authorize.js';
import { createType } from '../../../server/utils/types.js';

export default async (request, response) => {
  const [authError] = await authorize(request, 'types:manage');
  if(authError) return response.status(authError.code).json({ error: authError.msg });

  const { key, name, description, position } = request.body || {};
  const [error, type] = await createType({ key, name, description, position });
  if(error) return response.status(error.code).json({ error: error.msg });
  response.status(201).json({ type });
};
