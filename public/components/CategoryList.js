import ShadowComponent from '/kempo-ui/components/ShadowComponent.js';
import { html } from '/kempo-ui/lit-all.min.js';
import '/kempo-ui/components/Spinner.js';
import { getCategories } from '/products/sdk.js';

/*
  The product categories as places to browse, each linking to the product list narrowed to it, with how
  many products it holds. A category with nothing published in it is left out, since a visitor could
  only find nothing there. It is the whole of the /categories/ page, which this extension serves from its
  second scope (see "public-scopes" in kempo-config.json).

    <k-products-category-list></k-products-category-list>
*/
export default class CategoryList extends ShadowComponent {
  static properties = {
    categories: { state: true },
    error: { state: true },
  };

  constructor(){
    super();
    this.categories = null;
    this.error = '';
  }

  /*
    Lifecycle callbacks
  */
  async connectedCallback(){
    super.connectedCallback();
    const [error, data] = await getCategories();
    if(error) this.error = error.msg;
    else this.categories = data.categories.filter(category => category.count > 0);
  }

  /*
    View
  */
  render(){
    if(this.error) return html`<p class="tc-muted">${this.error}</p>`;
    if(!this.categories) return html`<k-spinner></k-spinner>`;
    return html`<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr)); gap: var(--spacer);">
      ${this.categories.map(category => html`<a class="card no-link m0" href=${`/products/?category=${encodeURIComponent(category.key)}`}>
        <h2 class="h5 m0">${category.name}</h2>
        ${category.description ? html`<p class="tc-muted mbq">${category.description}</p>` : ''}
        <p class="tc-muted mb0">${category.count} product${category.count === 1 ? '' : 's'}</p>
      </a>`)}
      <a class="card no-link m0" href="/products/">
        <h2 class="h5 m0">All products</h2>
        <p class="tc-muted mb0">Everything in the catalog</p>
      </a>
    </div>`;
  }
}

customElements.define('k-products-category-list', CategoryList);
