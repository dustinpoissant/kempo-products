import authorize from '../../../../server/utils/authorize.js';
import { deleteTemplate } from '../../../../server/utils/templates.js';

export default async (request, response) => {
  const [authError] = await authorize(request, 'templates:manage');
  if(authError) return response.status(authError.code).json({ error: authError.msg });

  const [error, result] = await deleteTemplate(request.params.key);
  if(error) return response.status(error.code).json({ error: error.msg });
  response.json(result);
};
