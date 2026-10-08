import ShadowComponent from '/kempo-ui/components/ShadowComponent.js';
import { html } from '/kempo-ui/lit-all.min.js';
import '/kempo-ui/components/Icon.js';
import { displayMoney } from '/products/sdk.js';

/*
  One product in a list: its picture, name, price and whether it can be had. Give it the product as
  returned by the API, the map of image descriptions the API sent with it, and the site's config.

    <k-prod-card .product=${product} .images=${images} .config=${config}></k-prod-card>

  Slot `actions` holds anything an extension wants to add under the price (an add-to-cart button).
*/
export default class ProductCard extends ShadowComponent {
  static properties = {
    product: { attribute: false },
    images: { attribute: false },
    config: { attribute: false },
    href: { type: String },
  };

  constructor(){
    super();
    this.product = null;
    this.images = {};
    this.config = { currency: 'usd', decimals: 2, showPrices: true };
    this.href = '';
  }

  /*
    Utility functions
  */
  get link(){
    return this.href || `/products/${encodeURIComponent(this.product.slug)}/`;
  }

  get priceText(){
    const { product, config } = this;
    if(!config.showPrices) return '';
    if(product.price === null) return product.priceLabel || '';
    return displayMoney(product.price, config.currency, config.decimals);
  }

  get badge(){
    const { product } = this;
    if(product.availability === 'sold') return 'Sold';
    if(product.availability === 'pending') return 'Sale pending';
    if(!product.inStock) return 'Out of stock';
    return '';
  }

  /*
    View
  */
  render(){
    const { product } = this;
    if(!product) return html``;
    const image = this.images?.[product.images[0]];
    const badge = this.badge;
    return html`<article class="card" style="padding: 0; overflow: hidden; display: flex; flex-direction: column; height: 100%;">
      <a href=${this.link} class="no-link" style="display: block; position: relative; aspect-ratio: 4 / 3; background: var(--c_bg__alt, var(--c_bg)); overflow: hidden;" aria-label=${product.name}>
        ${image
          ? html`<img src=${image.path} alt=${image.alt || product.name} loading="lazy" style="width: 100%; height: 100%; object-fit: cover;">`
          : html`<span style="display: flex; align-items: center; justify-content: center; height: 100%; font-size: 2rem;" class="tc-muted"><k-icon name="image"></k-icon></span>`}
        ${badge ? html`<span class="bg-inv" style="position: absolute; top: var(--spacer_h); left: var(--spacer_h); padding: 0 var(--spacer_h); border-radius: var(--radius); font-size: 0.8rem;">${badge}</span>` : ''}
      </a>
      <div style="padding: var(--spacer); display: flex; flex-direction: column; gap: var(--spacer_q); flex: 1;">
        <h3 class="h5 m0"><a href=${this.link} class="no-link">${product.name}</a></h3>
        ${this.priceText ? html`<div class="tc-muted">${this.priceText}</div>` : ''}
        <slot name="actions"></slot>
      </div>
    </article>`;
  }
}

customElements.define('k-prod-card', ProductCard);
