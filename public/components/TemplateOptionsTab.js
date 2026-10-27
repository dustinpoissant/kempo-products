import ProductTab from '/products/components/ProductTab.js';
import { html } from '/kempo-ui/lit-all.min.js';
import '/kempo-ui/components/Spinner.js';
import '/products/components/OptionsEditor.js';

/*
  The Options tab of a product template: what a buyer chooses on every product made from it. Its own Save button saves them.
*/
export default class TemplateOptionsTab extends ProductTab {
  render(){
    if(!this.ready) return html`<k-spinner></k-spinner>`;
    const { draft, form, config } = this;
    return html`
      <p class="tc-muted">What a buyer chooses (a colour, a size). Every product made from this template offers these. A product can add options of its own, or add choices to one of these.</p>
      <k-products-options-editor .value=${draft.options} decimals=${config.decimals} @change=${event => form.set({ options: event.detail.value })}></k-products-options-editor>
    `;
  }
}

customElements.define('k-products-template-options-tab', TemplateOptionsTab);
