import authorize from '../../../server/utils/authorize.js';
import { saveCatalogSettings } from '../../../server/utils/catalogSettings.js';

/*
  Saves { name: value } for any of the catalog's declared settings. A name that is not declared, or
  a value that is not acceptable, saves nothing at all.
*/
export default async (request, response) => {
  const [authError] = await authorize(request, 'settings:manage');
  if(authError) return response.status(authError.code).json({ error: authError.msg });

  const [error, result] = await saveCatalogSettings(request.body);
  if(error) return response.status(error.code).json({ error: error.msg });
  response.json(result);
};
