import ShadowComponent from '/kempo-ui/components/ShadowComponent.js';
import { html, staticHtml, unsafeStatic } from '/kempo-ui/lit-all.min.js';
import Toast from '/kempo-ui/components/Toast.js';
import '/kempo-ui/components/Spinner.js';
import '/kempo-ui/components/Tabs.js';
import '/kempo-ui/components/Tags.js';
import '/kempo-ui/components/HtmlEditor.js';
import '/products/components/MoneyInput.js';
import { getConfig, getTemplates, getAttributes, getProductTypes, getCategories, createTemplate, updateTemplate, formatMoney } from '/products/sdk.js';
import { flash } from '/products/components/ProductForm.js';
import '/products/components/AttributeInput.js';
import '/products/components/OptionsEditor.js';
import { keyFromLabel } from '/products/components/AttributesEditor.js';

const LIST = '/admin/extension/kempo-products/templates';

/* What a product made from the template starts with, as the Product tab edits it. */
const BLANK_PRODUCT = { productType: '', price: null, minimumPrice: null, priceLabel: '', description: '', tags: [], categories: [] };

const blank = value => value === null || value === undefined || value === '';

/*
  A product template on a page of its own, in tabs like a product: Details (name and description), Options (what a
  buyer chooses on every product made from it) and Attributes (the facts those products have, each with the value they
  show until they set their own). The attributes every product has, such as the shipping ones, can have a default for
  the template too, in the same tab the product form puts them in. One Save covers everything.

    <k-products-template-form from-url></k-products-template-form>

  With `from-url` the template is the `?key=` of the page; without one a new template is made.
*/
export default class TemplateForm extends ShadowComponent {
  static properties = {
    fromUrl: { type: Boolean, attribute: 'from-url' },
    key: { type: String },
    draft: { state: true },
    shared: { state: true },
    productTypes: { state: true },
    categories: { state: true },
    config: { state: true },
    loading: { state: true },
    saving: { state: true },
    error: { state: true },
  };

  constructor(){
    super();
    this.fromUrl = false;
    this.key = '';
    this.draft = { name: '', description: '', options: [], attributes: [], defaults: {}, product: { ...BLANK_PRODUCT } };
    this.productTypes = [];
    this.categories = [];
    this.shared = [];
    this.config = { decimals: 2, currency: 'USD', attributeTypes: [], conversions: {} };
    this.loading = true;
    this.saving = false;
    this.error = '';
    this.owner = '';
  }

  /*
    Lifecycle callbacks
  */
  connectedCallback(){
    super.connectedCallback();
    if(this.fromUrl) this.key = new URLSearchParams(location.search).get('key') ?? '';
    this.load();
  }

  /*
    Utility functions
  */
  get editing(){
    return Boolean(this.key);
  }

  load = async () => {
    const [[configError, config], [templatesError, templates], [fieldsError, attributes], [typesError, types], [categoriesError, categories]] = await Promise.all([getConfig(), getTemplates(), getAttributes(), getProductTypes(), getCategories()]);
    if(configError || templatesError || fieldsError || typesError || categoriesError){
      this.error = (configError || templatesError || fieldsError || typesError || categoriesError).msg;
      this.loading = false;
      return;
    }
    this.config = config;
    this.productTypes = types.productTypes;
    this.categories = categories.categories;
    this.shared = attributes.attributes.map(attribute => ({ ...attribute, required: false }));
    let template = { name: '', description: '', options: [], attributes: [], defaults: {}, owner: '' };
    if(this.editing){
      template = templates.templates.find(candidate => candidate.key === this.key);
      if(!template){
        this.error = 'That template does not exist.';
        this.loading = false;
        return;
      }
    }
    this.owner = template.owner;
    const own = new Set(template.attributes.map(attribute => attribute.key));
    this.draft = {
      name: template.name,
      description: template.description ?? '',
      options: structuredClone(template.options ?? []),
      attributes: template.attributes.map(attribute => ({ ...attribute, default: template.defaults?.[attribute.key] ?? '' })),
      defaults: Object.fromEntries(Object.entries(template.defaults ?? {}).filter(([key]) => !own.has(key))),
      product: { ...BLANK_PRODUCT, ...(template.product ?? {}) },
    };
    this.loading = false;
  };

  set = changes => {
    this.draft = { ...this.draft, ...changes };
  };

  setProduct = changes => this.set({ product: { ...this.draft.product, ...changes } });

  /* k-tags holds its value as comma separated text; text still in its box counts too. */
  readTags = () => {
    const $tags = this.shadowRoot?.getElementById('templateTags');
    if(!$tags) return this.draft.product.tags;
    const pending = $tags.shadowRoot?.getElementById('tagsInput')?.value ?? '';
    return [...new Set(`${$tags.value ?? ''},${pending}`.split(',').map(tag => tag.trim().replace(/\s+/g, ' ').toLowerCase()).filter(Boolean))];
  };

  toggleCategory = (key, chosen) => this.setProduct({ categories: chosen ? [...new Set([...this.draft.product.categories, key])] : this.draft.product.categories.filter(other => other !== key) });

  /* The tabs holding defaults for the attributes every product has: one for each group that names a tab, then Defaults for the rest. */
  get defaultTabs(){
    const tabs = new Map();
    for(const attribute of this.shared.filter(candidate => candidate.tab)){
      if(!tabs.has(attribute.tab)) tabs.set(attribute.tab, { name: attribute.tab, label: attribute.tab.charAt(0).toUpperCase() + attribute.tab.slice(1).replace(/-/g, ' '), attributes: [] });
      tabs.get(attribute.tab).attributes.push(attribute);
    }
    const rest = this.shared.filter(attribute => !attribute.tab);
    return [...tabs.values(), ...(rest.length ? [{ name: 'defaults', label: 'Defaults', attributes: rest }] : [])];
  }

  /*
    Event handlers
  */
  save = async event => {
    event.preventDefault();
    const { draft } = this;
    if(!draft.name.trim()){
      Toast.error('A name is required');
      return;
    }
    const attributes = draft.attributes.map(({ default: value, ...attribute }) => ({ ...attribute, key: attribute.key || keyFromLabel(attribute.label) }));
    const defaults = { ...draft.defaults };
    for(const [index, attribute] of draft.attributes.entries()) if(!blank(attribute.default)) defaults[attributes[index].key] = attribute.default;
    const body = { description: draft.description, options: draft.options, attributes, defaults, product: { ...draft.product, tags: this.readTags() }, ...(this.owner ? {} : { name: draft.name }) };
    this.saving = true;
    const [error] = this.editing ? await updateTemplate(this.key, body) : await createTemplate({ ...body, name: draft.name });
    this.saving = false;
    if(error){
      Toast.error(error.msg);
      return;
    }
    flash(`Saved ${draft.name}`);
    location.assign(LIST);
  };

  cancel = () => location.assign(LIST);

  /*
    View
  */
  renderProduct(){
    const { product } = this.draft;
    const decimals = this.config.decimals;
    const editorTag = unsafeStatic(window.kempo?.componentOverrides?.['page-content-editor'] || 'k-html-editor');
    return html`
      <p class="tc-muted">What a product made from this template starts with. A product that sets one of these itself keeps its own; one that leaves it blank uses the template's.</p>
      <div class="d-f mb" style="gap: var(--spacer); align-items: flex-end;">
        <div class="flex" style="min-width: 12rem;">
          <label class="d-b mbq" for="templateProductType">Product type<small class="d-b tc-muted">Decides how it is delivered, such as whether it is shipped</small></label>
          <select id="templateProductType" class="full" @change=${event => this.setProduct({ productType: event.target.value })}>
            <option value="" ?selected=${product.productType === ''}>No default</option>
            ${this.productTypes.map(type => html`<option value=${type.key} ?selected=${product.productType === type.key}>${type.name}</option>`)}
          </select>
        </div>
      </div>
      <div class="d-f mb" style="gap: var(--spacer); align-items: flex-end;">
        <div class="flex" style="min-width: 10rem;">
          <label class="d-b mbq">Price (${this.config.currency.toUpperCase()})</label>
          <k-products-money decimals=${decimals} .value=${product.price} placeholder="No price" label="Price" @change=${event => this.setProduct({ price: event.detail.value })}></k-products-money>
        </div>
        <div class="flex" style="min-width: 10rem;">
          <label class="d-b mbq" for="templatePriceLabel">Shown when there is no price</label>
          <input type="text" id="templatePriceLabel" class="full" placeholder="Call for price" .value=${product.priceLabel} @input=${event => this.setProduct({ priceLabel: event.target.value })}>
        </div>
      </div>
      <div class="mb" style="max-width: 20rem;">
        <label class="d-b mbq">Lowest price after discounts (${this.config.currency.toUpperCase()})<small class="d-b tc-muted">Sales and codes never take the price below this. Blank has no limit.</small></label>
        <k-products-money decimals=${decimals} .value=${product.minimumPrice} placeholder="No minimum" label="Lowest price after discounts" @change=${event => this.setProduct({ minimumPrice: event.detail.value })}></k-products-money>
      </div>
      <div class="mb">
        <label class="d-b mbq" for="templateTags">Tags</label>
        <k-tags id="templateTags" .value=${product.tags.join(',')}></k-tags>
      </div>
      <div class="mb" role="group" aria-labelledby="templateCategoriesLabel">
        <div class="d-b mbq" id="templateCategoriesLabel">Categories</div>
        ${this.categories.length ? html`<div class="d-f" style="gap: var(--spacer_h) var(--spacer);">
          ${this.categories.map(category => html`<label class="checkbox m0"><input type="checkbox" value=${category.key} .checked=${product.categories.includes(category.key)} @change=${event => this.toggleCategory(category.key, event.target.checked)}> ${category.name}</label>`)}
        </div>` : html`<p class="tc-muted m0">There are no categories yet. <a href="/admin/extension/kempo-products/categories">Add some</a>, then choose them here.</p>`}
      </div>
      <div class="mb">
        <div class="d-b mbq">Description</div>
        ${staticHtml`<${editorTag} id="templateProductDescription" class="r b" controls="full" mode="visual" style="height: 20rem;"
          .value=${product.description}
          @change=${event => this.setProduct({ description: event.target.getValue?.() ?? event.detail?.value ?? '' })}></${editorTag}>`}
      </div>
    `;
  }

  renderDefaults(attributes){
    return html`
      <p class="tc-muted">A product made from this template uses these unless it sets its own. Leave one empty for no default.</p>
      ${attributes.map(attribute => html`<k-products-attribute-input .attribute=${attribute} .value=${this.draft.defaults[attribute.key] ?? ''} .decimals=${this.config.decimals} .currency=${this.config.currency} @change=${event => this.set({ defaults: { ...this.draft.defaults, [event.detail.key]: event.detail.value } })}></k-products-attribute-input>`)}
    `;
  }

  render(){
    if(this.loading) return html`<k-spinner></k-spinner>`;
    if(this.error) return html`<p class="tc-danger">${this.error}</p>`;
    const { draft } = this;
    return html`<form @submit=${this.save}>
      ${this.owner ? html`<p class="tc-muted">Managed by the ${this.owner} extension. Its name can only be changed there; everything else you can edit here.</p>` : ''}
      <k-tabs class="mb">
        <k-tab for="details">Details</k-tab>
        <k-tab for="product">Product</k-tab>
        <k-tab for="options">Options</k-tab>
        <k-tab for="attributes">Attributes</k-tab>
        ${this.defaultTabs.map(tab => html`<k-tab for=${tab.name}>${tab.label}</k-tab>`)}
        <k-tab-content name="details" class="pt">
          <div class="mb"><label class="d-b mbq" for="templateName">Name *</label><input type="text" id="templateName" class="full" ?disabled=${Boolean(this.owner)} .value=${draft.name} @input=${event => this.set({ name: event.target.value })}></div>
          <div class="mb"><label class="d-b mbq" for="templateDescription">Description</label><textarea id="templateDescription" class="full" rows="3" .value=${draft.description} @input=${event => this.set({ description: event.target.value })}></textarea></div>
        </k-tab-content>
        <k-tab-content name="product" class="pt">${this.renderProduct()}</k-tab-content>
        <k-tab-content name="options" class="pt">
          <p class="tc-muted">What a buyer chooses (a colour, a size). Every product made from this template offers these. A product can add options of its own, or add choices to one of these.</p>
          <k-products-options-editor .value=${draft.options} decimals=${this.config.decimals} @change=${event => this.set({ options: event.detail.value })}></k-products-options-editor>
        </k-tab-content>
        <k-tab-content name="attributes" class="pt">
          <p class="tc-muted">The facts a product made from this template has, like a scale or a year. The buyer does not choose these. Give an attribute a default value and every product made from the template shows it, so it is not typed on each one. A product can add attributes of its own.</p>
          <k-products-attributes-editor .value=${draft.attributes} .config=${this.config} value-label="Default value" value-hint="Every product made from this template shows this unless it sets its own. Leave it empty for none." @change=${event => this.set({ attributes: event.detail.value })}></k-products-attributes-editor>
        </k-tab-content>
        ${this.defaultTabs.map(tab => html`<k-tab-content name=${tab.name} class="pt">${this.renderDefaults(tab.attributes)}</k-tab-content>`)}
      </k-tabs>
      <div class="d-f" style="gap: var(--spacer_h); flex-wrap: wrap;">
        <button type="submit" class="btn success" id="saveTemplate" ?disabled=${this.saving || !draft.name.trim()} title=${draft.name.trim() ? '' : 'Still needed: a name'}>${this.saving ? 'Saving…' : this.editing ? 'Save' : 'Create template'}</button>
        <button type="button" class="btn" id="cancelTemplate" ?disabled=${this.saving} @click=${this.cancel}>Cancel</button>
      </div>
    </form>`;
  }
}

customElements.define('k-products-template-form', TemplateForm);
