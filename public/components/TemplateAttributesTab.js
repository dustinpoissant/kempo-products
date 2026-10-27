import ProductTab from '/products/components/ProductTab.js';
import { html } from '/kempo-ui/lit-all.min.js';
import '/kempo-ui/components/Spinner.js';
import '/products/components/AttributesEditor.js';

/*
  The Attributes tab of a product template: the facts every product made from it has, such as a scale, each with the default value it
  shows until a product sets its own. Its own Save button saves them and their defaults.
*/
export default class TemplateAttributesTab extends ProductTab {
  render(){
    if(!this.ready) return html`<k-spinner></k-spinner>`;
    const { draft, form, config } = this;
    return html`
      <p class="tc-muted">The facts a product made from this template has, like a scale or a year. The buyer does not choose these. Give an attribute a default value and every product made from the template shows it, so it is not typed on each one. A product can add attributes of its own.</p>
      <k-products-attributes-editor .value=${draft.attributes} .config=${config} value-label="Default value" value-hint="Every product made from this template shows this unless it sets its own. Leave it empty for none." @change=${event => form.set({ attributes: event.detail.value })}></k-products-attributes-editor>
    `;
  }
}

customElements.define('k-products-template-attributes-tab', TemplateAttributesTab);
