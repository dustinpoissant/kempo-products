import authorize from '../../../../server/utils/authorize.js';
import { updateField } from '../../../../server/utils/fields.js';

export default async (request, response) => {
  const [authError] = await authorize(request, 'types:manage');
  if(authError) return response.status(authError.code).json({ error: authError.msg });

  const body = request.body || {};
  const changes = {};
  for(const property of ['label', 'description', 'required', 'listed', 'filterable', 'options', 'position', 'type']){
    if(body[property] !== undefined) changes[property] = body[property];
  }
  const [error, field] = await updateField(request.params.key, changes, { productType: request.query.type ?? '' });
  if(error) return response.status(error.code).json({ error: error.msg });
  response.json({ field });
};
