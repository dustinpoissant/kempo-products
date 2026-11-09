import WidgetEditor from '/kempo-ui/components/pagebuilder/WidgetEditor.js';
import { html, css } from '/kempo-ui/lit-all.min.js';
import '/kempo-ui/components/Icon.js';

/*
  The product list as the page builder shows it: a card that says what the list is limited to, in place of the live list,
  so the editor does not fetch products for every list on the page.
*/
export default class ListingWidgetEditor extends WidgetEditor {
  static properties = {
    ...WidgetEditor.properties,
    category: { type: String, reflect: true },
    tag: { type: String, reflect: true },
    slugs: { type: String, reflect: true },
    availability: { type: String, reflect: true },
    inStock: { type: Boolean, attribute: 'in-stock', reflect: true },
    sort: { type: String, reflect: true },
    pageSize: { type: Number, attribute: 'page-size', reflect: true }
  };

  static styles = css`
    :host { display: block; }
  `;

  get summary(){
    const limits = [
      this.category && `category ${this.category}`,
      this.tag && `tag ${this.tag}`,
      this.slugs && `products ${this.slugs}`,
      this.availability && this.availability,
      this.inStock && 'in stock'
    ].filter(Boolean);
    return limits.length ? limits.join(', ') : 'All products';
  }

  render(){
    return html`
      <div class="b r p">
        <div class="bold"><k-icon src="/products/icons/products.svg"></k-icon> Product list</div>
        <div class="tc-muted">${this.summary}</div>
        <div class="tc-muted">${this.pageSize || 12} per page, sorted by ${this.sort || 'newest'}</div>
      </div>
    `;
  }
}

customElements.define('k-products-listing-editor', ListingWidgetEditor);
