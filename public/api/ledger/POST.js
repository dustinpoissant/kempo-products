import authorize from '../../../server/utils/authorize.js';
import { addLedgerEntry } from '../../../server/utils/ledger.js';

export default async (request, response) => {
  const [authError, auth] = await authorize(request, 'ledger:add');
  if(authError) return response.status(authError.code).json({ error: authError.msg });

  const { ref, lines, note, reason } = request.body || {};
  const [error, entry] = await addLedgerEntry({ ref, lines, note, reason, userId: auth.userId });
  if(error) return response.status(error.code).json({ error: error.msg });
  response.status(entry.duplicate ? 200 : 201).json({ entry });
};
