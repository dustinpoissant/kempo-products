import authorize from '../../../../server/utils/authorize.js';
import { deleteType } from '../../../../server/utils/types.js';

export default async (request, response) => {
  const [authError] = await authorize(request, 'types:manage');
  if(authError) return response.status(authError.code).json({ error: authError.msg });

  const [error, result] = await deleteType(request.params.key);
  if(error) return response.status(error.code).json({ error: error.msg });
  response.json(result);
};
