import ProductPart from '/products/components/ProductPart.js';
import { html, css, nothing } from '/kempo-ui/lit-all.min.js';
import renderText from '/products/utils/renderText.js';

/*
  The short description of the product in the Parent Product it sits in, as the product page shows it between the price and
  the options.
*/
class ShortDescriptionWidget extends ProductPart {
  static styles = css`
    :host { display: block; }
  `;

  render(){
    if(!this.parentProduct) return html`<p class="tc-muted">Place this in a Parent Product</p>`;
    if(!this.product) return nothing;
    return renderText(this.product.shortDescription);
  }
}

customElements.define('k-products-short-description-widget', ShortDescriptionWidget);
