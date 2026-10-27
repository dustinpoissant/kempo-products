import ProductTab from '/products/components/ProductTab.js';
import { html } from '/kempo-ui/lit-all.min.js';
import '/kempo-ui/components/Icon.js';

/*
  The Save button above the tabs of a product or template page, served at /products/components/ProductSaveButton.js. It saves
  everything on the page at once by calling save() on the form it sits in. It works in either form.

    <k-products-save-button></k-products-save-button>
*/
export default class ProductSaveButton extends ProductTab {
  get editing(){
    return this.form?.editing ?? false;
  }

  get isProduct(){
    return this.form?.tagName.toLowerCase() === 'k-products-form';
  }

  render(){
    if(!this.form) return html``;
    const label = this.editing ? 'Save' : (this.isProduct ? 'Create product' : 'Create template');
    return html`<button type="button" class="btn success" id="saveAll" ?disabled=${this.busy} @click=${() => this.form.save()}>${this.busy ? 'Saving…' : label}</button>`;
  }
}

customElements.define('k-products-save-button', ProductSaveButton);
