import authorize from '../../../server/utils/authorize.js';
import { getLedger } from '../../../server/utils/ledger.js';

export default async (request, response) => {
  const [authError] = await authorize(request, 'read');
  if(authError) return response.status(authError.code).json({ error: authError.msg });

  const [error, data] = await getLedger({
    productId: request.query.productId,
    limit: Math.min(parseInt(request.query.limit) || 50, 200),
    offset: parseInt(request.query.offset) || 0,
  });
  if(error) return response.status(error.code).json({ error: error.msg });
  response.json(data);
};
