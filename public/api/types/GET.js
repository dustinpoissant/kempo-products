import { getTypes } from '../../../server/utils/types.js';

export default async (request, response) => {
  const [error, types] = await getTypes();
  if(error) return response.status(error.code).json({ error: error.msg });
  response.json({ types });
};
