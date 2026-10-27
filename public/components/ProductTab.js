import ShadowComponent from '/kempo-ui/components/ShadowComponent.js';
import { html } from '/kempo-ui/lit-all.min.js';
import '/kempo-ui/components/Spinner.js';
import '/products/components/AttributeInput.js';

/*
  The base of a product form tab, served at /products/components/ProductTab.js. A tab finds the form (`k-products-form` or `k-products-template-form`, the context
  that holds the product or template) with closest(), subscribes to it, and redraws whenever it changes. Its Save button calls the form, so it
  saves only what the tab holds. Tabs extend this class and are placed in the page's tabs.
*/
export default class ProductTab extends ShadowComponent {
  connectedCallback(){
    super.connectedCallback();
    this.form = this.closest('k-products-form, k-products-template-form');
    this.form?.subscribe(this);
  }

  disconnectedCallback(){
    this.form?.unsubscribe(this);
    super.disconnectedCallback();
  }

  get draft(){
    return this.form.draft;
  }

  get config(){
    return this.form.config;
  }

  get busy(){
    return this.form.saving;
  }

  /* Until the product and its settings have loaded there is nothing to show. */
  get ready(){
    return !this.form.loading && Boolean(this.form.config);
  }

  /* One attribute's input, which reports its value as a `change` with { key, value }. */
  renderAttributeInput = attribute => html`<k-products-attribute-input .attribute=${attribute} .value=${this.draft.attributes[attribute.key]} .fallback=${this.form.template?.defaults?.[attribute.key]} .decimals=${this.config.decimals} .currency=${this.config.currency} @change=${this.changeAttribute}></k-products-attribute-input>`;

  changeAttribute = event => {
    event.stopPropagation();
    this.form.set({ attributes: { ...this.draft.attributes, [event.detail.key]: event.detail.value } });
  };

}
