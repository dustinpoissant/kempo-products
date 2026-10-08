import authorize from '../../../server/utils/authorize.js';
import { recordPurchase } from '../../../server/utils/purchases.js';

/*
  Recording a purchase made elsewhere (Etsy, in person). It is the manual path: a person with the
  permission may give a line's unit price for a product that has none.
*/
export default async (request, response) => {
  const [authError, auth] = await authorize(request, 'purchases:record');
  if(authError) return response.status(authError.code).json({ error: authError.msg });

  const { ref, lines } = request.body || {};
  const [error, purchase] = await recordPurchase({ ref, lines, userId: auth.userId }, { manual: true });
  if(error) return response.status(error.code).json({ error: error.msg });
  response.status(201).json({ purchase });
};
