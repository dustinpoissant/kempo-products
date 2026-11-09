import ProductPart from '/products/components/ProductPart.js';
import { html, css, nothing } from '/kempo-ui/lit-all.min.js';
import '/kempo-ui/components/Spinner.js';

/*
  The price of the product in the Parent Product it sits in, for the choices made so far, as a product page shows it.
*/
class PriceWidget extends ProductPart {
  static properties = {
    inline: { type: String }
  };

  static styles = css`
    :host { display: block; }
    :host([inline="true"]) { display: inline-block !important; }
  `;

  render(){
    if(!this.parentProduct) return html`<p class="tc-muted">Place this in a Parent Product</p>`;
    if(!this.product) return nothing;
    return html`<div class="large mb" aria-live="polite">${this.parentProduct.priceText()}${this.parentProduct.pricing ? html` <k-spinner size="xs"></k-spinner>` : nothing}</div>`;
  }
}

customElements.define('k-products-price-widget', PriceWidget);
