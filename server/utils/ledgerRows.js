import crypto from 'crypto';

export const newId = () => crypto.randomBytes(8).toString('hex');

export const isUniqueViolation = error => (error?.code || error?.cause?.code) === '23505';

/* The rows to insert into the ledger for some changes: [{ productId, name, change, quantity }]. */
export const ledgerRowsFor = (changes, { ref = '', reason = '', note = '', undoes = '', actor = '', userId = '', now = new Date() } = {}) => changes.map(change => ({
  id: newId(), ref, productId: change.productId, name: change.name ?? '', change: change.change, quantity: change.quantity,
  reason, note, actor, userId, undoes, created: now,
}));
