import authorize from '../../../../../server/utils/authorize.js';
import { reversePurchase } from '../../../../../server/utils/purchases.js';

export default async (request, response) => {
  const [authError] = await authorize(request, 'purchases:record');
  if(authError) return response.status(authError.code).json({ error: authError.msg });

  const [error, purchase] = await reversePurchase(request.params.ref);
  if(error) return response.status(error.code).json({ error: error.msg });
  response.json({ purchase });
};
