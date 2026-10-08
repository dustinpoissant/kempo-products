import authorize from '../../../../server/utils/authorize.js';
import { updateType } from '../../../../server/utils/types.js';

export default async (request, response) => {
  const [authError] = await authorize(request, 'types:manage');
  if(authError) return response.status(authError.code).json({ error: authError.msg });

  const body = request.body || {};
  const changes = {};
  for(const property of ['name', 'description', 'position']){
    if(body[property] !== undefined) changes[property] = body[property];
  }
  const [error, type] = await updateType(request.params.key, changes);
  if(error) return response.status(error.code).json({ error: error.msg });
  response.json({ type });
};
