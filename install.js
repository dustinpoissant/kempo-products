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
  sql`CREATE UNIQUE INDEX IF NOT EXISTS "kempoProductTemplateKeyIdx" ON "kempoProductTemplate" ("key")`,
  sql`CREATE UNIQUE INDEX IF NOT EXISTS "kempoProductTypeKeyIdx" ON "kempoProductType" ("key")`,
  sql`CREATE UNIQUE INDEX IF NOT EXISTS "kempoProductCategoryKeyIdx" ON "kempoProductCategory" ("key")`,
  sql`CREATE UNIQUE INDEX IF NOT EXISTS "kempoProductAttributeKeyIdx" ON "kempoProductAttribute" ("key")`,
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
  sql`ALTER TABLE "kempoProduct" ADD COLUMN IF NOT EXISTS "minimumPrice" integer`,
  sql`ALTER TABLE "kempoProduct" ADD COLUMN IF NOT EXISTS "productType" text NOT NULL DEFAULT 'generic'`,
  sql`ALTER TABLE "kempoProduct" ALTER COLUMN "productType" SET DEFAULT 'generic'`,
  sql`ALTER TABLE "kempoProductTemplate" ADD COLUMN IF NOT EXISTS "product" jsonb NOT NULL DEFAULT '{}'::jsonb`,
  sql`ALTER TABLE "kempoProduct" ADD COLUMN IF NOT EXISTS "template" text NOT NULL DEFAULT ''`,
  sql`ALTER TABLE "kempoProduct" ADD COLUMN IF NOT EXISTS "attributeDefs" jsonb NOT NULL DEFAULT '[]'::jsonb`,
  sql`ALTER TABLE "kempoProductAttribute" ADD COLUMN IF NOT EXISTS "tab" text NOT NULL DEFAULT ''`,
];

/*
  The built-in product type every product starts as, the type kempo-shipping now owns (a site that already had
  'physical' keeps it, and kempo-shipping takes it over), and the products that were credit packs before product
  types existed. Idempotent: the seed does nothing once the row is there, and the updates only touch old rows.
*/
export const SEEDS = [
  sql`INSERT INTO "kempoProductType" ("id", "key", "name", "description", "needsShipping", "owner", "created") VALUES ('generic', 'generic', 'Generic Product', 'Something with no delivery of its own: nothing is shipped for it', false, '', now()) ON CONFLICT ("key") DO NOTHING`,
  sql`UPDATE "kempoProductType" SET "owner" = 'kempo-shipping' WHERE "key" = 'physical' AND "owner" = ''`,
  sql`UPDATE "kempoProduct" SET "productType" = 'credits-only' WHERE "creditsOnly" = true AND "productType" IN ('physical', 'generic')`,
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

/*
  What was once called the item type is now the product type. The table that held the old kind of product type (a
  "Model car" with its own attributes) is dead: it is renamed out of the way, keeping its rows for whatever replaces
  it, and the item type table and column take the product type names. Safe to run any number of times: each step
  only acts on what is still in the old shape.
*/
export const migrateProductTypes = async () => {
  const hasTable = async name => (await db.execute(sql`select 1 from information_schema.tables where table_name = ${name}`)).length > 0;
  const hasColumn = async (table, column) => (await db.execute(sql`select 1 from information_schema.columns where table_name = ${table} and column_name = ${column}`)).length > 0;
  if(await hasTable('kempoProductType') && !(await hasColumn('kempoProductType', 'needsShipping'))){
    await db.execute(sql`ALTER TABLE "kempoProductType" RENAME TO "kempoProductTypeLegacy"`);
    await db.execute(sql`ALTER INDEX IF EXISTS "kempoProductTypeKeyIdx" RENAME TO "kempoProductTypeLegacyKeyIdx"`);
  }
  if(await hasTable('kempoProductItemType') && !(await hasTable('kempoProductType'))){
    await db.execute(sql`ALTER TABLE "kempoProductItemType" RENAME TO "kempoProductType"`);
    await db.execute(sql`ALTER INDEX IF EXISTS "kempoProductItemTypeKeyIdx" RENAME TO "kempoProductTypeKeyIdx"`);
  }
  if(await hasColumn('kempoProduct', 'itemType') && !(await hasColumn('kempoProduct', 'productType'))){
    await db.execute(sql`ALTER TABLE "kempoProduct" RENAME COLUMN "itemType" TO "productType"`);
  }
};

/*
  The old product types ("Model car", with attributes of their own, options and defaults) become templates: each type
  that has not been made into a template yet is, with the attributes that were scoped to it, its options and defaults,
  and the products of that type are made from it. The scoped attributes are then moved out of the shared attribute list,
  where they would otherwise show on every product. The old table is kept, so nothing is lost. Safe to run any
  number of times: a type that already has a template is left alone.
*/
export const migrateTypesToTemplates = async () => {
  const hasColumn = async (table, column) => (await db.execute(sql`select 1 from information_schema.columns where table_name = ${table} and column_name = ${column}`)).length > 0;
  if((await db.execute(sql`select 1 from information_schema.tables where table_name = 'kempoProductTypeLegacy'`)).length === 0) return;
  const scoped = await hasColumn('kempoProductAttribute', 'productType');
  const typed = await hasColumn('kempoProduct', 'type');
  const types = await db.execute(sql`select * from "kempoProductTypeLegacy"`);
  const migrated = [];
  for(const type of types){
    const [existing] = await db.execute(sql`select 1 from "kempoProductTemplate" where "key" = ${type.key}`);
    if(existing) continue;
    const attributes = scoped ? (await db.execute(sql`select * from "kempoProductAttribute" where "productType" = ${type.key} order by "position", "created"`)).map((attribute, position) => ({
      key: attribute.key, label: attribute.label, type: attribute.type, description: attribute.description, required: attribute.required, listed: attribute.listed, tab: '', filterable: attribute.filterable, options: attribute.options ?? [], position,
    })) : [];
    await db.execute(sql`insert into "kempoProductTemplate" ("id", "key", "name", "description", "owner", "position", "attributes", "options", "defaults", "created") values (${'migrated-' + type.key}, ${type.key}, ${type.name}, ${type.description ?? ''}, ${type.owner ?? ''}, ${type.position ?? 0}, ${JSON.stringify(attributes)}::jsonb, ${JSON.stringify(type.options ?? [])}::jsonb, ${JSON.stringify(type.defaults ?? {})}::jsonb, now())`);
    migrated.push(type.key);
  }
  if(!migrated.length) return;
  const keys = sql.join(migrated.map(key => sql`${key}`), sql`, `);
  if(typed) await db.execute(sql`UPDATE "kempoProduct" SET "template" = "type" WHERE "template" = '' AND "type" IN (${keys})`);
  if(scoped) await db.execute(sql`DELETE FROM "kempoProductAttribute" WHERE "productType" IN (${keys})`);
};

/*
  Custom fields are now called attributes: the table, its index and the columns that hold them take the new names.
  When the update already made an empty table from the new schema, that one is dropped so the real one can be renamed
  into its place. Safe to run any number of times: each step only acts on what is still in the old shape.
*/
export const migrateAttributes = async () => {
  const hasTable = async name => (await db.execute(sql`select 1 from information_schema.tables where table_name = ${name}`)).length > 0;
  const hasColumn = async (table, column) => (await db.execute(sql`select 1 from information_schema.columns where table_name = ${table} and column_name = ${column}`)).length > 0;
  if(await hasTable('kempoProductField')){
    if(await hasTable('kempoProductAttribute')){
      const [{ total }] = await db.execute(sql`select count(*)::int as total from "kempoProductAttribute"`);
      if(total === 0) await db.execute(sql`DROP TABLE "kempoProductAttribute"`);
    }
    if(!(await hasTable('kempoProductAttribute'))){
      await db.execute(sql`ALTER TABLE "kempoProductField" RENAME TO "kempoProductAttribute"`);
      await db.execute(sql`ALTER INDEX IF EXISTS "kempoProductFieldKeyIdx" RENAME TO "kempoProductAttributeKeyIdx"`);
    }
  }
  if(await hasColumn('kempoProductTemplate', 'fields') && !(await hasColumn('kempoProductTemplate', 'attributes'))){
    await db.execute(sql`ALTER TABLE "kempoProductTemplate" RENAME COLUMN "fields" TO "attributes"`);
  }
  if(await hasColumn('kempoProduct', 'fieldDefs') && !(await hasColumn('kempoProduct', 'attributeDefs'))){
    await db.execute(sql`ALTER TABLE "kempoProduct" RENAME COLUMN "fieldDefs" TO "attributeDefs"`);
  }
};

/*
  The one permission that covered templates and attributes (it still carried the name of the product types that
  templates replaced) is split in two. kempo adds new permissions on an update but never gives them to a group that
  exists already, so every group that held the old one is given both, and nobody loses access. The old permission is
  left in place, because kempo never deletes one.
*/
export const splitTypesPermission = async () => {
  let old;
  try {
    [old] = await db.execute(sql`select 1 from "permission" where "name" = 'products:types:manage'`);
  } catch {
    return;
  }
  if(!old) return;
  for(const [name, description] of [['products:templates:manage', 'Create, edit and delete product templates'], ['products:attributes:manage', 'Create, edit and delete the custom attributes products have']]){
    await db.execute(sql`INSERT INTO "permission" ("name", "description", "owner", "createdAt") VALUES (${name}, ${description}, 'kempo-products', now()) ON CONFLICT ("name") DO NOTHING`);
    await db.execute(sql`INSERT INTO "groupPermission" ("id", "groupName", "permissionName", "createdAt") SELECT md5(random()::text || clock_timestamp()::text || "groupName"), "groupName", ${name}, now() FROM "groupPermission" WHERE "permissionName" = 'products:types:manage' AND "groupName" NOT IN (SELECT "groupName" FROM "groupPermission" WHERE "permissionName" = ${name})`);
  }
};

export default async () => {
  await renameColumns();
  await migrateProductTypes();
  await migrateAttributes();
  for(const statement of COLUMNS) await db.execute(statement);
  for(const statement of INDEXES) await db.execute(statement);
  for(const statement of SEEDS) await db.execute(statement);
  await migrateTypesToTemplates();
  await splitTypesPermission();
};
