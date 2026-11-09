import ShadowComponent from '/kempo-ui/components/ShadowComponent.js';
import { html, css, nothing } from '/kempo-ui/lit-all.min.js';
import '/kempo-ui/components/Combobox.js';
import '/kempo-ui/components/Icon.js';
import { getProducts } from '/products/sdk.js';
import { listOf, textOf } from '/products/utils/listValue.js';

/*
  Choose any number of products, in an order, served at /products/components/ProductSelector.js. The value is their
  slugs, comma separated (`camaro,mustang`), in the order chosen, which is what a list's `slugs` takes and shows them in.
  Each one is a chip with its name, buttons to move it up or down and to take it away, and typing in the box searches
  the catalogue as ProductPicker does.

    <k-products-product-selector name="slugs" value="camaro,mustang"></k-products-product-selector>

  It is a form input, so it submits under its `name`, and it fires `change` with detail `{ value }`.
*/
const LIMIT = 20;

export default class ProductSelector extends ShadowComponent {
  static formAssociated = true;

  static properties = {
    value: { type: String, reflect: true },
    name: { type: String, reflect: true },
    placeholder: { type: String },
    disabled: { type: Boolean, reflect: true },
    names: { state: true }
  };

  static styles = css`
    .chips {
      display: flex;
      flex-direction: column;
      gap: var(--spacer_q);
      margin-bottom: var(--spacer_q);
    }
    .chip {
      display: flex;
      align-items: center;
      gap: var(--spacer_q);
    }
    .chip span {
      flex: 1 1 auto;
    }
  `;

  constructor(){
    super();
    this.internals = this.attachInternals();
    this.value = '';
    this.name = '';
    this.placeholder = 'Search products';
    this.disabled = false;
    this.names = new Map();
  }

  connectedCallback(){
    super.connectedCallback();
    this.internals.setFormValue(this.value);
    this.loadNames();
  }

  willUpdate(changed){
    if(changed.has('value')){
      this.internals.setFormValue(this.value);
      this.loadNames();
    }
  }

  /*
    Public methods
  */

  /* The names of the chosen products, asked for once each; a slug with no product shows as it is. */
  loadNames = async () => {
    const missing = listOf(this.value).filter(slug => !this.names.has(slug));
    if(!missing.length) return;
    const [error, data] = await getProducts({ slugs: missing.join(','), limit: LIMIT });
    if(error) return;
    for(const product of data.items) this.names.set(product.slug, product.name);
    this.requestUpdate();
  };

  /*
    Event handlers
  */

  search = async event => {
    const [error, data] = await getProducts({ q: event.detail.value, limit: LIMIT, sort: 'name' });
    if(error) return;
    for(const product of data.items) this.names.set(product.slug, product.name);
    this.renderRoot.querySelector('k-combobox').setOptions(data.items.filter(product => !listOf(this.value).includes(product.slug)).map(product => ({ label: product.name, value: product.slug })));
  };

  add = event => {
    const slug = event.detail.value;
    if(!slug || listOf(this.value).includes(slug)) return;
    this.commit([...listOf(this.value), slug]);
  };

  move = (index, step) => {
    const slugs = listOf(this.value);
    const target = index + step;
    if(target < 0 || target >= slugs.length) return;
    [slugs[index], slugs[target]] = [slugs[target], slugs[index]];
    this.commit(slugs);
  };

  remove = slug => {
    this.commit(listOf(this.value).filter(item => item !== slug));
  };

  commit(slugs){
    this.value = textOf(slugs);
    this.dispatchEvent(new CustomEvent('change', { bubbles: true, detail: { value: this.value } }));
  }

  /*
    Drawing
  */

  render(){
    const chosen = listOf(this.value);
    return html`
      ${chosen.length ? html`<div class="chips">
        ${chosen.map((slug, index) => html`<div class="chip">
          <span class="btn">${this.names.get(slug) ?? slug}</span>
          <button type="button" class="no-btn" aria-label="Move up" ?disabled=${this.disabled || index === 0} @click=${() => this.move(index, -1)}><k-icon src="/kempo-ui/icons/arrow_drop_down.svg" rotation="180"></k-icon></button>
          <button type="button" class="no-btn" aria-label="Move down" ?disabled=${this.disabled || index === chosen.length - 1} @click=${() => this.move(index, 1)}><k-icon src="/kempo-ui/icons/arrow_drop_down.svg"></k-icon></button>
          <button type="button" class="no-btn" aria-label="Remove ${this.names.get(slug) ?? slug}" ?disabled=${this.disabled} @click=${() => this.remove(slug)}><k-icon src="/kempo-ui/icons/close.svg"></k-icon></button>
        </div>`)}
      </div>` : nothing}
      <k-combobox
        placeholder=${this.placeholder}
        ?disabled=${this.disabled}
        require-match
        @search=${this.search}
        @select=${this.add}
      ></k-combobox>
    `;
  }
}

customElements.define('k-products-product-selector', ProductSelector);
