import WidgetSettings from '/kempo-ui/components/pagebuilder/WidgetSettings.js';
import { html } from '/kempo-ui/lit-all.min.js';
import '/products/components/CategorySelector.js';
import '/products/components/TagSelector.js';
import '/products/components/ProductSelector.js';

/*
  The settings of the product list: the categories, tags and products it is limited to are chosen from the catalogue,
  and the rest of its settings are the default fields.
*/
export default class ListingWidgetSettings extends WidgetSettings {
  renderSelector(label, hint, element){
    return html`
      <div class="mb">
        <span class="d-b mbq">${label}<small class="d-b tc-muted">${hint}</small></span>
        ${element}
      </div>
    `;
  }

  render(){
    const attrs = this.node.attrs ?? {};
    return html`
      ${this.renderSelector('Categories', 'Only products in every one of these categories. Categories are made under Products in the admin.',
        html`<k-products-category-selector name="category" .value=${attrs.category || ''} @change=${event => this.set('category', event.detail.value, false)}></k-products-category-selector>`)}
      ${this.renderSelector('Tags', 'Only products with every one of these tags.',
        html`<k-products-tag-selector name="tag" .value=${attrs.tag || ''} @change=${event => this.set('tag', event.detail.value, false)}></k-products-tag-selector>`)}
      ${this.renderSelector('Products', 'Only these products, in the order chosen. Leave empty for every product the other limits allow.',
        html`<k-products-product-selector name="slugs" .value=${attrs.slugs || ''} @change=${event => this.set('slugs', event.detail.value, false)}></k-products-product-selector>`)}
      ${this.renderFields(['category', 'tag', 'slugs'])}
    `;
  }
}

customElements.define('k-products-listing-settings', ListingWidgetSettings);
