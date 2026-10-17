import ShadowComponent from '/kempo-ui/components/ShadowComponent.js';
import { html } from '/kempo-ui/lit-all.min.js';

/*
  The slot where other extensions put buttons for one category in the admin's category list
  (`<k-products-category-actions>` is drawn in each row by `<k-products-categories>`).

  An extension adds a button with a `*.global.html` that puts an element in the location
  `products-admin-category-actions`, and the list puts it in every row. The element
  names its slot and finds its category from the row:

    <k-shop-category-button slot="actions"></k-shop-category-button>

    const row = this.closest('k-products-category-actions');
    row.category   // { key, name, description, total, count }
*/
export default class CategoryActions extends ShadowComponent {
  static properties = {
    category: { type: Object },
  };

  constructor(){
    super();
    this.category = null;
  }

  render(){
    return html`<slot name="actions"></slot>`;
  }
}

customElements.define('k-products-category-actions', CategoryActions);
