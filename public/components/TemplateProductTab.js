import ProductTab from '/products/components/ProductTab.js';
import { html, staticHtml, unsafeStatic } from '/kempo-ui/lit-all.min.js';
import '/kempo-ui/components/Tags.js';
import '/kempo-ui/components/HtmlEditor.js';
import '/kempo-ui/components/Spinner.js';
import '/products/components/MoneyInput.js';

/*
  The Product tab of a product template: what a product made from it starts with (its type, price, lowest price, price label,
  description, tags and categories). Its own Save button saves them.
*/
export default class TemplateProductTab extends ProductTab {
  readTags(){
    const $tags = this.renderRoot.querySelector('#templateTags');
    if(!$tags) return this.draft.product.tags;
    const pending = $tags.shadowRoot?.getElementById('tagsInput')?.value ?? '';
    return [...new Set(`${$tags.value ?? ''},${pending}`.split(',').map(tag => tag.trim().replace(/\s+/g, ' ').toLowerCase()).filter(Boolean))];
  }

  toggleCategory = (key, chosen) => {
    const { product } = this.draft;
    this.form.setProduct({ categories: chosen ? [...new Set([...product.categories, key])] : product.categories.filter(other => other !== key) });
  };

  render(){
    if(!this.ready) return html`<k-spinner></k-spinner>`;
    const { form, config } = this;
    const { product } = this.draft;
    const decimals = config.decimals;
    const editorTag = unsafeStatic(window.kempo?.componentOverrides?.['page-content-editor'] || 'k-html-editor');
    return html`
      <p class="tc-muted">What a product made from this template starts with. A product that sets one of these itself keeps its own; one that leaves it blank uses the template's.</p>
      <div class="d-f mb" style="gap: var(--spacer); align-items: flex-end;">
        <div class="flex" style="min-width: 12rem;">
          <label class="d-b mbq" for="templateProductType">Product type<small class="d-b tc-muted">Decides how it is delivered, such as whether it is shipped</small></label>
          <select id="templateProductType" class="full" @change=${event => form.setProduct({ productType: event.target.value })}>
            <option value="" ?selected=${product.productType === ''}>No default</option>
            ${form.productTypes.map(type => html`<option value=${type.key} ?selected=${product.productType === type.key}>${type.name}</option>`)}
          </select>
        </div>
      </div>
      <div class="d-f mb" style="gap: var(--spacer); align-items: flex-end;">
        <div class="flex" style="min-width: 10rem;">
          <label class="d-b mbq">Price (${config.currency.toUpperCase()})</label>
          <k-products-money decimals=${decimals} .value=${product.price} placeholder="No price" label="Price" @change=${event => form.setProduct({ price: event.detail.value })}></k-products-money>
        </div>
        <div class="flex" style="min-width: 10rem;">
          <label class="d-b mbq" for="templatePriceLabel">Shown when there is no price</label>
          <input type="text" id="templatePriceLabel" class="full" placeholder="Call for price" .value=${product.priceLabel} @input=${event => form.setProduct({ priceLabel: event.target.value })}>
        </div>
      </div>
      <div class="mb" style="max-width: 20rem;">
        <label class="d-b mbq">Lowest price after discounts (${config.currency.toUpperCase()})<small class="d-b tc-muted">Sales and codes never take the price below this. Blank has no limit.</small></label>
        <k-products-money decimals=${decimals} .value=${product.minimumPrice} placeholder="No minimum" label="Lowest price after discounts" @change=${event => form.setProduct({ minimumPrice: event.detail.value })}></k-products-money>
      </div>
      <div class="mb">
        <label class="d-b mbq" for="templateTags">Tags</label>
        <k-tags id="templateTags" .value=${product.tags.join(',')}></k-tags>
      </div>
      <div class="mb" role="group" aria-labelledby="templateCategoriesLabel">
        <div class="d-b mbq" id="templateCategoriesLabel">Categories</div>
        ${form.categories.length ? html`<div class="d-f" style="gap: var(--spacer_h) var(--spacer);">
          ${form.categories.map(category => html`<label class="checkbox m0"><input type="checkbox" value=${category.key} .checked=${product.categories.includes(category.key)} @change=${event => this.toggleCategory(category.key, event.target.checked)}> ${category.name}</label>`)}
        </div>` : html`<p class="tc-muted m0">There are no categories yet. <a href="/admin/extension/kempo-products/#categories">Add some</a>, then choose them here.</p>`}
      </div>
      <div class="mb">
        <div class="d-b mbq">Description</div>
        ${staticHtml`<${editorTag} id="templateProductDescription" class="r b" controls="full" mode="visual" style="height: 20rem;"
          .value=${product.description}
          @change=${event => form.setProduct({ description: event.target.getValue?.() ?? event.detail?.value ?? '' })}></${editorTag}>`}
      </div>
    `;
  }
}

customElements.define('k-products-template-product-tab', TemplateProductTab);
