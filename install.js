import { sql } from 'drizzle-orm';
import db from 'kempo/server/db/index.js';

/*
  kempo's installer builds CREATE TABLE from the Drizzle columns only; indexes and unique
  constraints declared in server/db/schema.js are not carried across. The unique slug, key and ref
  indexes are correctness guarantees, so they are created here, matching the schema.
*/
const INDEXES = [
  sql`CREATE UNIQUE INDEX IF NOT EXISTS "kempoProductSlugIdx" ON "kempoProduct" ("slug")`,
  sql`CREATE INDEX IF NOT EXISTS "kempoProductOwnerIdx" ON "kempoProduct" ("owner")`,
  sql`CREATE INDEX IF NOT EXISTS "kempoProductStatusIdx" ON "kempoProduct" ("status")`,
  sql`CREATE UNIQUE INDEX IF NOT EXISTS "kempoProductTypeKeyIdx" ON "kempoProductType" ("key")`,
  sql`CREATE UNIQUE INDEX IF NOT EXISTS "kempoProductFieldKeyIdx" ON "kempoProductField" ("productType", "key")`,
  sql`CREATE UNIQUE INDEX IF NOT EXISTS "kempoProductOptionKeyIdx" ON "kempoProductOption" ("productId", "key")`,
  sql`CREATE UNIQUE INDEX IF NOT EXISTS "kempoProductPurchaseRefIdx" ON "kempoProductPurchase" ("ref")`,
];

export default async () => {
  for(const statement of INDEXES) await db.execute(statement);
};
