import ProductPart from '/products/components/ProductPart.js';
import { html, css, nothing } from '/kempo-ui/lit-all.min.js';
import renderGallery from '/products/utils/renderGallery.js';

/*
  The pictures and videos of the product in the Parent Product it sits in, as kempo-ui's media gallery: the chosen one
  large, a thumbnail of each to choose from, and a fullscreen viewer, as a product page shows them.
*/
class GalleryWidget extends ProductPart {
  static properties = {
    thumbsPosition: { type: String, attribute: 'thumbs-position' },
    ratio: { type: String },
    noFullscreen: { type: Boolean, attribute: 'no-fullscreen' }
  };

  static styles = css`
    :host { display: block; }
  `;

  constructor(){
    super();
    this.thumbsPosition = 'bottom';
    this.ratio = '1/1';
    this.noFullscreen = false;
  }

  render(){
    if(!this.parentProduct) return html`<p class="tc-muted">Place this in a Parent Product</p>`;
    if(!this.product) return nothing;
    return renderGallery(this.product, this.parentProduct.images, { thumbsPosition: this.thumbsPosition, ratio: this.ratio, noFullscreen: this.noFullscreen });
  }
}

customElements.define('k-products-gallery-widget', GalleryWidget);
