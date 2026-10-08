# Putting products on your pages

kempo-products gives you ready-made components to show products anywhere on a site: a home page, a landing page, a blog post. They are ordinary HTML elements, so you use them by adding two things to a page: a `<script>` that loads the component, and the element itself.

This guide covers the three you will use:

| Element | Shows |
|---|---|
| [`<k-prod-list>`](#k-prod-list) | A grid of products, from a handful on your home page to the whole searchable catalog |
| [`<k-prod-card>`](#k-prod-card) | One product as a card, for when you lay a page out yourself |
| [`<k-prod-detail>`](#k-prod-detail) | A product's full page, with its pictures, options and price |

Only published products ever show. A draft or archived product is never public, whatever you put in an attribute.

## The quickest start: featured products on the home page

Open your home page (`public/index.page.html`, or **Admin > Content > Pages**) and add this where you want the products:

```html
<script type="module" src="/products/components/ProductList.js"></script>

<h2>Featured</h2>
<k-prod-list tag="featured" limit="4" hide-controls no-url></k-prod-list>
```

Now tag a few products `featured` in the product form, and they appear. Four attributes did the work:

- `tag="featured"` picks only products with that tag.
- `limit="4"` shows at most four, with no page buttons.
- `hide-controls` removes the search box and filters, which a home page rarely wants.
- `no-url` stops the list reading or writing the page's address (see [Two lists on one page](#two-lists-on-one-page)).

## `<k-prod-list>`

Every attribute is optional. With none, it is the full catalog with a search box, filters and paging, which is what `/products/` shows.

### Choosing which products

These are fixed: a visitor cannot change them, so they decide what the list can ever contain. Use as many together as you like; a product must match all of them.

| Attribute | Shows only | Example |
|---|---|---|
| `type` | Products of one type. Use the type's key (shown on **Products > Types**) | `type="model-car"` |
| `tag` | Products that have every tag listed, comma separated | `tag="featured"`, `tag="red,muscle"` |
| `slugs` | Exactly these products, by slug, comma separated, in the order you list them | `slugs="1969-camaro,mini-cooper"` |
| `availability` | Products with one of these availabilities: `available`, `pending`, `sold` | `availability="available"` |
| `in-stock` | Products that are not out of stock. It is a flag: no value needed | `in-stock` |
| `filters` | Products whose custom fields match, as JSON. Use a field's key | `filters='{"scale":"1:18"}'` |

A product's slug is its address: it is the last part of `/products/1969-camaro/`, and you can see and change it in the product form.

### Where it starts

These set the starting point. Visitors can change them with the controls, unless you hide the controls.

| Attribute | Sets | Values |
|---|---|---|
| `search` | The text in the search box | `search="camaro"` |
| `sort` | The order | `newest` (default), `oldest`, `name`, `price-asc`, `price-desc` |

With `slugs` and no `sort`, products come in the order you listed them. Give a `sort` and that order wins instead.

### How it looks

| Attribute | Effect |
|---|---|
| `limit` | Show at most this many products, and no page buttons. For "latest 4", "top 3" |
| `page-size` | Products per page, when you do want pages. Without it the site's `page_size` setting is used (24 to start with) |
| `hide-controls` | No search box, no filters, no sorting. Just the products |
| `no-url` | Do not read or write the page's address. See below |

`limit` and `page-size` do different jobs. `limit="4"` is "only ever four". `page-size="12"` is "twelve at a time, with buttons for the rest".

### Recipes

Each of these is one line.

```html
<!-- The newest six, as a strip on the home page -->
<k-prod-list sort="newest" limit="6" hide-controls no-url></k-prod-list>

<!-- Four hand-picked products, in this order -->
<k-prod-list slugs="1969-camaro,mini-cooper,vw-beetle,mustang" hide-controls no-url></k-prod-list>

<!-- Everything tagged "sale" that you can actually buy, cheapest first -->
<k-prod-list tag="sale" in-stock availability="available" sort="price-asc" hide-controls no-url></k-prod-list>

<!-- The three most expensive in stock -->
<k-prod-list in-stock sort="price-desc" limit="3" hide-controls no-url></k-prod-list>

<!-- A page for one type, with search and paging, twelve at a time -->
<k-prod-list type="model-car" page-size="12"></k-prod-list>

<!-- Only 1:18 scale cars -->
<k-prod-list type="model-car" filters='{"scale":"1:18"}' hide-controls no-url></k-prod-list>

<!-- Vehicles that are not sold yet -->
<k-prod-list type="vehicle" availability="available,pending" page-size="12"></k-prod-list>

<!-- The whole catalog, which is what /products/ is -->
<k-prod-list></k-prod-list>
```

### Two lists on one page

Without `no-url`, a list keeps what it is searching and filtering in the page's address (`/products/?q=camaro&sort=price-asc`), so a filtered list can be bookmarked and survives a refresh. That is right for a page that is only the catalog. But on a page with a list among other things, or with two lists, they would all read and rewrite the same address and fight over it. Put `no-url` on any list that is not the page's main content.

### What the address does on a catalog page

On `/products/`, or any page with a `<k-prod-list>` that has no `no-url`, these work in the address:

| Address | Does |
|---|---|
| `?q=camaro` | Searches the name, description, tags and field values |
| `?type=model-car` | Shows one type (ignored when the list has a `type` attribute) |
| `?sort=price-asc` | Sorts |
| `?page=2` | The second page |
| `?f.scale=1:18` | Filters a choice-list field named `scale` to `1:18` |

So a link such as `/products/?type=model-car&f.scale=1:18&sort=price-asc` is a good thing to put in a menu.

Only choice-list fields (a field with a fixed list of choices) that you marked **Visitors can filter by this** get a filter drop-down. Text, number and other fields can be matched with the `filters` attribute (an exact match), but they have no drop-down.

### Anything that goes wrong

- A `filters` attribute that is not valid JSON is ignored and a warning is written to the browser console. It is the most common mistake: the attribute needs single quotes outside and double quotes inside, `filters='{"scale":"1:18"}'`.
- A slug that does not exist is simply left out.
- A list with nothing to show says "No products found."

## `<k-prod-card>`

One product as a card: its first picture, name and price, linked to its page, with a "Sold", "Sale pending" or "Out of stock" badge when it is not for sale. `<k-prod-list>` is made of these.

It is given data and not a name, so you use it from a script. This is for when you want your own layout:

```html
<script type="module">
  import '/products/components/ProductCard.js';
  import { getConfig, getProducts } from '/products/sdk.js';

  const [, config] = await getConfig();
  const [, data] = await getProducts({ tag: 'featured', limit: 3 });
  for(const product of data.items){
    const card = document.createElement('k-prod-card');
    card.product = product;
    card.images = data.images;
    card.config = config;
    document.getElementById('picks').append(card);
  }
</script>
<div id="picks" class="d-f"></div>
```

| Property | Is |
|---|---|
| `product` | A product, as returned by `getProducts` |
| `images` | The `images` map that came back with it |
| `config` | What `getConfig()` returned (the currency and whether prices show) |
| `href` | Where the card links. It defaults to the product's own page |

A card has a slot named `actions` under the price, for a button an extension adds, such as add to cart.

## `<k-prod-detail>`

A product's page. The `/products/<slug>/` page is this and little else.

```html
<script type="module" src="/products/components/ProductDetail.js"></script>
<k-prod-detail slug="1969-camaro"></k-prod-detail>
```

Without `slug` it uses the last part of the page's address, which is how `/products/1969-camaro/` works.

It shows the pictures, the name and price, the options a buyer chooses, the description and the product's details. As options are chosen it writes them into the address (`?color=red&clear-coat=no`), so a shared link opens with the same choices, and it asks the server for the price each time so the number shown is the number that would be charged. A choice that does not exist or is sold out in the address is ignored.

| Event | When | `event.detail` |
|---|---|---|
| `selection-change` | The page loads and whenever a choice changes | `{ product, selections, price, complete }`. `selections` is `{ optionKey: choiceKey }`, `price` is the server's price or `null`, and `complete` is true once every required option is chosen |

An extension that adds a buy button listens for `selection-change` to know what is selected. The slots are `actions` (under the options, for that button) and `extra` (under the description).

The page also writes a meta description and schema.org `Product` data (price, picture and availability) for search engines.

## Building your own

The components are built on a small browser SDK, which is also what you use for anything custom. Import it from any page on the site:

```javascript
import { getConfig, getProducts, getProduct, getPrice, displayMoney } from '/products/sdk.js';

const [error, data] = await getProducts({ tag: 'featured', sort: 'price-asc', limit: 8 });
// data.items, data.total, data.images (a map of picture id to its path and thumbnail)
```

Every call resolves to `[error, result]`, where `error` is `{ code, msg }` or `null`.

### `getProducts(params)`

| Parameter | Does |
|---|---|
| `q` | Searches the name, description, slug, tags and field values |
| `type` | One type's key |
| `tag` | A tag, or a list of tags that must all be present |
| `slugs` | Comma separated slugs: only these |
| `availability` | Comma separated: `available`, `pending`, `sold` |
| `inStock` | `true` to drop products that are out of stock |
| `filters` | An object of field key to exact value: `{ scale: '1:18' }` |
| `sort` | `newest`, `oldest`, `name`, `price-asc`, `price-desc` |
| `limit`, `offset` | Paging. `limit` is at most 200 |

It always returns published products only, to visitors. (A signed-in person who can manage the catalog may also pass `status` to see drafts, which is what the admin uses.) What comes back never includes the exact stock count, only whether a product is `inStock`, and no price when the site hides prices.

### Showing a price

Prices are whole numbers of the smallest unit: `4999` is $49.99. Do not do the arithmetic yourself:

```javascript
const [, config] = await getConfig();
displayMoney(4999, config.currency, config.decimals);   // "$49.99"
```

If a product has options that change the price, ask the server for the real number, because that is what would be charged:

```javascript
const [, { price }] = await getPrice('1969-camaro', { color: 'gold', 'clear-coat': 'no' });
price.unit;   // 5249, in the smallest unit
```

### The same thing over HTTP

Everything above is `GET /products/api/products` with the same parameters in the query string, e.g. `/products/api/products?tag=featured&sort=price-asc&limit=8`. See the [README](../README.md#api) for the full list of routes.

## Styling

The components use the site's kempo-css theme (its colours, spacing and radius), so they follow your site's look, and dark mode, without extra work. They are built with shadow DOM, which keeps a page's own CSS from breaking them, but it also means a page's CSS cannot restyle their insides. To go beyond what the theme gives you, build your own markup from the SDK as in [Building your own](#building-your-own).

The product grid fits as many columns as there is room for, with cards at least 15rem wide.
