import ProductPart from '/products/components/ProductPart.js';
import { html, css, nothing } from '/kempo-ui/lit-all.min.js';
import renderGallery from '/products/utils/renderGallery.js';

/*
  The Product gallery widget as the page builder shows it: the same gallery, but a click on a picture never opens the
  fullscreen viewer, so clicking it only selects the widget.
*/
export default class GalleryWidgetEditor extends ProductPart {
  static properties = {
    thumbsPosition: { type: String, attribute: 'thumbs-position' },
    ratio: { type: String }
  };

  static styles = css`
    :host { display: block; }
  `;

  constructor(){
    super();
    this.thumbsPosition = 'bottom';
    this.ratio = '1/1';
  }

  render(){
    if(!this.parentProduct) return html`<p class="tc-muted">Place this in a Parent Product</p>`;
    if(!this.product) return nothing;
    return renderGallery(this.product, this.parentProduct.images, { thumbsPosition: this.thumbsPosition, ratio: this.ratio, noFullscreen: true });
  }
}

customElements.define('k-products-gallery-editor', GalleryWidgetEditor);
