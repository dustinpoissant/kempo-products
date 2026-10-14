import authorize from '../../../server/utils/authorize.js';
import { readCatalogSettings } from '../../../server/utils/catalogSettings.js';

export default async (request, response) => {
  const [authError] = await authorize(request, 'settings:manage');
  if(authError) return response.status(authError.code).json({ error: authError.msg });

  const [error, result] = await readCatalogSettings();
  if(error) return response.status(error.code).json({ error: error.msg });
  response.json(result);
};
