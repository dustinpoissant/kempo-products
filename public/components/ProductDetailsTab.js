import ProductTab from '/products/components/ProductTab.js';
import { html } from '/kempo-ui/lit-all.min.js';
import '/kempo-ui/components/Tags.js';
import '/products/components/MoneyInput.js';

/*
  The Details tab of the product form: the name and address, the product type, status and availability, price, quantity, tags and
  categories. Its own Save button saves these.
*/
export default class ProductDetailsTab extends ProductTab {
  readTags(){
    const $tags = this.renderRoot.querySelector('#tags');
    if(!$tags) return this.draft.tags;
    const pending = $tags.shadowRoot?.getElementById('tagsInput')?.value ?? '';
    return [...new Set(`${$tags.value ?? ''},${pending}`.split(',').map(tag => tag.trim().replace(/\s+/g, ' ').toLowerCase()).filter(Boolean))];
  }

  handleName = event => {
    const name = event.target.value;
    const changes = { name };
    if(!this.form.slugEdited && !this.form.editing) changes.slug = name.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
    this.form.set(changes);
  };

  handleSlug = event => {
    this.form.slugEdited = true;
    this.form.set({ slug: event.target.value });
  };

  handleQuantity = event => {
    const value = event.target.value;
    this.form.set({ quantity: value === '' ? -1 : Number(value) });
  };

  changeType = event => {
    const creditsOnly = event.target.value === 'credits-only';
    this.form.set({ productType: event.target.value, creditsOnly, ...(creditsOnly ? { creditPercent: 0 } : {}) });
  };

  /* The categories the product is in: a checkbox for each one the site has. */
  renderCategories(){
    const { categories } = this.form;
    const { draft } = this;
    return html`<div class="mb" id="categories" role="group" aria-labelledby="categoriesLabel">
      <div class="d-b mbq" id="categoriesLabel">Categories<small class="d-b tc-muted">${categories.length ? 'Choose any number. Shoppers browse by category.' : 'Shoppers browse by category.'}</small></div>
      ${categories.length ? html`<div class="d-f" style="gap: var(--spacer_h) var(--spacer);">
        ${categories.map(category => html`<label class="checkbox m0"><input type="checkbox" name="category" value=${category.key} .checked=${draft.categories.includes(category.key)} @change=${event => this.toggleCategory(category.key, event.target.checked)}> ${category.name}</label>`)}
      </div>` : html`<p class="tc-muted m0">There are no categories yet. <a href="/admin/extension/kempo-products/#categories">Add some</a>, then choose them here.</p>`}
    </div>`;
  }

  toggleCategory = (key, chosen) => {
    const without = this.draft.categories.filter(existing => existing !== key);
    this.form.set({ categories: chosen ? [...without, key] : without });
  };

  render(){
    if(!this.ready) return html`<k-spinner></k-spinner>`;
    const { draft, config, form } = this;
    const { owned, managed, base } = form;
    const decimals = config.decimals;
    return html`
      ${owned ? html`<p class="tc-muted">Managed by the ${form.original.owner} extension. Its name and slug can only be changed there; everything else you can edit here.</p>` : ''}
      <div class="mb">
        <label class="d-b mbq" for="name">Name *</label>
        <input type="text" id="name" class="full" .value=${draft.name} ?disabled=${owned} @input=${this.handleName}>
      </div>
      <div class="d-f mb" style="gap: var(--spacer); align-items: flex-end;">
        <div class="flex" style="min-width: 12rem;">
          <label class="d-b mbq" for="slug">URL<small class="d-b tc-muted">/products/${draft.slug || '…'}/</small></label>
          <input type="text" id="slug" class="full" placeholder="made from the name" autocapitalize="off" .value=${draft.slug} ?disabled=${owned} @input=${this.handleSlug}>
        </div>
        ${form.productTypes.length > 1 || base.productType ? html`<div class="flex" style="min-width: 10rem;">
          <label class="d-b mbq" for="productType">Product type<small class="d-b tc-muted">Decides how it is delivered, such as whether it is shipped</small></label>
          <select id="productType" class="full" ?disabled=${owned} @change=${this.changeType}>
            <option value="" ?selected=${draft.productType === ''}>${base.productType ? `The template's (${form.inheritedTypeName})` : `Default (${form.inheritedTypeName})`}</option>
            ${form.productTypes.map(productType => html`<option value=${productType.key} ?selected=${draft.productType === productType.key}>${productType.name}</option>`)}
          </select>
        </div>` : ''}
      </div>
      <div class="d-f mb" style="gap: var(--spacer); align-items: flex-end;">
        <div class="flex" style="min-width: 10rem;">
          <label class="d-b mbq" for="status">Status<small class="d-b tc-muted">Only published products are public.</small></label>
          <select id="status" class="full" @change=${event => form.set({ status: event.target.value })}>
            ${config.statuses.map(status => html`<option value=${status} ?selected=${draft.status === status}>${status[0].toUpperCase()}${status.slice(1)}</option>`)}
          </select>
        </div>
        <div class="flex" style="min-width: 10rem;">
          <label class="d-b mbq" for="availability">Availability</label>
          <select id="availability" class="full" @change=${event => form.set({ availability: event.target.value })}>
            ${config.availabilities.map(value => html`<option value=${value} ?selected=${draft.availability === value}>${value[0].toUpperCase()}${value.slice(1)}</option>`)}
          </select>
        </div>
      </div>
      <div class="d-f mb" style="gap: var(--spacer); align-items: flex-end;">
        <div class="flex" style="min-width: 10rem;">
          <label class="d-b mbq">Price (${config.currency.toUpperCase()})</label>
          <k-products-money decimals=${decimals} .value=${draft.price} placeholder=${base.price != null ? `Template: ${form.money(base.price)}` : 'No price'} label="Price" @change=${event => form.set({ price: event.detail.value })}></k-products-money>
        </div>
        <div class="flex" style="min-width: 10rem;">
          <label class="d-b mbq" for="priceLabel">Shown when there is no price</label>
          <input type="text" id="priceLabel" class="full" placeholder=${base.priceLabel || 'Call for price'} .value=${draft.priceLabel} @input=${event => form.set({ priceLabel: event.target.value })}>
        </div>
        <div style="width: 9rem;">
          <label class="d-b mbq" for="quantity">Quantity<small class="d-b tc-muted">${managed ? `Kept up to date by ${managed}.` : 'Blank is unlimited.'}</small></label>
          <input type="number" id="quantity" class="full" min="0" step="1" placeholder="Unlimited" .value=${draft.quantity === -1 ? '' : String(draft.quantity)} ?disabled=${Boolean(managed)} @input=${this.handleQuantity}>
        </div>
      </div>
      <div class="mb" style="max-width: 20rem;">
        <label class="d-b mbq">Lowest price after discounts (${config.currency.toUpperCase()})<small class="d-b tc-muted">Sales and codes never take the price below this. Blank has no limit.</small></label>
        <k-products-money decimals=${decimals} .value=${draft.minimumPrice} placeholder=${base.minimumPrice != null ? `Template: ${form.money(base.minimumPrice)}` : 'No minimum'} label="Lowest price after discounts" @change=${event => form.set({ minimumPrice: event.detail.value })}></k-products-money>
      </div>
      <div class="mb">
        <label class="d-b mbq" for="tags">Tags</label>
        ${base.tags?.length && !draft.tags.length ? html`<small class="d-b tc-muted">Blank uses the template's tags: ${base.tags.join(', ')}.</small>` : ''}
        <k-tags id="tags" .value=${draft.tags.join(',')}></k-tags>
      </div>
      ${this.renderCategories()}
      <div class="d-f" style="gap: var(--spacer_h); flex-wrap: wrap;">
        ${form.editing ? html`<a class="btn" href=${`/products/${form.original.slug}/`} target="_blank" rel="noopener" title=${form.original.status === 'published' ? 'Open the product page on the live site' : `This product is ${form.original.status}, so only people who manage products can see its page`}><k-icon name="link"></k-icon> View on site</a>` : ''}
      </div>
    `;
  }
}

customElements.define('k-products-details-tab', ProductDetailsTab);
