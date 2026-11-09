import ShadowComponent from '/kempo-ui/components/ShadowComponent.js';

/*
  The base of the parts of a product page (gallery, title, price, options, details). A part finds the Parent Product it
  sits in, and draws what that product says each time its choices or its price change. Without a Parent Product it draws
  nothing, so a part placed outside one shows no product rather than someone else's.
*/
export default class ProductPart extends ShadowComponent {
  connectedCallback(){
    super.connectedCallback();
    this.parentProduct = this.closest('k-products-parent-widget');
    this.parentProduct?.addEventListener('selection-change', this.refresh);
    this.requestUpdate();
  }

  disconnectedCallback(){
    this.parentProduct?.removeEventListener('selection-change', this.refresh);
    super.disconnectedCallback();
  }

  refresh = () => this.requestUpdate();

  get product(){
    return this.parentProduct?.product ?? null;
  }
}
