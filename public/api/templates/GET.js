import { getTemplates } from '../../../server/utils/templates.js';

export default async (request, response) => {
  const [error, templates] = await getTemplates();
  if(error) return response.status(error.code).json({ error: error.msg });
  response.json({ templates });
};
