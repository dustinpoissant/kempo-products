import ProductTab from '/products/components/ProductTab.js';
import { html } from '/kempo-ui/lit-all.min.js';
import '/kempo-ui/components/Spinner.js';

/*
  The Template tab of the product form: which template the product is made from, the attributes that template gives it (with its
  default shown under a blank one) and the options it offers. Its Save button saves the template choice; the template's attributes
  are saved with their own button, because they are the product's values.
*/
export default class ProductTemplateTab extends ProductTab {
  get templateAttributes(){
    return this.form.attributes.filter(attribute => attribute.fromTemplate);
  }

  changeTemplate = event => this.form.set({ template: event.target.value });

  saveTemplateAttributes = () => this.form.saveAttributes(this.templateAttributes.map(attribute => attribute.key));

  render(){
    if(!this.ready) return html`<k-spinner></k-spinner>`;
    const { draft, form } = this;
    const { template, owned } = form;
    return html`
      <div class="mb" style="max-width: 20rem;">
        <label class="d-b mbq" for="template">Template<small class="d-b tc-muted">What this product inherits: attributes, options and default values. It can add its own on top.</small></label>
        <select id="template" class="full" ?disabled=${owned} @change=${this.changeTemplate}>
          <option value="" ?selected=${draft.template === ''}>None</option>
          ${form.templates.map(candidate => html`<option value=${candidate.key} ?selected=${draft.template === candidate.key}>${candidate.name}</option>`)}
        </select>
      </div>
      ${template ? html`<small class="d-b mb"><a href=${`/admin/extension/kempo-products/template?key=${encodeURIComponent(template.key)}`}>Edit the ${template.name} template</a></small>` : ''}
      ${this.templateAttributes.length ? html`<h4 class="mt mb">${template.name} attributes</h4>${this.templateAttributes.map(this.renderAttributeInput)}` : ''}
      ${template?.options.length ? html`<h4 class="mt mb">${template.name} options</h4>
        <small class="d-b tc-muted mbq">Every product made from this template offers these. Change them on the template, or add choices to one on the Options tab.</small>
        <ul class="mb">${template.options.map(option => html`<li>${option.label}: ${option.choices.map(choice => choice.label).join(', ')}</li>`)}</ul>` : ''}
    `;
  }
}

customElements.define('k-products-template-tab', ProductTemplateTab);
