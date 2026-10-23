import authorize from '../../../../server/utils/authorize.js';
import { updateAttribute } from '../../../../server/utils/attributes.js';

export default async (request, response) => {
  const [authError] = await authorize(request, 'attributes:manage');
  if(authError) return response.status(authError.code).json({ error: authError.msg });

  const body = request.body || {};
  const changes = {};
  for(const property of ['label', 'description', 'required', 'listed', 'filterable', 'options', 'position', 'type']){
    if(body[property] !== undefined) changes[property] = body[property];
  }
  const [error, attribute] = await updateAttribute(request.params.key, changes);
  if(error) return response.status(error.code).json({ error: error.msg });
  response.json({ attribute });
};
