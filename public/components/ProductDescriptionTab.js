import ProductTab from '/products/components/ProductTab.js';
import { html, staticHtml, unsafeStatic } from '/kempo-ui/lit-all.min.js';
import '/kempo-ui/components/HtmlEditor.js';
import '/kempo-ui/components/Spinner.js';

/*
  The Description tab of the product form: the short description (a few lines, shown between the price and the options)
  and then the full description (shown full width under the picture and the form). Its own Save button saves both.
*/
export default class ProductDescriptionTab extends ProductTab {
  render(){
    if(!this.ready) return html`<k-spinner></k-spinner>`;
    const { draft, form } = this;
    const editorTag = unsafeStatic(window.kempo?.componentOverrides?.['page-content-editor'] || 'k-html-editor');
    const editor = (id, field, height) => staticHtml`<${editorTag} id=${id} class="r b" controls="full" mode="visual" style=${`height: ${height};`}
        .value=${draft[field]}
        @change=${event => form.set({ [field]: event.target.getValue?.() ?? event.detail?.value ?? '' })}></${editorTag}>`;
    return html`
      <div class="mb">
        <label class="d-b mbq" for="shortDescription">Short description<small class="d-b tc-muted">A few lines shown on the product's page between the price and the options.${form.base.shortDescription && !draft.shortDescription ? ' Left blank, this product uses its template\'s short description.' : ''}</small></label>
        ${editor('shortDescription', 'shortDescription', '12rem')}
      </div>
      <div class="mb">
        <label class="d-b mbq" for="description">Description<small class="d-b tc-muted">The full text, shown across the whole page under the pictures and the form. Use headings, lists, links and pictures.${form.base.description && !draft.description ? ' Left blank, this product uses its template\'s description.' : ''}</small></label>
        ${editor('description', 'description', '28rem')}
      </div>
    `;
  }
}

customElements.define('k-products-description-tab', ProductDescriptionTab);
