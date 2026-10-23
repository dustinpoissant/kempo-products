import { getProductTypes } from '../../../server/utils/productTypes.js';

export default async (request, response) => {
  const [error, productTypes] = await getProductTypes();
  if(error) return response.status(error.code).json({ error: error.msg });
  response.json({ productTypes });
};
