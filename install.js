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
  sql`CREATE UNIQUE INDEX IF NOT EXISTS "kempoProductCategoryKeyIdx" ON "kempoProductCategory" ("key")`,
  sql`CREATE UNIQUE INDEX IF NOT EXISTS "kempoProductFieldKeyIdx" ON "kempoProductField" ("productType", "key")`,
  sql`CREATE UNIQUE INDEX IF NOT EXISTS "kempoProductOptionKeyIdx" ON "kempoProductOption" ("productId", "key")`,
  sql`CREATE UNIQUE INDEX IF NOT EXISTS "kempoProductLedgerRefIdx" ON "kempoProductLedger" ("ref", "productId") WHERE "ref" <> ''`,
  sql`CREATE INDEX IF NOT EXISTS "kempoProductLedgerProductIdx" ON "kempoProductLedger" ("productId", "created")`,
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
  sql`ALTER TABLE "kempoProduct" ADD COLUMN IF NOT EXISTS "categories" jsonb NOT NULL DEFAULT '[]'::jsonb`,
];

/*
  The stock column became `quantity` (a product, an inventory item and a cart line all say quantity).
  kempo never alters a table that exists, so a site that installed before has to be renamed here, once.
  Safe to run any number of times: it only acts when the old column is there and the new one is not.
*/
export const renameColumns = async () => {
  const rows = await db.execute(sql`select column_name from information_schema.columns where table_name = 'kempoProduct'`);
  const names = new Set(rows.map(row => row.column_name));
  if(names.has('stock') && !names.has('quantity')) await db.execute(sql`ALTER TABLE "kempoProduct" RENAME COLUMN "stock" TO "quantity"`);
};

export default async () => {
  await renameColumns();
  for(const statement of COLUMNS) await db.execute(statement);
  for(const statement of INDEXES) await db.execute(statement);
};
