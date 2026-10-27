import ProductTab from '/products/components/ProductTab.js';
import { html } from '/kempo-ui/lit-all.min.js';

/*
  The Details tab of a product template: its name and description. Its own Save button saves them.
*/
export default class TemplateDetailsTab extends ProductTab {
  render(){
    if(!this.ready) return html`<k-spinner></k-spinner>`;
    const { draft, form } = this;
    return html`
      ${form.owner ? html`<p class="tc-muted">Managed by the ${form.owner} extension. Its name can only be changed there; everything else you can edit here.</p>` : ''}
      <div class="mb"><label class="d-b mbq" for="templateName">Name *</label><input type="text" id="templateName" class="full" ?disabled=${Boolean(form.owner)} .value=${draft.name} @input=${event => form.set({ name: event.target.value })}></div>
      <div class="mb"><label class="d-b mbq" for="templateDescription">Description</label><textarea id="templateDescription" class="full" rows="3" .value=${draft.description} @input=${event => form.set({ description: event.target.value })}></textarea></div>
    `;
  }
}

customElements.define('k-products-template-details-tab', TemplateDetailsTab);
