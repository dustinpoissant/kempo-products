import authorize from '../../../server/utils/authorize.js';
import { importFile } from '../../../server/utils/importExport.js';

/*
  Imports a catalog file: { content, onMatch, dryRun }. `content` is the text of a .csv or .json
  file; `onMatch` ('skip' or 'update') says what to do with a product whose slug already exists;
  `dryRun` reports what would happen without changing anything. Importing creates and may update
  products, so it needs both permissions.
*/
export default async (request, response) => {
  const [createError, auth] = await authorize(request, 'create');
  if(createError) return response.status(createError.code).json({ error: createError.msg });
  const [updateError] = await authorize(request, 'update');
  if(updateError) return response.status(updateError.code).json({ error: updateError.msg });

  const { content, onMatch, dryRun } = request.body || {};
  const [error, result] = await importFile(content, { onMatch, dryRun: dryRun === true, userId: auth.userId });
  if(error) return response.status(error.code).json({ error: error.msg });
  response.json(result);
};
