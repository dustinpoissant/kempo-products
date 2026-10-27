import ProductTab from '/products/components/ProductTab.js';
import { html } from '/kempo-ui/lit-all.min.js';
import '/kempo-ui/components/Spinner.js';
import '/products/components/AttributesEditor.js';

/*
  The Attributes tab of the product form. It holds the attributes an administrator added for every product, and the attributes only
  this product has. Each block has its own Save button. Attributes an extension owns are shown by that extension, on its own tab.
*/
export default class ProductAttributesTab extends ProductTab {
  get customKeys(){
    return this.form.customAttributes.map(attribute => attribute.key);
  }

  saveCustom = () => this.form.saveAttributes(this.customKeys);

  changeOwn = event => this.form.set({ attributeDefs: event.detail.value });

  render(){
    if(!this.ready) return html`<k-spinner></k-spinner>`;
    const { form, draft, config } = this;
    const custom = form.customAttributes;
    return html`
      ${custom.length ? html`<h4 class="mb">Details</h4>
        ${custom.map(this.renderAttributeInput)}
      ` : ''}

      <h4 class="mb">Only this product</h4>
      <p class="tc-muted">Attributes only <strong>this product</strong> has, in addition to the ones every product has and the ones its template gives it. They are not added to the template. To give every product made from a template an attribute, add it on the template.</p>
      <k-products-attributes-editor .value=${draft.attributeDefs} .config=${config} value-label="Value" @change=${this.changeOwn}></k-products-attributes-editor>
    `;
  }
}

customElements.define('k-products-attributes-tab', ProductAttributesTab);
