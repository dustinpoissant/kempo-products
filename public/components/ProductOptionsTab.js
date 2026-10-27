import ProductTab from '/products/components/ProductTab.js';
import { html } from '/kempo-ui/lit-all.min.js';
import '/kempo-ui/components/Icon.js';
import '/kempo-ui/components/Spinner.js';
import '/products/components/OptionsEditor.js';

/*
  The Options tab of the product form: the choices a buyer makes for this product, and the options its template offers, which a
  product can add choices to. Its own Save button saves them.
*/
export default class ProductOptionsTab extends ProductTab {
  /* Starts an option of the product's own with the key of one its template offers, so its choices are added to the template's. */
  extendOption = option => this.form.set({ options: [...this.draft.options, { key: option.key, label: option.label, required: option.required, priceType: option.priceType, choices: [{ label: '', price: 0, available: true }] }] });

  changeOptions = event => this.form.set({ options: event.detail.value });

  render(){
    if(!this.ready) return html`<k-spinner></k-spinner>`;
    const { form, draft, config } = this;
    const { template, managed } = form;
    return html`
      ${template?.options.length ? html`<div class="mb"><strong>From the ${template.name} template</strong>
        <small class="d-b tc-muted mbq">Every product made from this template offers these. To give this product more choices for one, add choices to it; they are added to the template's.</small>
        <ul class="mb">${template.options.map(option => html`<li>${option.label}: ${option.choices.map(choice => choice.label).join(', ')}
          ${draft.options.some(own => own.key === option.key)
            ? html`<span class="tc-muted">(this product's own choices are below)</span>`
            : html`<button type="button" class="btn" ?disabled=${Boolean(managed)} @click=${() => this.extendOption(option)}><k-icon name="add"></k-icon> Add choices</button>`}</li>`)}</ul></div>` : ''}
      <k-products-options-editor .value=${draft.options} decimals=${config.decimals} managed=${managed} @change=${this.changeOptions}></k-products-options-editor>
    `;
  }
}

customElements.define('k-products-options-tab', ProductOptionsTab);
