import authorize from '../../../../server/utils/authorize.js';
import { updateTemplate } from '../../../../server/utils/templates.js';

export default async (request, response) => {
  const [authError] = await authorize(request, 'templates:manage');
  if(authError) return response.status(authError.code).json({ error: authError.msg });

  const body = request.body || {};
  const changes = {};
  for(const property of ['name', 'description', 'position', 'attributes', 'options', 'defaults', 'product']){
    if(body[property] !== undefined) changes[property] = body[property];
  }
  const [error, template] = await updateTemplate(request.params.key, changes);
  if(error) return response.status(error.code).json({ error: error.msg });
  response.json({ template });
};
