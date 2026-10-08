# kempo-products

A product catalog for [kempo](https://github.com/dustinpoissant/kempo). Show what you sell or have on offer, let people browse, filter and search it, and add a way to buy later.

It works on its own. A dealership can list its cars with no checkout at all, and a shop can add `kempo-commerce` later to sell the same catalog online. Nothing here depends on kempo-inventory; the [kempo-products-inventory](https://github.com/dustinpoissant/kempo-products-inventory) connector joins the two when you use both.

> Status: pre-release. See [PLAN.md](PLAN.md) for the design and what is still to come.

**Documentation: <https://dustinpoissant.github.io/kempo-products/>**. It covers building a catalog, putting products on your pages, purchases and stock, import and export, using it with inventory, and building on it. This README is the short version.

## Install

```bash
npm install kempo-products
```

Then install it from **Admin > Extensions**. A **Products** entry appears in the admin menu, and the catalog is public at `/products/`.

## Product types and fields

A product has only what every catalog needs: a name, an address (its slug), a description, a status, a price, stock, pictures and tags. Everything else is up to you, and it needs no code.

Under **Products > Types** make a type, such as "Vehicle" or "Model car". Under **Products > Fields** give it fields: a "Scale" (a choice of 1:18 or 1:24), a "Year" (a number), a "Mileage". A field applies to every product or to one type, and a product only shows the fields of its type. Field kinds are short text, long text, number, yes/no, date, colour, rating, choice list, and images (when kempo-media is installed).

A field can be marked **filterable**, which gives visitors a drop-down for it on the public list.

## Products

A product's **status** is `draft`, `published` or `archived`; only published products are public. Its **availability** is `available`, `pending` or `sold`, for things like a dealership's "sale pending". Neither needs a count.

**Price** is optional. A product with no price shows its **price label** instead ("Call for price"). Turn off the `prices_visible` setting to run a catalog that never shows what things cost.

**Stock** is a number, or blank for unlimited, which is the default. A catalog that never counts anything never shows "out of stock". When a product is bought its stock goes down; at zero it shows as out of stock.

## Options and prices

Options are the choices a buyer makes: colour, clear coat, size. Each choice carries a price, and **by default that price is relative to the product's base price**:

| Base price | Choice | Result |
|---|---|---|
| $49.99 | No clear coat, `-1.00` | $48.99 |
| $49.99 | Gold paint, `+2.50` | $52.49 |
| $49.99 | Red paint, `0.00` | $49.99 |

You set one base price and adjust from it, instead of typing a full price for every combination. An option can instead be set to **replace the base price**, so each of its choices is a full price (how most shops price sizes). Only one option per product can replace the base price, and adjustments from the others still apply on top. A price never goes below zero.

A choice can be marked sold out, and it is then shown as unavailable and cannot be bought.

### Choosing options is in the address

Choosing an option writes it into the address (`/products/camaro/?color=red&clear-coat=no`), so a refresh or a shared link brings the same choices back. The name is the option's key and the value the choice's key. A choice that does not exist, or is sold out, is ignored.

The price on the page is asked of the server every time the choices change, so it is always the number that would be charged. **Never trust a price from a browser**: the server computes it (`getPrice`), and that is what anything that charges money should use.

## Images

If [kempo-media](https://github.com/dustinpoissant/kempo-media) is installed and enabled, the product form lets you upload pictures; the first is the primary one shown in lists. Without it the field is simply not shown and pages show no picture.

## The public pages

`/products/` is the list, with search, a type filter, filters for any filterable field, sorting and paging. What is searched and filtered is in the address (`?q=camaro&type=model-car&sort=price-asc&f.scale=1:18`), so a filtered list can be shared. `/products/<slug>/` is a product.

Both pages are made of Lit components you can use on your own pages, such as a few featured products on the home page:

```html
<script type="module" src="/products/components/ProductList.js"></script>
<k-prod-list tag="featured" limit="4" hide-controls no-url></k-prod-list>

<script type="module" src="/products/components/ProductDetail.js"></script>
<k-prod-detail slug="1969-camaro"></k-prod-detail>
```

`<k-prod-list>` can be limited to a type, a tag, hand-picked slugs, what is in stock, or a field's value, and can start sorted or searched. **[The components guide](https://dustinpoissant.github.io/kempo-products/components.html)** lists every attribute with recipes.

A site can override the pages themselves with its own, and extensions can add to them through two named fragments, `products-list-extra` and `products-detail-extra`.

A product's slug cannot be `api`, `components`, `vendor`, `sdk`, `index`, `admin`, `new` or `edit`, because those are this extension's own addresses.

## Import and export

**Export** on the products page downloads the catalog as a spreadsheet (`.csv`) or as everything (`.json`). **Import** reads either back, which is also how you move a catalog in from another shop's spreadsheet.

A spreadsheet has one row per product. Only `name` is required:

| Column | Holds |
|---|---|
| `slug` | The product's address. Made from the name when empty, so importing the same file twice never duplicates |
| `name`, `description`, `tags` | Text; tags are comma separated |
| `type` | A type's name or key. The type must exist already |
| `status`, `availability` | As in the admin (`published`, `sold`, ...) |
| `price`, `price_label` | A decimal such as `49.99`; the label shows when there is no price |
| `stock` | A whole number, or empty for unlimited |
| `options` | The product's options as JSON (what Export writes) |
| `field.<key>` | One column per custom field, e.g. `field.scale` |

An **empty cell leaves what a product already has unchanged** (and uses the default for a new one), so a file with just `slug` and `price` columns updates prices and nothing else. Choose **Update it from the file** to change products that are already there; the default leaves them alone. A row that cannot be read is reported with its line number and the rest carry on, and the dialog shows what will happen before anything is changed.

The JSON export also carries the types and fields, and importing it creates any the site lacks. Images are not exported, because a media id means nothing on another site. Names that a spreadsheet would run as a formula (starting with `=`, `+`, `-` or `@`) are written with a leading apostrophe so they open as text, and the apostrophe is removed again on import.

## Recording purchases

This extension does not take orders. Whoever does, whether that is `kempo-commerce`, the admin form (for sales made on Etsy or in person), or another extension, calls `recordPurchase`:

```javascript
import { recordPurchase, reversePurchase } from 'kempo-products/sdk';

const [error, purchase] = await recordPurchase({
  ref: 'order-1042',
  lines: [{ productId, quantity: 1, options: { color: 'red' } }],
});
```

- `ref` is the caller's own reference. Recording the same one twice is refused, so a retry can never take stock twice, and it is how a purchase is found later.
- Every line is checked (the product is published, in stock, priced, and the options are real and available) and priced here from the catalog.
- Stock for **all** the lines is taken in one transaction: every line or none.
- Then `kempo-products:purchase:recorded` fires with the purchase, and that is how other extensions react.

`reversePurchase(ref)` puts finite stock back once and fires `kempo-products:purchase:reversed`. A person recording a sale made elsewhere (the admin **Purchases** page) may give a unit price for a product that has none.

## Building on this extension

Declare the dependency in your `kempo-config.json`, and subscribe to what you need:

```json
{
  "dependencies": ["kempo-products"],
  "hooks": { "kempo-products:purchase:recorded": "./hooks/purchase-recorded.js" }
}
```

### Server SDK

```javascript
import { getProducts, createProduct, setStock, recordPurchase } from 'kempo-products/sdk';
```

Every function resolves to `[error, result]`, where `error` is `{ code, msg }` or `null`.

| Function | Purpose |
|---|---|
| `getProducts({ q, type, status, availability, tag, filters, ids, owner, inStock, sort, limit, offset })` | List and search. Returns `{ items, total }` |
| `getProduct(idOrSlug)` | One product with its options |
| `createProduct(data, { owner })`, `updateProduct(id, data, { owner })`, `deleteProduct(id, { owner })` | Manage products. `owner` makes them your extension's |
| `getPrice(productId, selections)` | The server's price for `{ optionKey: choiceKey }`: `{ unit, base, lines, currency }` |
| `recordPurchase({ ref, lines, userId }, { manual })`, `reversePurchase(ref)`, `getPurchase(ref)`, `getPurchases()` | See above |
| `setStock(id, stock, { actor })`, `adjustStock(id, delta, { actor })` | Change stock; `-1` is unlimited. Atomic, never below zero |
| `setManagedBy(id, extension)` | Declare that your extension keeps this product's stock and choice availability in step with something else. People then see them read-only |
| `setChoiceAvailability(id, optionKey, choiceKey, available, { actor })` | Mark one choice in or out of stock |
| `getTypes`, `registerType(owner, { name })`, `unregisterTypes(owner)` | Product types |
| `getFields`, `registerField(owner, definition)`, `registerFields`, `unregisterFields(owner)` | Fields; `definition.productType` scopes one to a type |
| `unregisterProducts(owner, { release })` | For uninstall: delete what you own, or hand it back to people |
| `buildExport({ format })`, `importFile(text, { onMatch, dryRun })` | Export the catalog as a `{ filename, contentType, body }`; import the text of a `.csv` or `.json` |

An extension can ship its own type and fields, so a "vehicles" extension arrives with a ready-made Vehicle type:

```javascript
// install.js
import { registerType, registerFields } from 'kempo-products/sdk';

export default async () => {
  await registerType('my-vehicles', { name: 'Vehicle' });
  await registerFields('my-vehicles', [
    { key: 'make', label: 'Make', type: 'text', productType: 'vehicle' },
    { key: 'year', label: 'Year', type: 'number', productType: 'vehicle' },
  ]);
};
```

### Ownership

Types, fields and products can each belong to an extension. The owner alone can delete them or change what defines them; people can still edit everything else, so an extension's products stay useful in the admin.

| | Only the owner can | Anyone with the permission can still |
|---|---|---|
| **Product** | change its slug, name and type, delete it | edit description, price, options, tags, images, field values and stock |
| **Type** | rename it, delete it | change its description and position |
| **Field** | delete it; change its key, kind, requirement or choices | rename it, change its help text and whether it is listed or filterable |

Ownership only comes from the server SDK; the HTTP routes never read an owner from a request.

### Hooks

Declare them in your `kempo-config.json` `hooks`. Every payload carries `actor`: the extension that made the change, or `''` for a person.

**Guards** run before the work. Edit the payload object in place to change what is saved, or `throw { code, msg }` to refuse; the caller receives exactly that.

| Event | Payload |
|---|---|
| `kempo-products:product:before_create` | `{ draft, userId }` (editable) |
| `kempo-products:product:before_update` | `{ product, changes, userId }` (editable) |
| `kempo-products:product:before_delete` | `{ product, userId }` |
| `kempo-products:type:before_create`, `before_update`, `before_delete` | refuse only |
| `kempo-products:field:before_create`, `before_update`, `before_delete` | refuse only |

**Notifications** run after the change is committed; nothing they do can undo it.

| Event | Payload |
|---|---|
| `kempo-products:product:created`, `updated`, `deleted` | `{ product, previous?, userId }` |
| `kempo-products:product:stock_changed` | `{ product, previousStock, stock, reason }` |
| `kempo-products:purchase:recorded` | `{ purchase }` |
| `kempo-products:purchase:reversed` | `{ purchase }` |
| `kempo-products:type:created`, `updated`, `deleted` | `{ type, previous? }` |
| `kempo-products:field:created`, `updated`, `deleted` | `{ field, previous? }` |

### Adding to the admin form

The product form has a `panels` slot above its Save button. An extension supplies a panel by shipping a fragment named `products-admin-product-panels` in its own `admin/` directory (`admin/products-admin-product-panels.fragment.html`). The form fires `draft-change` as it is edited and `product-saved` when the product is stored; a panel with more to save calls `event.detail.waitUntil(promise)` and the page waits.

## Permissions, groups and settings

| Permission | Allows |
|---|---|
| `products:read` | See drafts and archived products, exact stock and purchases in the admin |
| `products:create`, `products:update`, `products:delete` | Manage products |
| `products:types:manage` | Create, edit and delete types and fields |
| `products:purchases:record` | Record a purchase made elsewhere, and reverse one |

Published products need no permission to see. Three groups are provided: `kempo-products:viewer`, `kempo-products:manager` (manage products and record purchases) and `kempo-products:admin` (also types and fields).

| Setting | Default | Meaning |
|---|---|---|
| `currency` | `usd` | The currency code prices are shown in |
| `prices_visible` | `true` | Show prices to visitors |
| `page_size` | `24` | Products per page on the public list |

## API

JSON routes under `/products/api/`. Reads are public (published products only, no exact stock, and no prices when `prices_visible` is off); everything that changes something needs the permission above.

| Route | Purpose |
|---|---|
| `GET config` | Currency, whether prices are shown, whether images are available, and the allowed values |
| `GET products`, `GET products/<id or slug>` | List (`q`, `type`, `status`, `availability`, `tag`, `filters`, `sort`, `inStock`, `limit`, `offset`) and read |
| `POST products`, `PATCH products/<id>`, `DELETE products/<id>` | Manage products |
| `GET price?product=&options=` | The server's price for a set of choices |
| `GET types`, `GET fields`, and `POST`/`PATCH`/`DELETE` on them | Types and fields |
| `GET purchases`, `POST purchases`, `POST purchases/<ref>/reverse` | Purchases |
| `GET export?format=csv\|json`, `POST import` | Download the catalog; import a file (`{ content, onMatch, dryRun }`) |

Money is always a whole number of the smallest unit: `4999` is $49.99. Currencies without cents (yen) and with three decimals (dinar) are handled.

## Development

The documentation site is built from `docs-src/` into `docs/`, which GitHub Pages serves (set Pages to deploy from the `docs` folder of the default branch). Edit `docs-src`, run `npm run docs:build`, and commit both. A test fails when `docs/` is not what `docs-src/` builds.

```bash
npm run link:local          # symlinks the sibling kempo checkouts
docker compose up -d        # a throwaway Postgres on port 5443
DATABASE_URL=postgresql://kempo:kempo@localhost:5443/kempo_products_test npx drizzle-kit push --force
DATABASE_URL=postgresql://kempo:kempo@localhost:5443/kempo_products_test npm test
```

The database tests skip themselves when no database is reachable, and refuse to run unless its name ends in `_test`, because they empty the tables. **A green run with `SKIPPED` did not test the database.**
