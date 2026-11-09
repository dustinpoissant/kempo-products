import ShadowComponent from '/kempo-ui/components/ShadowComponent.js';
import { html, css } from '/kempo-ui/lit-all.min.js';
import '/products/components/ProductList.js';

/*
  The product list on a page built in the page builder. It shows the products its settings name, limited the way the
  settings say. It never writes to the address, because a custom page can hold more than one list.
*/
export default class ListingWidget extends ShadowComponent {
  static properties = {
    category: { type: String },
    tag: { type: String },
    slugs: { type: String },
    availability: { type: String },
    inStock: { type: Boolean, attribute: 'in-stock' },
    search: { type: String },
    sort: { type: String },
    pageSize: { type: Number, attribute: 'page-size' },
    hideControls: { type: Boolean, attribute: 'hide-controls' }
  };

  static styles = css`
    :host { display: block; }
  `;

  constructor(){
    super();
    this.category = '';
    this.tag = '';
    this.slugs = '';
    this.availability = '';
    this.inStock = false;
    this.search = '';
    this.sort = 'newest';
    this.pageSize = 12;
    this.hideControls = false;
  }

  render(){
    return html`<k-products-list
      .category=${this.category}
      .tag=${this.tag}
      .slugs=${this.slugs}
      .availability=${this.availability}
      .inStock=${this.inStock}
      .search=${this.search}
      .sort=${this.sort}
      .pageSize=${this.pageSize}
      .hideControls=${this.hideControls}
      .noUrl=${true}
    ></k-products-list>`;
  }
}

customElements.define('k-products-listing-widget', ListingWidget);
