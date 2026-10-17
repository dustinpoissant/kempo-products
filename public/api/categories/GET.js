import { getCategories } from '../../../server/utils/categories.js';
import { readAccess } from '../../../server/utils/access.js';

/*
  Anyone can read the categories. A visitor gets how many published products each has; people who can
  manage the catalog also get `total`, which counts drafts and archived products too.
*/
export default async (request, response) => {
  const [error, categories] = await getCategories();
  if(error) return response.status(error.code).json({ error: error.msg });
  const access = await readAccess(request);
  response.json({ categories: access.canManage ? categories : categories.map(({ total, ...category }) => category) });
};
