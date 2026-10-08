import { pgTable, text, timestamp, integer, boolean, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';

/*
  A product has only the columns every catalog needs. Everything else lives in `data`, keyed by the
  `key` of a kempoProductField row, so fields can be added and removed without touching the schema.
  Money is an integer in the currency's smallest unit; `price` is null when a product has none.
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
  priceLabel: text('priceLabel').notNull().default(''), // shown when there is no price, e.g. "Call for price"
  stock: integer('stock').notNull().default(-1), // -1 = unlimited
  managedBy: text('managedBy').notNull().default(''), // '' = people; otherwise the extension that maintains stock and choice availability
  images: jsonb('images').notNull().default([]), // kempo-media ids, in order; empty without kempo-media
  tags: jsonb('tags').notNull().default([]),
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
  A record that something was purchased. `ref` is supplied by whoever took the order, so recording
  the same one twice is refused (a retry can never take stock twice) and it can be reversed later.
  `lines` is a snapshot, so it still reads correctly after the product changes or is deleted.
*/
export const kempoProductPurchase = pgTable('kempoProductPurchase', {
  id: text('id').primaryKey(),
  ref: text('ref').notNull(),
  lines: jsonb('lines').notNull().default([]),
  total: integer('total').notNull().default(0),
  currency: text('currency').notNull().default('usd'),
  userId: text('userId').notNull().default(''),
  status: text('status').notNull().default('recorded'), // recorded | reversed
  created: timestamp('created').notNull(),
  updated: timestamp('updated').notNull(),
}, table => [uniqueIndex('kempoProductPurchaseRefIdx').on(table.ref)]);
