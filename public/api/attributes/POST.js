import authorize from '../../../server/utils/authorize.js';
import { createAttribute } from '../../../server/utils/attributes.js';

export default async (request, response) => {
  const [authError] = await authorize(request, 'attributes:manage');
  if(authError) return response.status(authError.code).json({ error: authError.msg });

  const { key, label, type, description, required, listed, filterable, options, position } = request.body || {};
  const [error, attribute] = await createAttribute({ key, label, type, description, required, listed, filterable, options, position });
  if(error) return response.status(error.code).json({ error: error.msg });
  response.status(201).json({ attribute });
};
