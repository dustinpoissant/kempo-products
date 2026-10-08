import { currentUserHasPermission, getSession } from 'kempo/server/sdk.js';
import { pricesVisible } from './settings.js';

/*
  Who is looking. The catalog is public: anyone can read published products. People holding
  `products:read` can also see drafts and archived products, and the exact stock count.

  Resolves to { userId, canManage, showPrices }.
*/
export const readAccess = async request => {
  const token = request.cookies?.session_token;
  let userId = null;
  let canManage = false;
  if(token){
    const [sessionError, session] = await getSession({ token });
    if(!sessionError && session?.user){
      userId = session.user.id;
      const [, allowed] = await currentUserHasPermission(token, 'products:read');
      canManage = Boolean(allowed);
    }
  }
  return { userId, canManage, showPrices: canManage || await pricesVisible() };
};

/*
  A product as the caller may see it. Visitors get no stock count (only whether it is in stock),
  no ownership details, and no prices when the site hides them. Whether they may see the product
  at all is `visibleTo`, which callers check first.
*/
export const forCaller = (product, access) => {
  const { stock, managedBy, owner, ...visible } = product;
  const shaped = access.canManage ? product : visible;
  if(access.showPrices) return shaped;
  return {
    ...shaped,
    price: null,
    options: product.options.map(option => ({ ...option, choices: option.choices.map(choice => ({ ...choice, price: 0 })) })),
  };
};

export const visibleTo = (product, access) => access.canManage || product.status === 'published';
