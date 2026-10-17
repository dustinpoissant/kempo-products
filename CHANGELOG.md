# Changelog

All notable changes to `kempo-products` are documented in this file.

## [Unreleased]

### Added

- **Categories.** A product is of one type and can be in any number of categories, which shoppers browse by. Manage them under **Admin → Products → Product Categories** (new permission `products:categories:manage`, in the `kempo-products:admin` group) and tick them on the product form's **Details** tab. A category has a name, a description and a key made from its name, which never changes, and deleting one takes it off its products and leaves them. A product has `categories` (a list of keys); `getProducts({ category })` and `GET /products/api/products?category=` keep products in every category given; `<k-products-list category="…">`, a Category menu on the list and `/products/?category=` use it; `/categories/` lists the categories that have published products, with how many. The admin product list has a Categories column. CSV and JSON export and import carry them (by key or name; a JSON file brings the categories themselves). Server SDK: `getCategories`, `getCategory`, `createCategory`, `updateCategory`, `deleteCategory`; browser SDK the same; events `kempo-products:category:created`, `updated` and `deleted`. A site that installed earlier gets the `kempoProductCategory` table and the `kempoProduct.categories` column on update.
- **A `/categories/` page**, from a second scope. The extension now answers on two addresses, `/products` (from `public/`) and `/categories` (from the new `public-categories/` folder, declared with `"public-scopes": { "categories": "public-categories" }`). It lists the product categories, each linking to the product list narrowed to it (`/products/?category=…`), through `<k-products-category-list>`. Needs a kempo with multiple scopes. Kempo now refuses to install or enable the extension beside another that claims `/products` or `/categories`.
- **Extensions add to product cards and the product page by composition.** The pages carry the locations `products-scripts`, `products-card-actions`, `products-detail-actions` and `products-detail-extra`, and an extension fills them with a `*.global.html` file in its `public/`. The product list has **one** `<template data-products-card>` (from the `products-card-template` fragment, which a page embedding its own list includes once), cloned into every card. An extension's element finds its card with `closest('k-products-card')` (the `product-id` attribute and the `.product` property) and its product page with `closest('k-products-detail')` (`.product`, `.selections`, `.price`, `.complete`, and its `selection-change` event). Several extensions stack in one location by priority, which a fragment cannot do. See *Adding controls to products*.

- **A price an extension can replace.** The card and the product page each have a `price` slot whose default content is the usual price, so nothing changes until an extension puts its own element there (a sale price with the old one struck through) through the new locations `products-card-price` and `products-detail-price`. The product page exposes `config`, `price` and `money(minor)` for it.

### Changed

- **Contributions name their slot.** The locations are placed directly among a component's children, with no wrapper element, and an element names the slot it fills with `slot="actions"`, `"price"` or `"extra"`. A wrapper would always occupy the slot and hide its default content.
- **`<k-products-card>` carries a `product-id` attribute**, and its `product` property is the product it was given, so a component slotted into it finds both with `closest('k-products-card')`. Its `actions` slot is filled by the list from the page's template (see above) instead of by hand.
- The product page's `actions` and `extra` slots are filled from the `products-detail-actions` and `products-detail-extra` locations, and `<k-products-detail>` exposes `product`, `selections`, `price` and `complete`.
- `registerProductAction` is **deprecated**. It keeps working, and will be removed in a later major release.

### Added (discounts)

- **A minimum price on a product** ("Lowest price after discounts"): `minimumPrice`, the lowest a discount extension may take the unit price to, so stacked sales and old codes cannot sell it at a loss. A field on the product form, in the API (`POST` and `PATCH products`), in the `kempoProduct` table (added to existing sites by `install.js`), and in import and export (a `minimum_price` CSV column, which sits after `price_label`). It must be a whole number and not above the price. Nothing in this extension discounts anything; kempo-discounts and kempo-commerce read it.
- **Two places for other extensions to add admin buttons:** the `products-admin-product-actions` location on the product edit and new pages (an element with `slot="actions"` appears beside Save and Cancel) and `products-admin-category-actions` on each category in the category list (one template cloned into a new `<k-products-category-actions>` item per row), with `products-admin-scripts` for their modules. See "Buttons" in the README.

### Changed (breaking)

- **Purchases and holds are gone; there is a ledger.** This extension never took orders, so it no longer pretends to. Every change to a product's quantity is a row in the new `kempoProductLedger` table (what changed, by how much, why, and what was left), shown on a **Ledger** page where you can add stock or take it away. The SDK is `addLedgerEntry({ ref, lines: [{ productId, change }], note, reason, undoes, actor })` (all the lines or none, idempotent by `ref`), `getLedger` and `getLedgerEntry`; `setQuantity`, `adjustQuantity`, creating a product with a quantity and editing one all write to it too. Removed: `recordPurchase`, `reversePurchase`, `getPurchase`, `getPurchases`, `holdQuantity`, `commitHold`, `releaseHold`, `expireHolds`, `getHold`, `getHolds`, `getHeldQuantities`, `grantPurchaseCredits`, the `purchase:*`, `hold:*` and `quantity:take_failed` events (the new ones are `ledger:before_add`, `ledger:added` and `ledger:add_failed`), the `kempoProductPurchase` and `kempoProductHold` tables (existing rows are left in the database, unused), the `purchases` API and the `products:purchases:record` permission (now `products:ledger:add`). Pricing a cart, holding stock while a payment is pending, granting credits and refunds belong to whoever takes the order (kempo-commerce).
- Its menu entry is in the new **Products** group, first (priority 89), instead of Commerce.
- **Custom elements are renamed to `k-products-<name>`**, the extension's name after `k-`; the old tag names stop working: `k-prod-list` is `k-products-list`, `k-prod-card` is `k-products-card`, `k-prod-detail` is `k-products-detail`, `k-prod-form` is `k-products-form`, `k-prod-field-input` is `k-products-field-input`, `k-prod-fields` is `k-products-fields`, `k-prod-images` is `k-products-images`, `k-prod-money` is `k-products-money`, `k-prod-options-editor` is `k-products-options-editor`, `k-prod-widget` is `k-products-widget`, `k-prod-purchases` is `k-products-purchases`, `k-prod-row-action` is `k-products-row-action`, `k-prod-settings` is `k-products-settings`, `k-prod-types` is `k-products-types`. The product form's tab marker `<k-prod-tab>` is `<k-products-tab>` too: an extension that adds a tab (kempo-products-inventory does) must use the new tag, so update them together.
- **"Stock" is now "quantity", everywhere.** A product, a kempo-inventory item and a cart or order line all say `quantity` for how many, so there is one word. The `kempoProduct.stock` column is `quantity` (`install.js` and `update.js` rename it on an existing site, keeping every number); `product.stock` is `product.quantity`; `setStock`/`adjustStock` are `setQuantity`/`adjustQuantity`; `holdStock` is `holdQuantity`; the `kempo-products:product:stock_changed` event is `kempo-products:product:quantity_changed` with `previousQuantity` and `quantity`; the API and the import and export columns say `quantity`. A CSV or JSON file exported before the change still imports, because its `stock` column is read as `quantity`. "In stock" and "out of stock" remain as the plain English they are, and `inStock` is still the yes or no a product reports.

### Added

- **A managed product is managed only while its manager is installed and enabled.** Disabling or uninstalling kempo-products-inventory (or any extension that called `setManagedBy`) hands its products back to people with no clean-up, and enabling it takes them back. Products read from the catalog report `managedBy: ''` when the manager is gone, and a new manager may take over from one that went away.
- **A manager answers ledger entries for its products, and can refuse.** `addLedgerEntry` fires the guard `kempo-products:ledger:before_add` (`{ ref, lines, products, reason, note, undoes, actor }`) when any product is managed; the manager takes what the lines use, or puts back what `undoes` took, and throws `{ code, msg }` to refuse. kempo-products never writes a managed product's quantity itself, and `kempo-products:ledger:add_failed` `{ ref }` tells the manager to undo what it did when the entry then fails.
- **`registerProductAction(tag)`** (`/products/components/actions.js`): an extension registers a custom element and every product card and product page shows one, handed `product` (and on a product page `selections`, `price` and `complete`), so a store can put "Add to cart" on products without editing either page.

- **Credits, when kempo-credits is installed and enabled.** A **Credits** tab on the product form and a **Percentage that can be paid in credits** field under the price. A product gives credits when bought (`creditsGranted`), may be a **credit-only item** (`creditsOnly`, which is how credit packs are sold: a pack is a product), and says how much of its price credits may pay (`creditPercent`, 0 by default, 100 for entirely). `recordPurchase` grants the credits once, `reversePurchase` takes back what is held and leaves what was spent as an amount owed, and `getPrice` reports the most credits that may be used. The `credits_per_unit` setting says what a credit is worth. kempo-credits is an optional peer, found with `getExtension` and imported on demand; the new columns are added by `install.js` and `update.js`.
- **A Product Settings page** at `/admin/extension/kempo-products/settings/`, last in the Products group in the admin nav, with the catalog's settings in sections and every value checked before it is saved; `GET`/`PUT /products/api/settings` and the `products:settings:manage` permission (held by `kempo-products:admin`). The table at Admin Settings still edits the same values.
- **Dashboard widget.** A **Products** widget on the kempo admin dashboard showing catalog size and the latest products, with a **New product** button, declared in `widgets` in `kempo-config.json`. Needs a kempo with the dashboard; ignored on older versions.

First release.

A product catalog for kempo that works on its own, with no checkout and no inventory.

### Catalog

- Products with a name, slug, description, status (`draft`, `published`, `archived`), availability (`available`, `pending`, `sold`), an optional price and price label, tags, stock, and pictures.
- **Product types and fields** an owner builds in the admin with no code: a field applies to every product or to one type, in kinds short text, long text, number, yes/no, date, colour, rating, choice list and images. Fields can be filterable on the public list.
- **Options with relative prices.** A choice adds to or takes from the base price (`-1.00` for no clear coat), or, per option, replaces it. One replacing option per product. The server computes every price; nothing trusts a browser.
- **Stock** as a number, or unlimited by default, so a catalog that never counts never shows "out of stock".
- Optional images through kempo-media, hidden when it is not installed. Lists and cards load the small thumbnail the API supplies (kempo-media's, made by kempo-thumbs) and fall back to the full image while one is not ready; the detail page shows the full image, with thumbnails in its gallery strip.
- Ownership: types, fields and products can belong to an extension, which alone can delete them or change what defines them.

### Public pages

- `/products/` with search, filters, sorting and paging, all kept in the address.
- `/products/<slug>/` with pictures, the options a buyer chooses (kept in the address, `?color=red`), a server-priced total, and the product's details. Sold-out and invalid choices in the address are ignored.
- The pages are Lit components (`k-prod-list`, `k-prod-card`, `k-prod-detail`) usable on any page. `<k-prod-list>` can be limited to a type, tag, hand-picked slugs, availability, what is in stock or a field value, can start sorted or searched, and can show a few products with `limit`, `hide-controls` and `no-url`; see `docs/components.md`.

### Purchases and extension points

- `addLedgerEntry` changes the quantity of every product in an entry or none, is idempotent by `ref`, and fires `kempo-products:ledger:added`. Taking more than a product has is refused.
- `setManagedBy`, `setStock` and `setChoiceAvailability` let an extension keep stock and choice availability in step with something else; people see them read-only.
- Guard and notification hooks for products, types, fields, quantity and the ledger.
- The admin product form is split into tabs (Details, Description, Media, Options). Another extension adds a tab by pushing a `<k-prod-tab>` into the `products-admin-product-tabs` location from an `admin/*.global.html`, and the form fires `draft-change` and `product-saved` so the tab can save with it.
- The description is edited with the full rich text editor and shown (sanitized) on the product page; plain-text descriptions keep their line breaks.
- In the options editor each choice sits in its own box under its option, so removing an option and removing a choice are no longer easy to confuse.

### Import and export

- Export the catalog as a spreadsheet (`.csv`) or everything (`.json`, including types and fields). Import either, matching products by slug so a file imported twice never duplicates, with a preview of what will happen and a per-row report of what could not be read. In a spreadsheet an empty cell leaves what a product has unchanged.
- Spreadsheet cells that would be read as formulas are written as text.

### Admin

- Products, Types, Fields and Ledger pages, built from kempo-ui components. Permissions `products:*` and groups `kempo-products:viewer`, `manager` and `admin`.
