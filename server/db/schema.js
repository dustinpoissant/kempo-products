import { sql } from 'drizzle-orm';
import { pgTable, text, timestamp, integer, boolean, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';

/*
  A product has only the columns every catalog needs. Everything else lives in `data`, keyed by the
  `key` of a kempoProductField row, so fields can be added and removed without touching the schema.
  Money is an integer in the currency's smallest unit; `price` is null when a product has none.

  The three `credit*` columns belong to the optional kempo-credits integration (server/utils/credits.js)
  and mean nothing when it is not installed and enabled.
*/
export const kempoProduct = pgTable('kempoProduct', {
  id: text('id').primaryKey(),
  slug: text('slug').notNull(),
  name: text('name').notNull(),
  type: text('type').notNull().default(''), // the key of a kempoProductType; '' = untyped
  description: text('description').notNull().default(''),
  status: text('status').notNull().default('draft'), // draft | published | archived
  availability: text('availability').notNull().default('available'), // available | pending | sold
  price: integer('price'),
  minimumPrice: integer('minimumPrice'), // the lowest discounts may take the unit price to; null = no floor (discounts stop at 0)
  priceLabel: text('priceLabel').notNull().default(''), // shown when there is no price, e.g. "Call for price"
  creditsGranted: integer('creditsGranted').notNull().default(0), // kempo-credits: credits the buyer is given, per unit bought
  creditsOnly: boolean('creditsOnly').notNull().default(false), // kempo-credits: buying it gives credits and nothing else
  creditPercent: integer('creditPercent').notNull().default(0), // kempo-credits: how much of the price may be paid in credits, 0-100
  quantity: integer('quantity').notNull().default(-1), // -1 = unlimited
  managedBy: text('managedBy').notNull().default(''), // '' = people; otherwise the extension that maintains quantity and choice availability
  images: jsonb('images').notNull().default([]), // kempo-media ids, in order; empty without kempo-media
  tags: jsonb('tags').notNull().default([]),
  categories: jsonb('categories').notNull().default([]), // keys of kempoProductCategory rows, in the order chosen
  data: jsonb('data').notNull().default({}),
  owner: text('owner').notNull().default(''), // '' for products people manage, or the extension that created it
  created: timestamp('created').notNull(),
  updated: timestamp('updated').notNull(),
  publishedAt: timestamp('publishedAt'),
}, table => [
  uniqueIndex('kempoProductSlugIdx').on(table.slug),
  index('kempoProductOwnerIdx').on(table.owner),
  index('kempoProductStatusIdx').on(table.status),
]);

/*
  A way to group products for browsing ("Model cars", "Paint"), separate from the product's type: a
  type decides which fields a product has and a product is of one, while a product can be in any
  number of categories. Its key is used in addresses (/products/?category=model-cars) and is fixed once
  created. A product lists the keys of its categories in its `categories` column.
*/
export const kempoProductCategory = pgTable('kempoProductCategory', {
  id: text('id').primaryKey(),
  key: text('key').notNull(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  position: integer('position').notNull().default(0),
  created: timestamp('created').notNull(),
}, table => [uniqueIndex('kempoProductCategoryKeyIdx').on(table.key)]);

/*
  A kind of product ("Vehicle", "Model car") with its own fields. Its key is fixed once created.
*/
export const kempoProductType = pgTable('kempoProductType', {
  id: text('id').primaryKey(),
  key: text('key').notNull(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  owner: text('owner').notNull().default(''),
  position: integer('position').notNull().default(0),
  created: timestamp('created').notNull(),
}, table => [uniqueIndex('kempoProductTypeKeyIdx').on(table.key)]);

/*
  `productType` scopes a field: '' is the default scope, shown on every product, and a type key
  makes it appear only on products of that type. A key is unique within its scope, and a type
  cannot reuse a key the default scope has, because both would be stored under the same name.
*/
export const kempoProductField = pgTable('kempoProductField', {
  id: text('id').primaryKey(),
  key: text('key').notNull(),
  label: text('label').notNull(),
  type: text('type').notNull(), // the data type: text, number, select ...
  productType: text('productType').notNull().default(''),
  description: text('description').notNull().default(''),
  required: boolean('required').notNull().default(false),
  listed: boolean('listed').notNull().default(true),
  filterable: boolean('filterable').notNull().default(false),
  options: jsonb('options').notNull().default([]),
  owner: text('owner').notNull().default(''),
  position: integer('position').notNull().default(0),
  created: timestamp('created').notNull(),
}, table => [uniqueIndex('kempoProductFieldKeyIdx').on(table.productType, table.key)]);

/*
  A choice the buyer makes. `choices` is [{ key, label, price, available, position }]. Whether
  `price` adjusts the base price or replaces it is `priceType`; see pricing.js.
*/
export const kempoProductOption = pgTable('kempoProductOption', {
  id: text('id').primaryKey(),
  productId: text('productId').notNull(),
  key: text('key').notNull(),
  label: text('label').notNull(),
  required: boolean('required').notNull().default(true),
  priceType: text('priceType').notNull().default('adjust'), // adjust | replace
  position: integer('position').notNull().default(0),
  choices: jsonb('choices').notNull().default([]),
}, table => [uniqueIndex('kempoProductOptionKeyIdx').on(table.productId, table.key)]);

/*
  The ledger: one row for every change to a product's quantity, whoever made it (a person, a sale, a
  count, an extension). `change` is how much was added (negative: taken) and `quantity` what was left
  afterwards, so the ledger can be read on its own. A product with unlimited quantity has no rows.

  `ref` is the caller's own reference for one entry, which may touch several products (one row each).
  A ref is used once per product, so a retry can never change the quantity twice. `undoes` is the ref
  of an earlier entry this one puts back, which the extension that maintains a product's quantity uses
  to return exactly what it took. `name` is kept so a row still reads correctly after its product is gone.
*/
export const kempoProductLedger = pgTable('kempoProductLedger', {
  id: text('id').primaryKey(),
  ref: text('ref').notNull().default(''),
  productId: text('productId').notNull(),
  name: text('name').notNull().default(''),
  change: integer('change').notNull(),
  quantity: integer('quantity').notNull(),
  reason: text('reason').notNull().default(''),
  note: text('note').notNull().default(''),
  actor: text('actor').notNull().default(''), // the extension that made the change, or '' for a person
  userId: text('userId').notNull().default(''),
  undoes: text('undoes').notNull().default(''),
  created: timestamp('created').notNull(),
}, table => [
  uniqueIndex('kempoProductLedgerRefIdx').on(table.ref, table.productId).where(sql`${table.ref} <> ''`),
  index('kempoProductLedgerProductIdx').on(table.productId, table.created),
]);
