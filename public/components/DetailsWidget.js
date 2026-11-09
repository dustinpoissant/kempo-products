import ProductPart from '/products/components/ProductPart.js';
import { html, css, nothing } from '/kempo-ui/lit-all.min.js';

/*
  The attributes of the product in the Parent Product it sits in, as the table a product page shows (the value a product
  leaves blank comes from its template, as on the product page).
*/
class DetailsWidget extends ProductPart {
  static styles = css`
    :host { display: block; border-radius: var(--radius); }
    th { width: 40%; }
  `;

  rows(){
    const { product } = this;
    return this.parentProduct.attributes
      .map(attribute => [attribute, [undefined, null, ''].includes(product.attributes[attribute.key]) ? product.inherited?.[attribute.key] : product.attributes[attribute.key]])
      .filter(([, value]) => value !== undefined && value !== null && value !== '');
  }

  show(attribute, value){
    if(attribute.type === 'boolean') return value ? 'Yes' : 'No';
    if(attribute.type === 'rating') return `${value} / 5`;
    if(attribute.type === 'currency') return this.parentProduct.money(value);
    return String(value);
  }

  render(){
    if(!this.parentProduct) return html`<p class="tc-muted">Place this in a Parent Product</p>`;
    if(!this.product) return nothing;
    const rows = this.rows();
    if(!rows.length) return nothing;
    return html`<div class="table-wrapper mb"><table class="left-headers"><tbody>
      ${rows.map(([attribute, value]) => html`<tr><th scope="row">${attribute.label}</th><td>${this.show(attribute, value)}</td></tr>`)}
    </tbody></table></div>`;
  }
}

customElements.define('k-products-details-widget', DetailsWidget);
