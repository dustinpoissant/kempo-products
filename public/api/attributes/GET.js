import { getAttributes } from '../../../server/utils/attributes.js';

export default async (request, response) => {
  const [error, attributes] = await getAttributes();
  if(error) return response.status(error.code).json({ error: error.msg });
  response.json({ attributes });
};
