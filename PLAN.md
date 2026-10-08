# kempo-products: plan

Status: **design, nothing built.** Each decision is marked **Agreed** (settled with the maintainer), **Proposed** (a recommendation not yet confirmed) or **Unverified** (depends on a kempo behaviour not yet checked in code). Resolve the Open questions at the end before building.

## 1. Purpose

A product catalog extension for kempo. It lists things, lets people browse, filter and search, and does not require that anything can be bought. **Agreed.**

Two real uses drive it, and both must work from the admin with no developer:

- **A dealership-style catalog.** Cars with make, model, year and mileage; no online purchase.
- **A small maker's shop.** Model cars, keychains and similar, sold today on Etsy and a separate site, later through kempo-commerce.

The wider goal is WordPress on Node: a non-developer installs extensions until the site does about 90% of what they want. Test every decision with "could a non-developer set this up from the admin alone?"

### Non-goals

- No cart, orders, checkout, payments, tax or shipping. Those are kempo-commerce and its siblings.
- No knowledge of kempo-inventory, and no raw-material stock, recipes or deduction. A separate connector extension owns that (section 9). **Agreed.**
- No contact or inquiry forms. A future contact-form extension, and a connector to this one, can add that. **Agreed.**
- No copy of another platform's data model.

## 2. Where it sits

**Agreed:** the catalog is its own extension, and kempo-commerce depends on it. Products and inventory do not depend on each other; a separate connector requires both.

```
kempo-inventory           raw materials and stock (exists)
kempo-products            this: the catalog, standalone
kempo-products-inventory  connector: needs both; owns the mapping
kempo-commerce            cart, orders, checkout; needs products
```

This amends the kempo-commerce board item: "simple products/categories/pricing" moves here, and the variants and bundles items depend on kempo-products.

## 3. Data model

Money is integer minor units, as in kempo-payments. Text is trimmed on write. Ids are text. Tables are `kempoProduct*`. **Proposed**, except where marked.

### `kempoProduct`

| Column | Notes |
|---|---|
| `id` | text primary key |
| `slug` | unique, used in the public URL; reserved words are refused (section 6) |
| `name` | required |
| `typeId` | the product type; `''` for untyped |
| `description` | long text |
| `status` | `draft`, `published` or `archived`. Only `published` is public |
| `availability` | `available`, `pending`, `sold`. A manual status for things like a dealership's "sale pending" |
| `price` | integer or null. Null shows `priceLabel` instead |
| `priceLabel` | text shown when price is null, e.g. "Call for price" |
| `stock` | integer, `-1` = unlimited (the default). **Agreed** |
| `managedBy` | `''` for people, or the extension that maintains `stock` and option availability. The admin shows those read-only with the extension's name, so an admin edit is not silently overwritten |
| `images` | jsonb array of media ids. Optional integration, see section 10 |
| `tags` | jsonb array of short lower-case labels |
| `data` | jsonb of type-field values, keyed by field key |
| `owner` | `''` for admin-managed, or the extension that created it |
| `created`, `updated`, `publishedAt` | timestamps |

A product is **purchasable** when it is `published`, `availability` is `available`, `stock` is not `0`, and it has a price. The effective state shown publicly is derived from those, not stored.

### `kempoProductType`

`id`, `key`, `name`, `description`, `owner`, `position`, `created`. A type is "Vehicle" or "Model car". Its key is fixed after creation.

### `kempoProductField`

`id`, `key`, `label`, `type`, `typeId` (`''` for every product, otherwise one type), `required`, `listed`, `filterable`, `options`, `owner`, `position`, `created`. Unique on `(typeId, key)`. This is a copy of the pattern in kempo-inventory's category-scoped fields; extracting a shared package waits for a third consumer. **Agreed.** Field types for v1: `text`, `longtext`, `number`, `boolean`, `date`, `select`, `color`, and `media` when kempo-media is present.

### `kempoProductOption`

A choice the buyer makes, like Etsy's variations: `id`, `productId`, `key`, `label`, `required`, `priceType`, `position`, and `choices`, a jsonb array of `{ key, label, price, available, position }`.

**Agreed: option prices are relative by default.** A product has one base price, and a choice carries a signed amount from it, not a full price. `priceType` is a per-option select:

- `adjust` (default): the choice's `price` is added to the product price. `-100` takes a dollar off, `0` changes nothing.
- `replace`: the choice's `price` is the price, replacing the base (how Etsy and WooCommerce work).

Example: a $49.99 model car with a "Clear coat" option whose "No clear coat" choice is `-100` costs $48.99.

Price is computed by one rule, in one function: start with the base price. If the product has a `replace` option, the chosen choice's price replaces the base. Then add every `adjust` option's chosen amount. **At most one `replace` option per product**, enforced on save, so the result is never ambiguous. The total can't go below zero.

### `kempoProductPurchase`

A record that something was purchased, so recording is idempotent and reversible: `id`, `ref` (unique, supplied by the caller), `lines` (jsonb snapshot: product id, name, quantity, unit price, chosen options with labels), `total`, `userId`, `status` (`recorded`, `reversed`), `created`, `updated`.

## 4. Ownership (Proposed)

Copy kempo-inventory's model: types, fields and products can each have an `owner`. The owner alone can delete or redefine what it created; people can still edit everything else. Owner only comes from SDK options, never an HTTP body. A future "vehicles" extension can ship a ready-made Vehicle type.

## 5. Admin (Proposed)

Admin pages live in `admin/` and are served at `/admin/extension/kempo-products/**`, with an entry pushed into `admin-nav-extensions` from `admin/nav.global.html`, exactly as kempo-blog does. **Verified in kempo-blog.**

- **Products**: list with search and type and status filters; create and edit with the fields of the chosen type, swapping when the type changes; an option editor for choices with a signed price input ("+1.00", "-1.00", "0.00") and a price-type select; stock input (blank or `-1` for unlimited); images when kempo-media is present.
- **Types** and **Fields**: create, edit, delete when unused.
- **Record a purchase**: a form for sales made elsewhere (Etsy, in person).
- Components are prefixed `k-prod-`. UI follows the kempo AGENTS.md: kempo-css utilities, `<k-icon>`, no custom CSS.

## 6. Public side

`"public-scope": "products"` serves `public/` at `/products/**`. **Verified** in kempo's extensions spec and kempo-blog: `.page.html` files render server-side, `GET.js`/`POST.js` handlers run with `(request, response)`, and a `[param]` directory injects `request.params`.

- `public/index.page.html` is the list with search and filters, `public/[slug]/index.page.html` the detail page, `public/api/**` the JSON API, `public/components/` the web components. The site owner can override the pages with fragments and templates, as kempo-blog's header and comments are fragments.
- **Reserved slugs:** a product slug cannot be `api`, `components` or any other top-level name in `public/`, or the product would be unreachable. **Proposed.**
- The detail page carries a named `<location>` for extension content (a future contact form, a stock badge). It is a location only; no form is built here.

### Choosing options is a URL parameter (Agreed)

Selecting an option updates the query string, so `?color=blue` on a product page selects blue, and a refresh or shared link restores it. The parameter name is the option `key` and the value the choice `key`. A value that doesn't exist or isn't available is ignored. The component reads the URL on load and writes it back with `history.replaceState`. The displayed price updates from the selection, but **price is only ever trusted from the server**: see `getPrice` below.

## 7. Server SDK (Proposed)

All functions resolve to `[error, result]` with `error` as `{ code, msg }` or `null`. Server code is HTTP-agnostic.

| Function | Purpose |
|---|---|
| `getProducts({ q, filters, typeKey, status, ids, owner, limit, offset })` | List and search. Returns `{ items, total }` |
| `getProduct(idOrSlug)` | One product, with its options |
| `createProduct(data, { owner })`, `updateProduct(id, data, { owner })`, `deleteProduct(id, { owner })` | Manage products |
| `getPrice(productId, selections)` | `{ unit, breakdown }` for `{ optionKey: choiceKey }`, validating required options and availability. **Commerce must use this and never accept a price from a client** |
| `setStock(productId, stock, { actor })`, `adjustStock(productId, delta, { actor })` | Change stock; `-1` is unlimited. `actor` is the extension making the change |
| `setManagedBy(productId, extensionName)` | Declare that an extension maintains this product's stock and option availability |
| `setChoiceAvailability(productId, optionKey, choiceKey, available, { actor })` | Mark one option choice in or out of stock, e.g. a paint colour |
| `getTypes`, `registerType`, `unregisterTypes`, `getFields`, `registerField`, `registerFields`, `unregisterFields`, `unregisterProducts(owner, { release })` | As kempo-inventory |
| `recordPurchase({ ref, lines, userId })`, `reversePurchase(ref)` | Section 8 |

The stock functions are what lets the connector (or any extension) correct the stock of products other than the one just bought.

## 8. Purchases and hooks (Agreed shape, Proposed detail)

Products doesn't take orders. Whoever does (kempo-commerce, the admin "Record a purchase" form, an extension) calls `recordPurchase({ ref, lines })`, and products:

1. Refuses a duplicate `ref` (so a retry can't double-decrement).
2. Validates every line: the product is purchasable, selections are valid and available, quantity doesn't exceed `stock`.
3. Computes each unit price with the same function as `getPrice`.
4. Decrements the stock of every finite-stock product **in one transaction, all or nothing**.
5. Stores the purchase row, then fires `kempo-products:purchase:recorded` with `{ purchase }`.

`reversePurchase(ref)` restores finite stock, marks the row `reversed` and fires `kempo-products:purchase:reversed`.

Extensions react in handlers; the handler receives the whole purchase. Products doesn't know or care what they do. This is how the inventory connector decrements materials.

Hook names are `kempo-products:<resource>:<event>`. Guards (`product:before_create|update|delete`, `type:*`, `field:*`) follow kempo-inventory's pattern: edit the draft in place or throw `{ code, msg }` to refuse; everything is validated after guards run. Notifications (`product:created|updated|deleted`, `product:stock_changed`, `purchase:recorded`, `purchase:reversed`) run after commit and can't undo it. Every payload carries `actor`.

Notifications can't refuse a purchase. A handler that fails is logged and the purchase stands; the connector reconciles by recalculating (see its plan).

**Unverified:** kempo's `triggerHook` awaits handlers in registration order. The guard wrapper that turns a thrown `{ code, msg }` into a refusal is kempo-inventory's own (`server/utils/hooks.js`); products needs its own copy.

## 9. The inventory connector

Not this repo's concern beyond the interface above. It lives in `kempo-products-inventory`, which has its own plan. It uses: `purchase:recorded` and `purchase:reversed`, `setStock`, `setManagedBy` and `setChoiceAvailability`.

## 10. Optional integration: kempo-media

Products knows about kempo-media and uses it for images when present. **Agreed.** When it isn't installed and enabled, the `images` field is not shown in the admin, `images` stays empty in the database, and public pages show no image. It never imports kempo-media up front.

The pattern is kempo-inventory's `server/utils/media.js`: ask `getExtension({ name })` from `kempo/server/sdk.js` whether it is enabled, then load the SDK with a dynamic `import()` that is allowed to fail. `kempo-media` goes in `peerDependencies` with `peerDependenciesMeta: { optional: true }`. **Verified in kempo-inventory.**

## 11. Permissions, groups and settings

Following kempo-blog (**verified**): permission names are unprefixed `resource:action`, groups are prefixed `kempo-products:<role>`, and settings are declared in `kempo-config.json` with a `name`, `value`, `type` (`string`, `number` or `boolean`) and `description`. Admin groups also grant `system:admin:access`, as kempo-inventory's do.

Permissions: `products:read` (see drafts and admin lists), `products:create`, `products:update`, `products:delete`, `products:types:manage`, `products:purchases:record`. Published products need no permission to view.

Groups: `kempo-products:viewer`, `kempo-products:manager` (create, update, delete, record purchases), `kempo-products:admin` (also types and fields).

Settings: `currency` (string, `usd`), `prices_visible` (boolean, true), `page_size` (number, 24).

## 12. Platform dependencies

- kempo >= 4.3.0 and kempo-server >= 3.4.0, as in the peer dependencies.
- The connector pushing a panel into this extension's admin product page uses the same `*.global.html` location mechanism that `admin-nav-extensions` uses. **Unverified** that a named location inside a product page is supported; check before phase 1 admin work, and add the location (e.g. `products-admin-product-panels`) either way.
- Tracked elsewhere: installing missing dependencies when installing a dependent extension. The connector needs it for a good experience; until then it lists both packages as npm `dependencies`.

## 13. Build phases

0. **Scaffold.** Done.
1. **Core catalog:** schema, types, fields, products, ownership, SDK, guard and notification hooks, admin CRUD, permissions and groups, settings, lifecycle scripts. Pure-logic unit tests.
2. **Public pages:** list, detail, search, filters, the location, overridable markup.
3. **Options and pricing:** option editor, `getPrice`, URL-parameter selection.
4. **Stock and purchases:** the stock functions, `recordPurchase`, `reversePurchase`, the admin form.
5. **Media:** optional kempo-media images.
6. **Import and export:** CSV and kempo's export format, as inventory.

## 14. Tests

kempo-testing-framework, as the sibling extensions. Pure logic is unit tested without a server: field coercion, ownership rules, slug rules, the price computation, purchase validation and the all-or-nothing stock decrement. A DB-backed suite against Postgres skips itself when none is reachable, so CI starts a Postgres service so it actually runs; copy the workflows from kempo-user-dirs when the first code lands. Browser checks on the live demo for admin and public pages.

## 15. Release

`package.json` is `private: true` at `0.0.0` until the first release; remove `private` then. Publishing follows the sibling extensions: npm trusted publishing from CI, a patch bump on push, and a choice of bump only on a manual run.

## 16. Open questions

1. **Is one `managedBy` column right?** It covers both stock and option availability for a product. The alternative is one per concern. Recommendation: one.
2. **Priceless purchases.** A product with no price can't be purchased through `recordPurchase`. Etsy-style manual records for a "call for price" item would need a price on the line. Recommendation: let a manual record supply the unit price, and have commerce never do so.
3. **Default stock.** `-1` (unlimited) for new products, so a catalog with no inventory interest never shows "out of stock". Recommendation: yes.
4. **Quantity on a line with options.** Stock is per product, not per choice. A choice can only be marked unavailable (by the connector or by hand). Recommendation: keep it that way until a real case needs per-choice counts.
5. **Reserved slugs.** The list is derived from the contents of `public/`; confirm.
