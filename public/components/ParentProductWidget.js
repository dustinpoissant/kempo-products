import ShadowComponent from '/kempo-ui/components/ShadowComponent.js';
import { html, css } from '/kempo-ui/lit-all.min.js';
import { getConfig, getProduct, getPrice, displayMoney } from '/products/sdk.js';
import { usableDefaults } from '/products/utils/optionDefaults.js';

/*
  A product that the parts of a product page are placed in: the gallery, title, price, options, details and an add-to-cart
  button. It draws nothing itself. It loads the product, holds the choices a buyer makes and the price they give, and tells
  the parts inside it when either changes (`selection-change`, with the same detail as a product page, so an add-to-cart
  button reads it the same way).

  A part finds it with `closest('k-products-parent-widget')`, which works across the page's light DOM, so a part can sit
  in rows and columns anywhere inside it.
*/
export default class ParentProductWidget extends ShadowComponent {
  static properties = {
    productId: { type: String, attribute: 'product-id' },
    product: { state: true },
    attributes: { state: true },
    images: { state: true },
    config: { state: true },
    selections: { state: true },
    price: { state: true },
    pricing: { state: true },
    error: { state: true }
  };

  static styles = css`
    :host { display: block; }
  `;

  constructor(){
    super();
    this.productId = '';
    this.product = null;
    this.attributes = [];
    this.images = {};
    this.config = null;
    this.selections = {};
    this.price = null;
    this.pricing = false;
    this.error = '';
    this.priceRequest = 0;
  }

  get complete(){
    if(!this.product) return false;
    return this.product.options.every(option => !option.required || this.selections[option.key]);
  }

  willUpdate(changed){
    if(changed.has('productId')) this.load();
  }

  /*
    Public methods
  */

  /* The product is loaded again whenever the id changes; an answer for an id that is no longer chosen is dropped. */
  load = async () => {
    const productId = this.productId;
    if(!productId){
      this.product = null;
      this.announce();
      return;
    }
    const [[configError, config], [error, data]] = await Promise.all([getConfig(), getProduct(productId)]);
    if(productId !== this.productId) return;
    this.config = configError ? null : config;
    this.error = error ? error.msg : '';
    this.product = error ? null : data.product;
    this.attributes = error ? [] : data.attributes;
    this.images = error ? {} : data.images;
    this.selections = this.presets();
    this.refreshPrice();
  };

  /* A buyer's choice for one option; choosing nothing takes it away. */
  chooseOption(option, key){
    const selections = { ...this.selections };
    if(key) selections[option.key] = key; else delete selections[option.key];
    this.selections = selections;
    this.refreshPrice();
  }

  /* Starts the options on these choices (`{ optionKey: choiceKey }`), over the product's own defaults; an empty choice starts that option on nothing. */
  applyDefaults(choices){
    if(!this.product) return;
    const selections = { ...this.presets(), ...usableDefaults(this.product, choices) };
    for(const [key, choice] of Object.entries(choices)) if(choice === '') delete selections[key];
    this.selections = selections;
    this.refreshPrice();
  }

  /* The price for the choices, from the server. Until every required option is chosen there is no single price. */
  refreshPrice = async () => {
    const { product } = this;
    this.announce();
    if(!product || !this.config?.showPrices || product.price === null || !this.complete){
      this.price = null;
      this.pricing = false;
      this.announce();
      return;
    }
    const request = ++this.priceRequest;
    this.pricing = true;
    const [error, data] = await getPrice(product.id, this.selections);
    if(request !== this.priceRequest) return;
    this.pricing = false;
    this.price = error ? null : data.price;
    this.announce();
  };

  /* What the price line says, as a product page says it. */
  priceText(){
    const { product } = this;
    if(!product || !this.config) return '';
    if(!this.config.showPrices) return '';
    if(this.price) return this.money(this.price.unit);
    if(product.price === null) return product.priceLabel;
    const adjusts = product.options.some(option => option.priceType === 'adjust' && option.choices.some(choice => choice.price !== 0));
    return `${adjusts ? 'From ' : ''}${this.money(product.price)}`;
  }

  money(minor){
    return displayMoney(minor, this.config?.currency ?? 'usd');
  }

  /*
    Private methods
  */

  presets(){
    const selections = {};
    for(const option of this.product?.options ?? []){
      const preset = option.choices.find(choice => choice.default && choice.available);
      if(preset) selections[option.key] = preset.key;
    }
    return selections;
  }

  announce(){
    this.dispatchEvent(new CustomEvent('selection-change', {
      detail: { product: this.product, selections: { ...this.selections }, price: this.price, complete: this.complete },
      bubbles: true,
      composed: true,
    }));
  }

  render(){
    return html`<slot></slot>`;
  }
}

customElements.define('k-products-parent-widget', ParentProductWidget);
