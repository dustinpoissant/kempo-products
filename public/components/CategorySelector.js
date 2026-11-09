import ShadowComponent from '/kempo-ui/components/ShadowComponent.js';
import { html, css, nothing } from '/kempo-ui/lit-all.min.js';
import '/kempo-ui/components/Combobox.js';
import '/kempo-ui/components/Icon.js';
import { getCategories } from '/products/sdk.js';
import { listOf, textOf } from '/products/utils/listValue.js';

/*
  Choose any number of categories, served at /products/components/CategorySelector.js. The value is their keys,
  comma separated (`shirts,hats`), which is what a list's `category` takes. Each one is shown by its name, as a chip
  with a button to take it away, and the choices left are offered as the box is typed in.

    <k-products-category-selector name="category" value="shirts,hats"></k-products-category-selector>

  It is a form input, so it submits under its `name`, and it fires `change` with detail `{ value }`.
*/
export default class CategorySelector extends ShadowComponent {
  static formAssociated = true;

  static properties = {
    value: { type: String, reflect: true },
    name: { type: String, reflect: true },
    placeholder: { type: String },
    disabled: { type: Boolean, reflect: true },
    categories: { state: true },
    failed: { state: true }
  };

  static styles = css`
    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: var(--spacer_q);
      margin-bottom: var(--spacer_q);
    }
  `;

  constructor(){
    super();
    this.internals = this.attachInternals();
    this.value = '';
    this.name = '';
    this.placeholder = 'Add a category';
    this.disabled = false;
    this.categories = null;
    this.failed = false;
  }

  connectedCallback(){
    super.connectedCallback();
    this.internals.setFormValue(this.value);
    getCategories().then(([error, data]) => {
      this.failed = !!error;
      this.categories = error ? [] : data.categories;
    });
  }

  willUpdate(changed){
    if(changed.has('value')) this.internals.setFormValue(this.value);
  }

  updated(){
    const combobox = this.renderRoot.querySelector('k-combobox');
    if(combobox && this.categories) combobox.setOptions(this.choices().map(category => ({ label: category.name, value: category.key })));
  }

  /*
    Event handlers
  */

  add = event => {
    const key = event.detail.value;
    if(!key || listOf(this.value).includes(key)) return;
    this.commit([...listOf(this.value), key]);
  };

  remove = key => {
    this.commit(listOf(this.value).filter(item => item !== key));
  };

  commit(keys){
    this.value = textOf(keys);
    this.dispatchEvent(new CustomEvent('change', { bubbles: true, detail: { value: this.value } }));
  }

  /*
    Drawing
  */

  choices(){
    const chosen = listOf(this.value);
    return (this.categories ?? []).filter(category => !chosen.includes(category.key));
  }

  nameOf(key){
    return this.categories?.find(category => category.key === key)?.name ?? key;
  }

  render(){
    const chosen = listOf(this.value);
    return html`
      ${chosen.length ? html`<div class="chips">
        ${chosen.map(key => html`<span class="btn">${this.nameOf(key)}<button type="button" class="no-btn" aria-label="Remove ${this.nameOf(key)}" ?disabled=${this.disabled} @click=${() => this.remove(key)}><k-icon src="/kempo-ui/icons/close.svg"></k-icon></button></span>`)}
      </div>` : nothing}
      <k-combobox
        placeholder=${this.failed ? 'Categories could not be loaded' : this.placeholder}
        ?disabled=${this.disabled || this.failed}
        @select=${this.add}
      ></k-combobox>
    `;
  }
}

customElements.define('k-products-category-selector', CategorySelector);
