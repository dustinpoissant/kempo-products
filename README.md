# kempo-products

A product catalog for [kempo](https://github.com/dustinpoissant/kempo). Show what you sell or have on offer, let people browse, filter and search it, and add a way to buy later.

It works on its own. A dealership can list its cars with no checkout at all, and a shop can add `kempo-commerce` later to sell the same catalog online. Nothing here depends on kempo-inventory; the [kempo-products-inventory](https://github.com/dustinpoissant/kempo-products-inventory) connector joins the two when you use both.

> Status: pre-release. See [PLAN.md](PLAN.md) for the design and what is still to come.

**Documentation: <https://dustinpoissant.github.io/kempo-products/>**. It covers building a catalog, putting products on your pages, quantity and the ledger, import and export, using it with inventory, and building on it. This README is the short version.

## Install

```bash
npm install kempo-products
```

Then install it from **Admin > Extensions**. A **Products** entry appears in the admin menu, and the catalog is public at `/products/`.

## Product types and fields

A product has only what every catalog needs: a name, an address (its slug), a description, a status, a price, quantity, pictures and tags. Everything else is up to you, and it needs no code.

Under **Products > Types** make a type, such as "Vehicle" or "Model car". Under **Products > Fields** give it fields: a "Scale" (a choice of 1:18 or 1:24), a "Year" (a number), a "Mileage". A field applies to every product or to one type, and a product only shows the fields of its type. Field kinds are short text, long text, number, yes/no, date, colour, rating, choice list, and images (when kempo-media is installed).

A field can be marked **filterable**, which gives visitors a drop-down for it on the public list.

## Products

A product's **status** is `draft`, `published` or `archived`; only published products are public. Its **availability** is `available`, `pending` or `sold`, for things like a dealership's "sale pending". Neither needs a count.

**Price** is optional. A product with no price shows its **price label** instead ("Call for price"). Turn off the `prices_visible` setting to run a catalog that never shows what things cost.

**Quantity** is a number, or blank for unlimited, which is the default. A catalog that never counts anything never shows "out of stock". When a product is bought its quantity goes down; at zero it shows as out of stock.

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

If [kempo-media](https://github.com/dustinpoissant/kempo-media) is installed and enabled, the product form lets you upload pictures; the first is the primary one shown in lists. Lists and cards load the small thumbnail (kempo-media gets it from kempo-thumbs) and use the full image only while the thumbnail is still being made. Without it the field is simply not shown and pages show no picture.

## The public pages

`/products/` is the list, with search, a type filter, filters for any filterable field, sorting and paging. What is searched and filtered is in the address (`?q=camaro&type=model-car&sort=price-asc&f.scale=1:18`), so a filtered list can be shared. `/products/<slug>/` is a product.

Both pages are made of Lit components you can use on your own pages, such as a few featured products on the home page:

```html
<script type="module" src="/products/components/ProductList.js"></script>
<k-products-list tag="featured" limit="4" hide-controls no-url></k-products-list>

<script type="module" src="/products/components/ProductDetail.js"></script>
<k-products-detail slug="1969-camaro"></k-products-detail>
```

`<k-products-list>` can be limited to a type, a tag, hand-picked slugs, what is in stock, or a field's value, and can start sorted or searched. **[The components guide](https://dustinpoissant.github.io/kempo-products/components.html)** lists every attribute with recipes.

A site can override the pages themselves with its own. Extensions add to them by composition (see below), and through two named fragments, `products-list-extra` and `products-detail-extra`.

**Categories.** A product is of one **type** (which decides its fields) and can be in any number of **categories**, which are how shoppers browse. Manage them under **Admin → Products → Product Categories**, then tick them on a product's **Details** tab, when creating or editing it. A category has a name, a description and a key made from the name (`model-cars`); the key never changes, since it is in addresses like `/products/?category=model-cars`. Deleting a category takes it off its products and leaves them. `/categories/` lists the categories that have published products, with how many, and `<k-products-list category="model-cars">` (or `?category=` in the address) shows one. Categories travel in a CSV (`categories`, by key or name) and a JSON export (with the categories themselves); the server SDK has `getCategories`, `createCategory`, `updateCategory` and `deleteCategory`, and a product has `categories`, a list of keys.

**Two addresses.** This extension answers on two scopes (`"public-scopes"` in its `kempo-config.json`): `/products/`, from `public/`, and `/categories/`, from `public-categories/`. `/categories/` lists the product categories (see above). Kempo refuses to install or enable this extension beside another that claims `/products` or `/categories`.

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
| `quantity` | A whole number, or empty for unlimited |
| `options` | The product's options as JSON (what Export writes) |
| `field.<key>` | One column per custom field, e.g. `field.scale` |

An **empty cell leaves what a product already has unchanged** (and uses the default for a new one), so a file with just `slug` and `price` columns updates prices and nothing else. Choose **Update it from the file** to change products that are already there; the default leaves them alone. A row that cannot be read is reported with its line number and the rest carry on, and the dialog shows what will happen before anything is changed.

The JSON export also carries the types and fields, and importing it creates any the site lacks. Images are not exported, because a media id means nothing on another site. Names that a spreadsheet would run as a formula (starting with `=`, `+`, `-` or `@`) are written with a leading apostrophe so they open as text, and the apostrophe is removed again on import.

## The ledger

Every change to a product's quantity is written to the **ledger**: who changed it, by how much, why, and what was left. Open it from the **Ledger** button on the Products page. There you can add stock to a product or take it away (a delivery, a count, a sale made somewhere else), and read what has happened.

This extension does not take orders, hold stock for a payment, give credits or reverse anything. Whoever does (`kempo-commerce`, a supplier feed, you) adds an entry to the ledger:

```javascript
import { addLedgerEntry } from 'kempo-products/sdk';

const [error, entry] = await addLedgerEntry({
  ref: 'order-1042',
  reason: 'sale',
  lines: [{ productId, change: -1 }],
});
```

- A line's `change` is how much to add; negative takes. A sale takes, a return adds back (`undoes: 'order-1042'` says which entry it puts back).
- **All the lines or none**: if any product has too little, nothing changes and the error names it (409). Quantity never goes below zero.
- `ref` is the caller's own reference. Adding an entry with a `ref` that is already in the ledger changes nothing and returns the first one with `duplicate: true`, so a retry can never change the quantity twice. It is optional.
- A product with unlimited quantity (`-1`) is never changed and gets no row.
- `reason` (a short word) and `note` (free text) are shown on the ledger.
- Afterwards `kempo-products:ledger:added` fires with the entry, and `kempo-products:product:quantity_changed` for each product.

`getLedger({ productId, limit, offset })` reads it, newest first, and `getLedgerEntry(ref)` reads one entry. Setting a quantity (`setQuantity`), adjusting it (`adjustQuantity`), creating a product with a quantity and editing one in the admin all write to the ledger too, so it adds up. Rows keep the product's name, so they still read correctly after it is deleted.

## Building on this extension

Declare the dependency in your `kempo-config.json`, and subscribe to what you need:

```json
{
  "dependencies": ["kempo-products"],
  "hooks": { "kempo-products:ledger:added": "./hooks/ledger-added.js" }
}
```

### Server SDK

```javascript
import { getProducts, createProduct, setQuantity, addLedgerEntry } from 'kempo-products/sdk';
```

Every function resolves to `[error, result]`, where `error` is `{ code, msg }` or `null`.

| Function | Purpose |
|---|---|
| `getProducts({ q, type, status, availability, tag, filters, ids, owner, inStock, sort, limit, offset })` | List and search. Returns `{ items, total }` |
| `getProduct(idOrSlug)` | One product with its options |
| `createProduct(data, { owner })`, `updateProduct(id, data, { owner })`, `deleteProduct(id, { owner })` | Manage products. `owner` makes them your extension's |
| `getPrice(productId, selections)` | The server's price for `{ optionKey: choiceKey }`: `{ unit, base, lines, currency }` |
| `addLedgerEntry({ ref, lines, note, reason, undoes, actor })`, `getLedger({ productId })`, `getLedgerEntry(ref)` | Change quantity and record it; see above |
| `setQuantity(id, quantity, { actor, reason, note })`, `adjustQuantity(id, delta, { actor, reason, note })` | Change one product's quantity; `-1` is unlimited. Atomic, never below zero, and recorded in the ledger |
| `setManagedBy(id, extension)` | Declare that your extension keeps this product's quantity and choice availability in step with something else. People then see them read-only, and you answer its ledger entries (see Managed quantity) |
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
| **Product** | change its slug, name and type, delete it | edit description, price, options, tags, images, field values and quantity |
| **Type** | rename it, delete it | change its description and position |
| **Field** | delete it; change its key, kind, requirement or choices | rename it, change its help text and whether it is listed or filterable |

Ownership only comes from the server SDK; the HTTP routes never read an owner from a request.

### Managed quantity

An extension that keeps a product's quantity in step with something else (kempo-products-inventory makes it from raw materials) calls `setManagedBy(productId, 'my-extension')`. From then on:

- People and other extensions cannot change that product's quantity or its choices' availability; only calls made with `{ actor: 'my-extension' }` can.
- **The lock lasts only while that extension is installed and enabled.** Disable or uninstall it and its products are people's again, with no clean-up; enable it and they are its again. Products read from the catalog already say `managedBy: ''` when the manager is gone.
- **kempo-products never writes a managed product's quantity itself.** `addLedgerEntry` first asks the manager, with `kempo-products:ledger:before_add` (`{ ref, lines, products, reason, note, undoes, actor }`, where each line is `{ productId, name, change }`). The manager takes what the lines use (or puts back what `undoes` took) and **throws `{ code, msg }` when it cannot**, so the entry is refused with its message and a managed product can never be oversold. Products that are not managed change as usual, in the same all-or-nothing transaction.
- If the entry then fails (an unmanaged line was short), `kempo-products:ledger:add_failed` `{ ref }` tells the manager to undo what it did. A repeated `ref` is not a failure and does not fire it.
- The manager writes its own quantity with `setQuantity` or an entry with `actor: 'my-extension'`; that is its entry in the ledger.

### Hooks

Declare them in your `kempo-config.json` `hooks`. Every payload carries `actor`: the extension that made the change, or `''` for a person.

**Guards** run before the work. Edit the payload object in place to change what is saved, or `throw { code, msg }` to refuse; the caller receives exactly that.

| Event | Payload |
|---|---|
| `kempo-products:product:before_create` | `{ draft, userId }` (editable) |
| `kempo-products:product:before_update` | `{ product, changes, userId }` (editable) |
| `kempo-products:product:before_delete` | `{ product, userId }` |
| `kempo-products:ledger:before_add` | `{ ref, lines, products, reason, note, undoes, actor }`, refuse only. Answered by the extension that manages some of the `products` (see Managed quantity) |
| `kempo-products:type:before_create`, `before_update`, `before_delete` | refuse only |
| `kempo-products:field:before_create`, `before_update`, `before_delete` | refuse only |

**Notifications** run after the change is committed; nothing they do can undo it.

| Event | Payload |
|---|---|
| `kempo-products:product:created`, `updated`, `deleted` | `{ product, previous?, userId }` |
| `kempo-products:product:quantity_changed` | `{ product, previousQuantity, quantity, reason }` |
| `kempo-products:ledger:added` | `{ ref, lines, handedOver, reason, note, undoes }`: `lines` are the ones products wrote, `{ productId, name, change, quantity }` |
| `kempo-products:ledger:add_failed` | `{ ref }`: an entry a manager agreed to did not happen, so it undoes what it did |
| `kempo-products:type:created`, `updated`, `deleted` | `{ type, previous? }` |
| `kempo-products:field:created`, `updated`, `deleted` | `{ field, previous? }` |
| `kempo-products:category:created`, `updated`, `deleted` | `{ category, previous?, products? }` (`products`: the ids it was taken off, on delete) |

### Adding controls to products

An extension that sells, reserves or compares products puts a control on **every product card and every product page** by composition: plain files, no registration, no editing either page. The pages carry locations; the extension fills them from a global content file in its `public/` folder, and the control is its own custom element:

```html
<!-- public/product-actions.global.html -->
<content location="products-scripts"><script type="module" src="/shop/components/AddToCart.js"></script></content>
<content location="products-card-actions"><k-shop-add-to-cart slot="actions"></k-shop-add-to-cart></content>
<content location="products-detail-actions"><k-shop-add-to-cart slot="actions"></k-shop-add-to-cart></content>
<content location="products-card-price"><k-sales-price slot="price"></k-sales-price></content>
<content location="products-detail-price"><k-sales-price slot="price"></k-sales-price></content>
```

| Location | What goes there |
|---|---|
| `products-scripts` | The `<script type="module">` that defines your element. Loads on product pages only, outside the card template, so it runs once |
| `products-card-actions` | Your element, in the one card template, for the card's `actions` slot (under the price). Each card gets its own copy |
| `products-card-price` | An element for the card's `price` slot: it replaces the price shown |
| `products-detail-actions` | Your element for a product page's `actions` slot (under the options) |
| `products-detail-price` | An element for a product page's `price` slot: it replaces the price line |
| `products-detail-extra` | Your element for a product page's `extra` slot (under the description) |

A location is a plain insertion point: the element you put in it names the slot it fills with `slot="…"`, as any child of a web component does. The `price` slots have the usual price as their **default content**, so a site that installs nothing shows it unchanged, and an extension that shows it differently (a sale price with the old one struck through, in green) puts its own element there and the default is replaced. Read `card.product` and `card.config` (`page.product`, `page.price`, `page.config` and `page.money(minor)` on a product page) and format with `displayMoney` from `/products/sdk.js`. Two extensions that both fill `price` are both shown, so a price override is something one extension should own.

When the browser creates your element it finds where it sits:

```javascript
// inside a card
const card = this.closest('k-products-card');
card.getAttribute('product-id');   // which product
card.product;                      // the product the list already loaded, so no fetch is needed

// on a product page
const page = this.closest('k-products-detail');
page.product; page.selections; page.price; page.complete;   // the choices so far and the price they make
page.addEventListener('selection-change', this.update);     // when they change
```

A component that needs more than the product (stock, ratings) fetches it from its own extension's API using `product-id`. Several extensions can fill one location and stack by `priority`, highest first, unlike a fragment, which has one winner.

`/products/` already has the card template. A page of your own that embeds a `<k-products-list>` includes it once with `<fragment name="products-card-template" />`; without it the cards show no extension content. A list can carry its own template instead, as a child.

**Deprecated:** `registerProductAction('k-my-element')` (from `/products/components/actions.js`) still works for extensions that have not moved, and will be removed in a later major release.

### Adding to the admin form

The product form is split into tabs: **Details**, **Description** (a full rich text editor, the same as pages use), **Media** and **Options**. An extension adds its own tab by shipping a global content file in its `admin/` directory (`admin/product-tab.global.html`) that pushes a `<k-products-tab>` into the `products-admin-product-tabs` location the form pages carry:

```html
<content id="my-extension-product-tab" name="Shipping tab" owner="my-extension" enabled="true" locked="true" location="products-admin-product-tabs" priority="10">
<k-products-tab name="shipping" label="Shipping">
  <my-shipping-fields></my-shipping-fields>
</k-products-tab>
</content>
```

Tabs from several extensions all appear, after the built-in ones, ordered by `priority`. The form fires `draft-change` as it is edited and `product-saved` when the product is stored; a tab with more to save calls `event.detail.waitUntil(promise)` and the page waits. Your elements find the form with `this.closest('k-products-form')`.

The description is stored as HTML. The public product page sanitizes it when showing it (scripts, event handlers and `javascript:` links are removed) and the meta description and structured data use its plain text.

## Credits

When the [kempo-credits](https://github.com/dustinpoissant/kempo-credits) extension is installed and **enabled** on the site, products know about credits. Nothing here shows or does anything without it: the extension is an optional peer, looked up at run time, and a product that never uses credits is unchanged.

A product gets a **Credits** tab in the admin form, and its **Details** tab gets a field under the price:

| | |
|---|---|
| **Credits the buyer gets** (`creditsGranted`) | How many credits each one bought gives. 0 gives none. |
| **This is a credit-only item** (`creditsOnly`) | Buying it gives credits and nothing else: this is how people buy credits, so a *credit pack* is just a product. Without it the credits are a gift with the product: the buyer gets the item and the credits too. A credit-only product must give at least 1 credit, and cannot itself be paid for in credits. |
| **Percentage that can be paid in credits** (`creditPercent`) | 0 to 100. **0% (the default) means credits cannot be used to pay for it at all; 100% means it can be bought entirely with credits.** Anything between is the share credits may cover, with money paying the rest. Good for rewards points. |

How they work:

- Products only says how many credits a product gives. **Giving them is the caller's job**: whoever takes the order grants them once it is paid (kempo-commerce does, with kempo-credits' `grantCredits`) and takes them back when it is refunded. Nothing here grants or takes back credits.
- `getPrice` (and `GET /products/api/price`) also returns `credits` for a product that accepts them: `{ percent, perUnit, maxCredits, coveredMinor, remainingMinor }`, the most credits that may be used and the money left. **Spending the credits is the caller's job** (kempo-commerce) with kempo-credits' `spendCredits`; products only says how much may be.
- Credits are not worth a fixed amount of money. The `credits_per_unit` setting says how many credits equal one whole unit of the currency (100 means 1 credit is 1 cent). Credits round up and money rounds down, so rounding never gives a discount.

Selling credits for money needs a checkout, which this extension does not have: the buy flow (and tax, payments and refunds) is kempo-commerce's, and a credit pack is a product it sells.

## Permissions, groups and settings

| Permission | Allows |
|---|---|
| `products:read` | See drafts and archived products, exact quantity and the ledger in the admin |
| `products:create`, `products:update`, `products:delete` | Manage products |
| `products:types:manage` | Create, edit and delete types and fields |
| `products:categories:manage` | Create, edit and delete categories. Putting a product in one only needs permission to edit the product |
| `products:ledger:add` | Add an entry to the ledger: add stock to products or take it away |
| `products:settings:manage` | Change the catalog settings on the Product Settings page |

Published products need no permission to see. Three groups are provided: `kempo-products:viewer`, `kempo-products:manager` (manage products and add to the ledger) and `kempo-products:admin` (also types, fields and the settings page).

| Setting | Default | Meaning |
|---|---|---|
| `currency` | `usd` | The currency code prices are shown in |
| `prices_visible` | `true` | Show prices to visitors |
| `page_size` | `24` | Products per page on the public list |
| `credits_per_unit` | `100` | How many credits equal one whole unit of the currency, used when a product accepts credits as payment. Only used with kempo-credits |

These can be edited in a table at **Settings → Admin Settings**, or on the **Product Settings** page (Admin → Products → Product Settings, at `/admin/extension/kempo-products/settings/`), which groups them into sections with explanations and checks every value before saving.

## API

JSON routes under `/products/api/`. Reads are public (published products only, no exact quantity, and no prices when `prices_visible` is off); everything that changes something needs the permission above.

| Route | Purpose |
|---|---|
| `GET config` | Currency, whether prices are shown, whether images are available, whether kempo-credits is in use, and the allowed values |
| `GET settings`, `PUT settings` | Read and save the catalog settings (`products:settings:manage`); a name that is not declared or a value that is not acceptable saves nothing |
| `GET products`, `GET products/<id or slug>` | List (`q`, `type`, `status`, `availability`, `tag`, `filters`, `sort`, `inStock`, `limit`, `offset`) and read |
| `POST products`, `PATCH products/<id>`, `DELETE products/<id>` | Manage products |
| `GET price?product=&options=` | The server's price for a set of choices |
| `GET types`, `GET fields`, and `POST`/`PATCH`/`DELETE` on them | Types and fields |
| `GET ledger` (`productId`, `limit`, `offset`), `POST ledger` (`{ ref, lines, note, reason }`) | The ledger |
| `GET export?format=csv\|json`, `POST import` | Download the catalog; import a file (`{ content, onMatch, dryRun }`) |

Money is always a whole number of the smallest unit: `4999` is $49.99. Currencies without cents (yen) and with three decimals (dinar) are handled.

## Development

The documentation site is built from `docs-src/` into `docs/`, which GitHub Pages serves (set Pages to deploy from the `docs` folder of the default branch). Edit `docs-src`, run `npm run docs:build`, and commit both. Screenshots come in pairs: write `<img src="./media/name.png" ...>` in a page, and put `name-light.png` and `name-dark.png` in `docs-src/media`. The build turns the tag into both images and the site shows the one matching the visitor's theme.

```bash
npm run link:local          # symlinks the sibling kempo checkouts
docker compose up -d        # a throwaway Postgres on port 5443
DATABASE_URL=postgresql://kempo:kempo@localhost:5443/kempo_products_test npx drizzle-kit push --force
DATABASE_URL=postgresql://kempo:kempo@localhost:5443/kempo_products_test npm test
```

The database tests skip themselves when no database is reachable, and refuse to run unless its name ends in `_test`, because they empty the tables. **A green run with `SKIPPED` did not test the database.**

## Dashboard widget

Adds a **Products** widget to the kempo admin dashboard showing catalog size and the latest products, with a **New product** button. It is declared in `widgets` in `kempo-config.json` and registered when the extension is installed or updated; people only see it if they hold its permission, and can hide, reorder or resize it from the dashboard's Customize dialog. Needs a kempo with the dashboard (see kempo's `docs/dashboard.md`); on an older kempo the entry is ignored.
