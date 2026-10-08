import authorize from '../../../server/utils/authorize.js';
import { createField } from '../../../server/utils/fields.js';

export default async (request, response) => {
  const [authError] = await authorize(request, 'types:manage');
  if(authError) return response.status(authError.code).json({ error: authError.msg });

  const { key, label, type, description, required, listed, filterable, options, position, productType } = request.body || {};
  const [error, field] = await createField({ key, label, type, description, required, listed, filterable, options, position, productType });
  if(error) return response.status(error.code).json({ error: error.msg });
  response.status(201).json({ field });
};
