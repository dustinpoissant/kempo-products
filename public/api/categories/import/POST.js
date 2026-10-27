import authorize from '../../../../server/utils/authorize.js';
import { importCategories } from '../../../../server/utils/categoryImportExport.js';

/* Imports categories: { content, onMatch, dryRun }. See categoryImportExport.js for what each one does. */
export default async (request, response) => {
  const [authError, auth] = await authorize(request, 'categories:manage');
  if(authError) return response.status(authError.code).json({ error: authError.msg });

  const { content, onMatch, dryRun } = request.body || {};
  const [error, result] = await importCategories({ content, onMatch, dryRun: dryRun === true, actor: auth.userId });
  if(error) return response.status(error.code).json({ error: error.msg });
  response.json(result);
};
