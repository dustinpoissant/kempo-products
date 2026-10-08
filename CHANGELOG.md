# Changelog

All notable changes to `kempo-products` are documented in this file.

## [Unreleased]

First release.

A product catalog for kempo that works on its own, with no checkout and no inventory.

### Catalog

- Products with a name, slug, description, status (`draft`, `published`, `archived`), availability (`available`, `pending`, `sold`), an optional price and price label, tags, stock, and pictures.
- **Product types and fields** an owner builds in the admin with no code: a field applies to every product or to one type, in kinds short text, long text, number, yes/no, date, colour, rating, choice list and images. Fields can be filterable on the public list.
- **Options with relative prices.** A choice adds to or takes from the base price (`-1.00` for no clear coat), or, per option, replaces it. One replacing option per product. The server computes every price; nothing trusts a browser.
- **Stock** as a number, or unlimited by default, so a catalog that never counts never shows "out of stock".
- Optional images through kempo-media, hidden when it is not installed.
- Ownership: types, fields and products can belong to an extension, which alone can delete them or change what defines them.

### Public pages

- `/products/` with search, filters, sorting and paging, all kept in the address.
- `/products/<slug>/` with pictures, the options a buyer chooses (kept in the address, `?color=red`), a server-priced total, and the product's details. Sold-out and invalid choices in the address are ignored.
- The pages are Lit components (`k-prod-list`, `k-prod-card`, `k-prod-detail`) usable on any page.

### Purchases and extension points

- `recordPurchase` prices lines from the catalog, takes the stock of every line in one transaction, is idempotent by `ref`, and fires `kempo-products:purchase:recorded`. `reversePurchase` puts stock back once. A person recording a sale made elsewhere can price a product that has none.
- `setManagedBy`, `setStock` and `setChoiceAvailability` let an extension keep stock and choice availability in step with something else; people see them read-only.
- Guard and notification hooks for products, types, fields, stock and purchases.
- The admin product form has a `panels` slot and fires `draft-change` and `product-saved`, so another extension's panel can sit in it and save with it.

### Admin

- Products, Types, Fields and Purchases pages, built from kempo-ui components. Permissions `products:*` and groups `kempo-products:viewer`, `manager` and `admin`.
