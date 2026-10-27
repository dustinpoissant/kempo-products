import ShadowComponent from '/kempo-ui/components/ShadowComponent.js';
import { html } from '/kempo-ui/lit-all.min.js';
import '/kempo-ui/components/Combobox.js';
import { getProducts, getProduct } from '/products/sdk.js';

/*
  Choose one product from the catalogue, served at /products/components/ProductPicker.js. It is a form input: its value is the product's
  id, so it submits with a form under its `name`. It searches the server as you type, so it works for any number of products, and it
  is the same wherever a product is chosen.

    <k-products-product-picker name="product" placeholder="Search products…"></k-products-product-picker>

  It fires `change` when a product is chosen (detail: { value, product }). Archived products are left out.
*/
const LIMIT = 20;

export default class ProductPicker extends ShadowComponent {
  static formAssociated = true;

  static properties = {
    value: { type: String, reflect: true },
    name: { type: String, reflect: true },
    placeholder: { type: String },
    disabled: { type: Boolean, reflect: true },
    label: { state: true },
  };

  constructor(){
    super();
    this.internals = this.attachInternals();
    this.value = '';
    this.name = '';
    this.placeholder = 'Search products…';
    this.disabled = false;
    this.label = '';
    this.found = new Map();
  }

  connectedCallback(){
    super.connectedCallback();
    this.showCurrent();
  }

  /* Shows the chosen product by name, when a value is given before the user has chosen anything. */
  showCurrent = async () => {
    if(!this.value || this.label) return;
    const [error, data] = await getProduct(this.value);
    if(!error) this.label = data.product.name;
  };

  /* The products whose name matches, or the first few by name when nothing is typed. */
  search = async event => {
    const [error, data] = await getProducts({ q: event.detail.value, limit: LIMIT, sort: 'name' });
    if(error) return;
    const products = data.items.filter(product => product.status !== 'archived');
    this.found = new Map(products.map(product => [product.id, product]));
    const options = products.map(product => ({ label: product.name, value: product.id }));
    this.renderRoot.querySelector('k-combobox').setOptions(options);
  };

  choose = event => {
    const id = event.detail.value;
    this.value = id;
    this.label = event.detail.label;
    this.internals.setFormValue(id);
    this.dispatchEvent(new CustomEvent('change', { bubbles: true, detail: { value: id, product: this.found.get(id) ?? null } }));
  };

  /* Editing the box after a choice clears the value, so a form cannot submit a product that is no longer shown. */
  clear = event => {
    if(event.target.value === this.label) return;
    this.value = '';
    this.label = '';
    this.internals.setFormValue('');
    this.dispatchEvent(new CustomEvent('change', { bubbles: true, detail: { value: '', product: null } }));
  };

  render(){
    return html`<k-combobox
      .value=${this.label}
      placeholder=${this.placeholder}
      ?disabled=${this.disabled}
      require-match
      @search=${this.search}
      @select=${this.choose}
      @input=${this.clear}></k-combobox>`;
  }
}

customElements.define('k-products-product-picker', ProductPicker);
