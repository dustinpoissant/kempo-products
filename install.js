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

/*
  Columns added to kempoProduct after it was first created. kempo creates a table that is new in an
  update but never alters one that exists, so a site that installed before them would never get
  them and every product read would fail. `IF NOT EXISTS` makes this safe on every install and update.
*/
export const COLUMNS = [
  sql`ALTER TABLE "kempoProduct" ADD COLUMN IF NOT EXISTS "creditsGranted" integer NOT NULL DEFAULT 0`,
  sql`ALTER TABLE "kempoProduct" ADD COLUMN IF NOT EXISTS "creditsOnly" boolean NOT NULL DEFAULT false`,
  sql`ALTER TABLE "kempoProduct" ADD COLUMN IF NOT EXISTS "creditPercent" integer NOT NULL DEFAULT 0`,
];

export default async () => {
  for(const statement of COLUMNS) await db.execute(statement);
  for(const statement of INDEXES) await db.execute(statement);
};
