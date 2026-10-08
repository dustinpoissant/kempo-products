import authorize from '../../../../server/utils/authorize.js';
import { deleteField } from '../../../../server/utils/fields.js';

export default async (request, response) => {
  const [authError] = await authorize(request, 'types:manage');
  if(authError) return response.status(authError.code).json({ error: authError.msg });

  const [error, result] = await deleteField(request.params.key, { productType: request.query.type ?? '' });
  if(error) return response.status(error.code).json({ error: error.msg });
  response.json(result);
};
