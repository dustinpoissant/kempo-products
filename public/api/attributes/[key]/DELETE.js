import authorize from '../../../../server/utils/authorize.js';
import { deleteAttribute } from '../../../../server/utils/attributes.js';

export default async (request, response) => {
  const [authError] = await authorize(request, 'attributes:manage');
  if(authError) return response.status(authError.code).json({ error: authError.msg });

  const [error, result] = await deleteAttribute(request.params.key);
  if(error) return response.status(error.code).json({ error: error.msg });
  response.json(result);
};
