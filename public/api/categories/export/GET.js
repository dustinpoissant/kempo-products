import authorize from '../../../../server/utils/authorize.js';
import { buildCategoryExport } from '../../../../server/utils/categoryImportExport.js';

/* Downloads the categories: ?format=csv (a spreadsheet, the default) or ?format=json. */
export default async (request, response) => {
  const [authError] = await authorize(request, 'categories:manage');
  if(authError) return response.status(authError.code).json({ error: authError.msg });

  const [error, built] = await buildCategoryExport({ format: request.query.format === 'json' ? 'json' : 'csv' });
  if(error) return response.status(error.code).json({ error: error.msg });

  const stamp = new Date().toISOString().slice(0, 10);
  response.setHeader('Content-Type', built.contentType);
  response.setHeader('Content-Disposition', `attachment; filename="${built.filename.replace(/\.([a-z]+)$/, `-${stamp}.$1`)}"`);
  response.setHeader('Cache-Control', 'no-store');
  response.status(200);
  response.end(built.body);
};
