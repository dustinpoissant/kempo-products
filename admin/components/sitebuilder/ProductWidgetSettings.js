import WidgetSettings from '/kempo-ui/components/pagebuilder/WidgetSettings.js';
import { html } from '/kempo-ui/lit-all.min.js';
import '/products/components/ProductPicker.js';

/*
  The settings of the Product widget: the product is chosen from the catalogue, so nobody types an id.
*/
export default class ProductWidgetSettings extends WidgetSettings {
  render(){
    const productId = this.node.attrs?.['product-id'] || '';
    return html`
      <div class="mb">
        <span class="d-b mbq">Product<small class="d-b tc-muted">The product this shows, with its options. Products are made under Products in the admin.</small></span>
        <k-products-product-picker .value=${productId} @change=${event => this.set('product-id', event.detail.value, false)}></k-products-product-picker>
      </div>
      ${this.renderFields(['product-id'])}
    `;
  }
}

customElements.define('k-products-product-settings', ProductWidgetSettings);
