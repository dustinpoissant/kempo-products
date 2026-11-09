import ProductTab from '/products/components/ProductTab.js';
import { html } from '/kempo-ui/lit-all.min.js';
import '/kempo-ui/components/Spinner.js';
import '/products/components/ImagesField.js';

/*
  The Media tab of the product form: the product's pictures and videos. Its own Save button saves them.

  Extensions add their way of getting files in through the `upload` slot: the page puts `<location name="products-admin-media-upload" />`
  inside this element, and an extension fills it with a global content whose element says `slot="upload"` and fires
  `media-uploaded` ({ asset }) for each file (see ImagesField.js). kempo-media does.
*/
export default class ProductMediaTab extends ProductTab {
  render(){
    if(!this.ready) return html`<k-spinner></k-spinner>`;
    const { form } = this;
    if(!this.config.media) return html`<p class="tc-muted">Install the kempo-media extension to add pictures and videos to products.</p>`;
    return html`
      <p class="tc-muted">Drag them into the order you want. The first is the primary one, shown on cards and lists (a video counts only when it has a thumbnail), and the product page shows them all in a gallery, in this order.</p>
      <k-products-images .value=${this.draft.images} .assets=${form.assets} @change=${event => { form.assets = { ...form.assets, ...event.detail.assets }; form.set({ images: event.detail.value }); }}><slot name="upload" slot="upload"></slot></k-products-images>
    `;
  }
}

customElements.define('k-products-media-tab', ProductMediaTab);
