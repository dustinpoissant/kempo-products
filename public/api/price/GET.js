import { readAccess, visibleTo } from '../../../server/utils/access.js';
import { getProduct, getPrice } from '../../../server/utils/products.js';

/*
  The price of a product for a set of selections, computed on the server:
  ?product=<id or slug>&options={"color":"blue"}. A browser can show a price from the options it
  already has, but this is the number that counts.
*/
export default async (request, response) => {
  const access = await readAccess(request);
  if(!access.showPrices) return response.status(403).json({ error: 'Prices are not shown on this site' });

  let selections = {};
  if(request.query.options){
    try {
      selections = JSON.parse(request.query.options);
    } catch {
      return response.status(400).json({ error: 'options must be a JSON object' });
    }
  }

  const [lookupError, product] = await getProduct(request.query.product);
  if(lookupError) return response.status(lookupError.code).json({ error: lookupError.msg });
  if(!visibleTo(product, access)) return response.status(404).json({ error: 'Product not found' });

  const [error, price] = await getPrice(product.id, selections);
  if(error) return response.status(error.code).json({ error: error.msg });
  response.json({ price });
};
