import { getFields } from '../../../server/utils/fields.js';

/* ?type=model-car returns just what a product of that type shows (the default fields plus its own). */
export default async (request, response) => {
  const scoped = request.query.type !== undefined;
  const [error, fields] = await getFields(scoped ? { productType: request.query.type } : {});
  if(error) return response.status(error.code).json({ error: error.msg });
  response.json({ fields });
};
