import authorize from '../../../server/utils/authorize.js';
import { createTemplate } from '../../../server/utils/templates.js';

export default async (request, response) => {
  const [authError] = await authorize(request, 'templates:manage');
  if(authError) return response.status(authError.code).json({ error: authError.msg });

  const { key, name, description, position, attributes, options, defaults, product } = request.body || {};
  const [error, template] = await createTemplate({ key, name, description, position, attributes, options, defaults, product });
  if(error) return response.status(error.code).json({ error: error.msg });
  response.status(201).json({ template });
};
