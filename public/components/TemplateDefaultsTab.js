import ProductTab from '/products/components/ProductTab.js';
import { html } from '/kempo-ui/lit-all.min.js';
import '/kempo-ui/components/Spinner.js';
import '/products/components/AttributeInput.js';

/*
  The Defaults tab of a product template: the default value this template gives the attributes an administrator added for every
  product. Each extension that owns an attribute sets its default on its own tab. Its own Save button saves them.
*/
export default class TemplateDefaultsTab extends ProductTab {
  changeDefault = event => {
    event.stopPropagation();
    this.form.set({ defaults: { ...this.draft.defaults, [event.detail.key]: event.detail.value } });
  };

  render(){
    if(!this.ready) return html`<k-spinner></k-spinner>`;
    const { draft, form, config } = this;
    const attributes = form.shared.filter(attribute => !attribute.owner);
    return html`
      <p class="tc-muted">A product made from this template uses these unless it sets its own. Leave one empty for no default.</p>
      ${attributes.map(attribute => html`<k-products-attribute-input .attribute=${attribute} .value=${draft.defaults[attribute.key] ?? ''} .decimals=${config.decimals} .currency=${config.currency} @change=${this.changeDefault}></k-products-attribute-input>`)}
    `;
  }
}

customElements.define('k-products-template-defaults-tab', TemplateDefaultsTab);
