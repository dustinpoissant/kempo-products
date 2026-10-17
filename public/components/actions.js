/*
  Deprecated: add to a product card or page by composition instead (the `products-card-actions` and
  `products-detail-actions` locations; see docs/extending.html). This keeps working for extensions that
  have not moved, and will be removed in a later major release.

  The extension point for controls on products: an extension that sells, reserves or compares products
  registers the custom element it wants shown, and every product card and every product page puts one
  in.

    import { registerProductAction } from '/products/components/actions.js';
    registerProductAction('k-commerce-add-to-cart');

  Each element is created by the card or page and handed the product by property, so it needs no
  attributes: `product` (the API's product), and on a product page also `selections` (the options
  chosen so far, { optionKey: choiceKey }), `price` and `complete` (whether every required option is
  chosen). They are set again whenever those change. Elements can be registered at any time; ones that
  are already on the page appear straight away.

  `where` limits it to `'card'` (the list) or `'detail'` (the product's own page); both by default.
*/

const registered = [];

export const registerProductAction = (tag, { where = ['card', 'detail'] } = {}) => {
  if(!/^[a-z][a-z0-9]*-[a-z0-9-]*$/.test(tag)) throw new Error(`"${tag}" is not a custom element name`);
  if(registered.some(entry => entry.tag === tag)) return;
  registered.push({ tag, where: [where].flat() });
  window.dispatchEvent(new CustomEvent('products-actions-changed'));
};

export const unregisterProductAction = tag => {
  const index = registered.findIndex(entry => entry.tag === tag);
  if(index < 0) return;
  registered.splice(index, 1);
  window.dispatchEvent(new CustomEvent('products-actions-changed'));
};

export const productActions = where => registered.filter(entry => entry.where.includes(where)).map(entry => entry.tag);

/*
  Makes `container` hold exactly the registered elements for `where`, each given `props`. Used by the
  card and the page from their `updated()`; it only touches the DOM when something differs.
*/
export const syncActions = (container, where, props) => {
  if(!container) return;
  const wanted = productActions(where);
  for(const child of [...container.children]){
    if(!wanted.includes(child.localName)) child.remove();
  }
  for(const tag of wanted){
    let element = [...container.children].find(child => child.localName === tag);
    if(!element){
      element = document.createElement(tag);
      container.append(element);
    }
    for(const [name, value] of Object.entries(props)){
      if(element[name] !== value) element[name] = value;
    }
  }
};
