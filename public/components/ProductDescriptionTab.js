import ProductTab from '/products/components/ProductTab.js';
import { html, staticHtml, unsafeStatic } from '/kempo-ui/lit-all.min.js';
import '/kempo-ui/components/HtmlEditor.js';
import '/kempo-ui/components/Spinner.js';

/*
  The Description tab of the product form: the full rich text shown on the product's page. Its own Save button saves it.
*/
export default class ProductDescriptionTab extends ProductTab {
  render(){
    if(!this.ready) return html`<k-spinner></k-spinner>`;
    const { draft, form } = this;
    const editorTag = unsafeStatic(window.kempo?.componentOverrides?.['page-content-editor'] || 'k-html-editor');
    return html`
      <p class="tc-muted mb">Shown on the product's page. Use headings, lists, links and pictures to describe it.${form.base.description && !draft.description ? ' Left blank, this product uses its template\'s description.' : ''}</p>
      ${staticHtml`<${editorTag} id="description" class="r b" controls="full" mode="visual" style="height: 28rem;"
        .value=${draft.description}
        @change=${event => form.set({ description: event.target.getValue?.() ?? event.detail?.value ?? '' })}></${editorTag}>`}
    `;
  }
}

customElements.define('k-products-description-tab', ProductDescriptionTab);
