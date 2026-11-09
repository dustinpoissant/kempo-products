import ProductPart from '/products/components/ProductPart.js';
import { html, css, nothing } from '/kempo-ui/lit-all.min.js';

/*
  The name of the product in the Parent Product it sits in, as its heading.
*/
class TitleWidget extends ProductPart {
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
    return html`<h1>${this.product.name}</h1>`;
  }
}

customElements.define('k-products-title-widget', TitleWidget);
