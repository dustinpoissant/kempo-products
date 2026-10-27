import ProductTab from '/products/components/ProductTab.js';
import { html } from '/kempo-ui/lit-all.min.js';
import '/kempo-ui/components/Spinner.js';
import '/products/components/ImagesField.js';

/*
  The Media tab of the product form: the product's pictures. Its own Save button saves them.
*/
export default class ProductMediaTab extends ProductTab {
  render(){
    if(!this.ready) return html`<k-spinner></k-spinner>`;
    const { form } = this;
    if(!this.config.media) return html`<p class="tc-muted">Install the kempo-media extension to add pictures to products.</p>`;
    return html`
      <p class="tc-muted">The first picture is the one shown on cards and lists.</p>
      <k-products-images .value=${this.draft.images} .assets=${form.assets} @change=${event => { form.assets = { ...form.assets, ...event.detail.assets }; form.set({ images: event.detail.value }); }}></k-products-images>
    `;
  }
}

customElements.define('k-products-media-tab', ProductMediaTab);
