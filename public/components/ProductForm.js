import ShadowComponent from '/kempo-ui/components/ShadowComponent.js';
import { html, staticHtml, unsafeStatic } from '/kempo-ui/lit-all.min.js';
import Toast from '/kempo-ui/components/Toast.js';
import Dialog from '/kempo-ui/components/Dialog.js';
import '/kempo-ui/components/Tags.js';
import '/kempo-ui/components/Spinner.js';
import '/kempo-ui/components/Tabs.js';
import '/kempo-ui/components/HtmlEditor.js';
import { getConfig, getProduct, getTypes, getFields, createProduct, updateProduct } from '/products/sdk.js';
import '/products/components/MoneyInput.js';
import '/products/components/FieldInput.js';
import '/products/components/OptionsEditor.js';
import '/products/components/ImagesField.js';

const FLASH_KEY = 'products.flash';

/* The message a page shows once, on the next page. */
export const flash = message => {
  try { sessionStorage.setItem(FLASH_KEY, JSON.stringify({ message })); } catch { /* the message is just not shown */ }
};

export const showFlash = () => {
  try {
    const raw = sessionStorage.getItem(FLASH_KEY);
    if(!raw) return;
    sessionStorage.removeItem(FLASH_KEY);
    const { message } = JSON.parse(raw);
    if(message) Toast.success(message);
  } catch { /* nothing to show */ }
};

/* A path on this site, or the fallback: never another site's address (an open redirect). */
export const safeNext = (value, fallback) => (typeof value === 'string' && /^\/(?!\/|\\)/.test(value) ? value : fallback);

const blank = () => ({
  name: '', slug: '', type: '', description: '', status: 'draft', availability: 'available', price: null, priceLabel: '',
  stock: -1, tags: [], images: [], fields: {}, options: [],
});

/*
  Adds or edits a product, on one page split into tabs: Details (the basics, price, stock and the
  fields of the product's type), Description (a full rich text editor), Media (pictures) and
  Options. Pass `product-id` to edit; without it, a new product is
  made. With `from-url` it takes both from the address instead (?id= and ?next=). After saving it
  goes to `next` (a path on this site), where the list shows a message.

    <k-prod-form product-id="1969-camaro" next="/admin/extension/kempo-products/"></k-prod-form>

  Extensions add their own tabs without this file knowing about them. A <k-prod-tab> placed
  directly inside the form becomes a tab after the built-in ones, in the order it appears:

    <k-prod-form>
      <k-prod-tab name="shipping" label="Shipping"> ...anything... </k-prod-tab>
    </k-prod-form>

  The admin pages put a <location name="products-admin-product-tabs"> inside the form, so an
  extension only ships an admin/*.global.html that pushes its <k-prod-tab> there. What it holds
  can listen to two events on the form:

    `draft-change`     fired as the form is edited, with { changed, draft }
    `product-saved`    fired once the product is stored, with { product, created, waitUntil }. A
                       tab that has more to save (the product's materials, say) calls
                       waitUntil(promise) and the page waits for it before leaving.
*/
export default class ProductForm extends ShadowComponent {
  static properties = {
    productId: { type: String, attribute: 'product-id' },
    next: { type: String },
    fromUrl: { type: Boolean, attribute: 'from-url' },
    loading: { state: true },
    saving: { state: true },
    config: { state: true },
    types: { state: true },
    allFields: { state: true },
    original: { state: true },
    draft: { state: true },
    assets: { state: true },
    slugEdited: { state: true },
    error: { state: true },
  };

  constructor(){
    super();
    this.productId = '';
    this.next = '/admin/extension/kempo-products/';
    this.fromUrl = false;
    this.loading = true;
    this.saving = false;
    this.config = null;
    this.types = [];
    this.allFields = [];
    this.original = null;
    this.draft = blank();
    this.assets = {};
    this.slugEdited = false;
    this.error = '';
    this.leaving = false;
    this.opened = null;
    this.extraTabs = [];
  }

  /*
    Lifecycle callbacks
  */
  connectedCallback(){
    super.connectedCallback();
    window.addEventListener('beforeunload', this.warn);
    this.extraTabs = [...this.querySelectorAll(':scope > k-prod-tab')].map($tab => {
      const name = $tab.getAttribute('name') || $tab.getAttribute('label') || 'tab';
      $tab.slot = `tab-${name}`;
      $tab.style.display = 'block';
      return { name, label: $tab.getAttribute('label') || name };
    });
    if(this.fromUrl){
      const params = new URLSearchParams(location.search);
      this.productId = params.get('id') ?? '';
      this.next = safeNext(params.get('next'), this.next);
    }
    this.load();
  }

  disconnectedCallback(){
    window.removeEventListener('beforeunload', this.warn);
    super.disconnectedCallback();
  }

  /*
    Utility functions
  */
  load = async () => {
    const [[configError, config], [typesError, types], [fieldsError, fields]] = await Promise.all([getConfig(), getTypes(), getFields()]);
    if(configError || typesError || fieldsError){
      this.error = (configError || typesError || fieldsError).msg;
      this.loading = false;
      return;
    }
    this.config = config;
    this.types = types.types;
    this.allFields = fields.fields;
    if(this.productId){
      const [error, data] = await getProduct(this.productId);
      if(error){
        this.error = error.code === 404 ? 'Product not found.' : error.msg;
        this.loading = false;
        return;
      }
      this.original = data.product;
      this.assets = data.images;
      this.slugEdited = true;
      this.draft = { ...blank(), ...data.product, fields: { ...data.product.fields }, options: structuredClone(data.product.options), tags: [...data.product.tags], images: [...data.product.images] };
    } else {
      const params = new URLSearchParams(location.search);
      this.draft = { ...blank(), name: params.get('name') ?? '', type: params.get('type') ?? '' };
    }
    this.loading = false;
    await this.updateComplete;
    setTimeout(() => { this.opened = this.snapshot(); }, 600);
  };

  snapshot = () => JSON.stringify({ ...this.draft, tags: this.readTags() });

  isDirty = () => this.opened !== null && this.snapshot() !== this.opened;

  warn = event => {
    if(this.leaving || !this.isDirty()) return;
    event.preventDefault();
    event.returnValue = '';
  };

  /* k-tags holds its value as comma separated text; text still in its box counts too. */
  readTags = () => {
    const $tags = this.shadowRoot?.getElementById('tags');
    if(!$tags) return this.draft.tags;
    const pending = $tags.shadowRoot?.getElementById('tagsInput')?.value ?? '';
    return [...new Set(`${$tags.value ?? ''},${pending}`.split(',').map(tag => tag.trim().replace(/\s+/g, ' ').toLowerCase()).filter(Boolean))];
  };

  set = changes => {
    this.draft = { ...this.draft, ...changes };
    this.dispatchEvent(new CustomEvent('draft-change', { detail: { changed: Object.keys(changes), draft: this.draft }, bubbles: true, composed: true }));
  };

  /* The fields this product's type shows: the default ones plus the type's own. */
  get fields(){
    return this.allFields.filter(field => !field.productType || field.productType === this.draft.type);
  }

  get editing(){
    return Boolean(this.original);
  }

  /* An extension that owns the product keeps its name, slug and type. */
  get owned(){
    return this.editing && Boolean(this.original.owner);
  }

  /* An extension that keeps stock in step with something else shows it read-only. */
  get managed(){
    return this.editing ? this.original.managedBy : '';
  }

  /*
    Event handlers
  */
  handleName = event => {
    const name = event.target.value;
    const changes = { name };
    if(!this.slugEdited && !this.editing) changes.slug = name.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
    this.set(changes);
  };

  handleSlug = event => {
    this.slugEdited = true;
    this.set({ slug: event.target.value });
  };

  handleField = event => {
    event.stopPropagation();
    this.set({ fields: { ...this.draft.fields, [event.detail.key]: event.detail.value } });
  };

  handleStock = event => {
    const value = event.target.value;
    this.set({ stock: value === '' ? -1 : Number(value) });
  };

  save = async submitEvent => {
    submitEvent?.preventDefault();
    if(this.saving) return;
    const { draft } = this;
    if(!draft.name.trim()){
      Toast.error('A name is required');
      return;
    }
    const data = {
      name: draft.name,
      slug: draft.slug,
      type: draft.type,
      description: draft.description,
      status: draft.status,
      availability: draft.availability,
      price: draft.price,
      priceLabel: draft.priceLabel,
      stock: draft.stock,
      tags: this.readTags(),
      images: draft.images,
      fields: Object.fromEntries(this.fields.map(field => [field.key, draft.fields[field.key] ?? (field.type === 'boolean' ? false : '')])),
      options: draft.options,
    };
    if(!this.editing && !data.slug.trim()) delete data.slug;
    if(this.owned) for(const property of ['name', 'slug', 'type']) delete data[property];
    if(this.managed) delete data.stock;
    if(!this.config.media) delete data.images;
    this.saving = true;
    const [error, saved] = this.editing ? await updateProduct(this.original.id, data) : await createProduct(data);
    this.saving = false;
    if(error){
      Toast.error(error.msg || 'Failed to save the product');
      return;
    }
    const waits = [];
    this.dispatchEvent(new CustomEvent('product-saved', {
      detail: { product: saved.product, created: !this.editing, waitUntil: promise => waits.push(promise) },
      bubbles: true,
      composed: true,
    }));
    this.saving = true;
    await Promise.allSettled(waits);
    this.saving = false;
    flash(`${this.editing ? 'Saved' : 'Added'} ${saved.product.name}`);
    this.go(this.next);
  };

  cancel = () => {
    if(!this.isDirty()){
      this.go(this.next);
      return;
    }
    Dialog.confirm('Discard what you have entered? It will be lost.', confirmed => { if(confirmed) this.go(this.next); });
  };

  go = href => {
    this.leaving = true;
    location.assign(href);
  };

  /*
    View
  */
  render(){
    if(this.loading) return html`<k-spinner></k-spinner>`;
    if(this.error) return html`<p class="tc-danger">${this.error}</p>`;
    const { draft, config, owned, managed } = this;
    const decimals = config.decimals;
    const editorTag = unsafeStatic(window.kempo?.componentOverrides?.['page-content-editor'] || 'k-html-editor');
    return html`<form @submit=${this.save} style="max-width: 60rem;">
      ${owned ? html`<p class="tc-muted">Managed by the ${this.original.owner} extension. Its name, slug and type can only be changed there; everything else you can edit here.</p>` : ''}
      <k-tabs class="mb">
        <k-tab for="details">Details</k-tab>
        <k-tab for="description">Description</k-tab>
        <k-tab for="media">Media</k-tab>
        <k-tab for="options">Options</k-tab>
        ${this.extraTabs.map(tab => html`<k-tab for=${tab.name}>${tab.label}</k-tab>`)}
        <k-tab-content name="details" class="pt">
          <div class="mb">
            <label class="d-b mbq" for="name">Name *</label>
            <input type="text" id="name" class="full" .value=${draft.name} ?disabled=${owned} @input=${this.handleName}>
          </div>
          <div class="d-f mb" style="gap: var(--spacer);">
            <div class="flex" style="min-width: 12rem;">
              <label class="d-b mbq" for="slug">Address</label>
              <input type="text" id="slug" class="full" placeholder="made from the name" autocapitalize="off" .value=${draft.slug} ?disabled=${owned} @input=${this.handleSlug}>
              <small class="d-b tc-muted">/products/${draft.slug || '…'}/</small>
            </div>
            <div class="flex" style="min-width: 10rem;">
              <label class="d-b mbq" for="type">Type</label>
              <select id="type" class="full" ?disabled=${owned} @change=${event => this.set({ type: event.target.value })}>
                <option value="" ?selected=${draft.type === ''}>None</option>
                ${this.types.map(type => html`<option value=${type.key} ?selected=${draft.type === type.key}>${type.name}</option>`)}
              </select>
            </div>
          </div>
          <div class="d-f mb" style="gap: var(--spacer);">
            <div class="flex" style="min-width: 10rem;">
              <label class="d-b mbq" for="status">Status</label>
              <select id="status" class="full" @change=${event => this.set({ status: event.target.value })}>
                ${config.statuses.map(status => html`<option value=${status} ?selected=${draft.status === status}>${status[0].toUpperCase()}${status.slice(1)}</option>`)}
              </select>
              <small class="d-b tc-muted">Only published products are public.</small>
            </div>
            <div class="flex" style="min-width: 10rem;">
              <label class="d-b mbq" for="availability">Availability</label>
              <select id="availability" class="full" @change=${event => this.set({ availability: event.target.value })}>
                ${config.availabilities.map(value => html`<option value=${value} ?selected=${draft.availability === value}>${value[0].toUpperCase()}${value.slice(1)}</option>`)}
              </select>
            </div>
          </div>
          <div class="d-f mb" style="gap: var(--spacer);">
            <div class="flex" style="min-width: 10rem;">
              <label class="d-b mbq">Price (${config.currency.toUpperCase()})</label>
              <k-prod-money decimals=${decimals} .value=${draft.price} placeholder="No price" label="Price" @change=${event => this.set({ price: event.detail.value })}></k-prod-money>
            </div>
            <div class="flex" style="min-width: 10rem;">
              <label class="d-b mbq" for="priceLabel">Shown when there is no price</label>
              <input type="text" id="priceLabel" class="full" placeholder="Call for price" .value=${draft.priceLabel} @input=${event => this.set({ priceLabel: event.target.value })}>
            </div>
            <div style="width: 9rem;">
              <label class="d-b mbq" for="stock">Stock</label>
              <input type="number" id="stock" class="full" min="0" step="1" placeholder="Unlimited" .value=${draft.stock === -1 ? '' : String(draft.stock)} ?disabled=${Boolean(managed)} @input=${this.handleStock}>
              <small class="d-b tc-muted">${managed ? `Kept up to date by ${managed}.` : 'Blank is unlimited.'}</small>
            </div>
          </div>
          <div class="mb">
            <label class="d-b mbq" for="tags">Tags</label>
            <k-tags id="tags" .value=${draft.tags.join(',')}></k-tags>
          </div>
          ${this.fields.length ? html`<h4 class="mt">${draft.type ? this.types.find(type => type.key === draft.type)?.name ?? 'Details' : 'More details'}</h4>
            ${this.fields.map(field => html`<k-prod-field-input .field=${field} .value=${draft.fields[field.key]} @change=${this.handleField}></k-prod-field-input>`)}` : ''}
        </k-tab-content>
        <k-tab-content name="description" class="pt">
          <p class="tc-muted">Shown on the product's page. Use headings, lists, links and pictures to describe it.</p>
          ${staticHtml`<${editorTag} id="description" class="r b" controls="full" mode="visual" style="height: 28rem;"
            .value=${draft.description}
            @change=${event => this.set({ description: event.target.getValue?.() ?? event.detail?.value ?? '' })}></${editorTag}>`}
        </k-tab-content>
        <k-tab-content name="media" class="pt">
          ${config.media ? html`<p class="tc-muted">The first picture is the one shown on cards and lists.</p>
            <k-prod-images .value=${draft.images} .assets=${this.assets} @change=${event => { this.assets = { ...this.assets, ...event.detail.assets }; this.set({ images: event.detail.value }); }}></k-prod-images>`
            : html`<p class="tc-muted">Install the kempo-media extension to add pictures to products.</p>`}
        </k-tab-content>
        <k-tab-content name="options" class="pt">
          <k-prod-options-editor .value=${draft.options} decimals=${decimals} managed=${managed} @change=${event => this.set({ options: event.detail.value })}></k-prod-options-editor>
        </k-tab-content>
        ${this.extraTabs.map(tab => html`<k-tab-content name=${tab.name} class="pt"><slot name=${`tab-${tab.name}`}></slot></k-tab-content>`)}
      </k-tabs>
      <div class="d-f" style="gap: var(--spacer_h); flex-wrap: wrap;">
        <button type="submit" class="btn success" id="saveProduct" ?disabled=${this.saving}>${this.saving ? 'Saving…' : this.editing ? 'Save' : 'Create product'}</button>
        <button type="button" class="btn" id="cancelProduct" ?disabled=${this.saving} @click=${this.cancel}>Cancel</button>
      </div>
    </form>`;
  }
}

customElements.define('k-prod-form', ProductForm);
