import ShadowComponent from '/kempo-ui/components/ShadowComponent.js';
import { html, css, nothing } from '/kempo-ui/lit-all.min.js';
import '/products/components/ProductDetail.js';

/*
  The places a page built in the page builder can put widgets in the Product widget: the product page's own slots (see
  ProductDetail.js), without `top` and `bottom`, which are around the whole page.
*/
export const SLOTS = ['actions', 'before-options', 'before-description', 'after-description', 'extra', 'price'];

/*
  One product on a page built in the page builder: its picture, price, options and details, as on the product's own
  page. `product-id` is the product the settings name (an id, which survives a rename). The choices the buyer makes stay
  in the widget, not the address, so the page keeps its own address.

  The widgets placed in its slots (an Add to cart button under the options, say) are passed on to the product page's
  slots of the same name, so they sit where they would on the product's own page. A widget in a slot is a child of
  this element (the product page is in its shadow DOM, out of reach of `closest()`), so it finds the product with
  `closest('k-products-product-widget')`, which gives what a Parent Product and a product page give: `product`,
  `selections`, `price`, `complete`, `config` and `money(minor)`, and `selection-change` as the choices change. A slot
  with nothing in it is not passed on, so it takes no room.
*/
export default class ProductWidget extends ShadowComponent {
  static properties = {
    productId: { type: String, attribute: 'product-id' }
  };

  static styles = css`
    :host { display: block; }
  `;

  constructor(){
    super();
    this.productId = '';
    this.watcher = new MutationObserver(() => this.requestUpdate());
  }

  /*
    Lifecycle callbacks
  */
  connectedCallback(){
    super.connectedCallback();
    this.watcher.observe(this, { childList: true });
  }

  disconnectedCallback(){
    this.watcher.disconnect();
    super.disconnectedCallback();
  }

  /*
    What a part inside reads: the product page in the shadow DOM holds them
  */
  get detail(){
    return this.shadowRoot?.querySelector('k-products-detail') ?? null;
  }

  get product(){
    return this.detail?.product ?? null;
  }

  get selections(){
    return this.detail?.selections ?? {};
  }

  get price(){
    return this.detail?.price ?? null;
  }

  get complete(){
    return this.detail?.complete ?? false;
  }

  get config(){
    return this.detail?.config ?? null;
  }

  money(minor){
    return this.detail?.money(minor) ?? '';
  }

  /*
    Overridable
  */

  /* The slots passed on to the product page: the ones with something in them. */
  get passedOn(){
    return SLOTS.filter(name => [...this.children].some(child => child.slot === name));
  }

  /* Whether this is the builder's copy, which keeps a picture from opening fullscreen. */
  get editing(){
    return false;
  }

  /* Anything drawn under the product. */
  renderBelow(){
    return nothing;
  }

  render(){
    if(!this.productId) return nothing;
    return html`
      <k-products-detail .slug=${this.productId} .noUrl=${true} .noFullscreen=${this.editing}>
        ${this.passedOn.map(name => html`<slot name=${name} slot=${name}></slot>`)}
      </k-products-detail>
      ${this.renderBelow()}
    `;
  }
}

customElements.define('k-products-product-widget', ProductWidget);
