import { readAccess } from '../../../server/utils/access.js';
import { getCurrency, getPageSize } from '../../../server/utils/settings.js';
import { mediaAvailable } from '../../../server/utils/media.js';
import { FIELD_TYPES, OPTIONAL_TYPES, CONVERSIONS } from '../../../server/utils/fieldTypes.js';
import { STATUSES, AVAILABILITIES } from '../../../server/utils/stock.js';
import { PRICE_TYPES } from '../../../server/utils/pricing.js';
import { SORT_KEYS } from '../../../server/utils/products.js';
import { decimalsFor } from '../../../server/utils/money.js';

export default async (request, response) => {
  const access = await readAccess(request);
  const media = await mediaAvailable();
  const currency = await getCurrency();
  response.json({
    currency,
    decimals: decimalsFor(currency),
    showPrices: access.showPrices,
    canManage: access.canManage,
    pageSize: await getPageSize(),
    media,
    fieldTypes: FIELD_TYPES.filter(type => !OPTIONAL_TYPES[type] || media),
    conversions: CONVERSIONS,
    statuses: STATUSES,
    availabilities: AVAILABILITIES,
    priceTypes: PRICE_TYPES,
    sorts: SORT_KEYS,
  });
};
