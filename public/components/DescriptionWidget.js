import ProductPart from '/products/components/ProductPart.js';
import { html, css, nothing } from '/kempo-ui/lit-all.min.js';
import renderText from '/products/utils/renderText.js';

/*
  The full description of the product in the Parent Product it sits in, as the product page shows it across the whole width
  under the pictures and the form.
*/
class DescriptionWidget extends ProductPart {
  static styles = css`
    :host { display: block; }
  `;

  render(){
    if(!this.parentProduct) return html`<p class="tc-muted">Place this in a Parent Product</p>`;
    if(!this.product) return nothing;
    return renderText(this.product.description);
  }
}

customElements.define('k-products-description-widget', DescriptionWidget);
