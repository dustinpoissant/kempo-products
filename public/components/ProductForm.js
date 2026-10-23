import ShadowComponent from '/kempo-ui/components/ShadowComponent.js';
import { html, staticHtml, unsafeStatic } from '/kempo-ui/lit-all.min.js';
import Toast from '/kempo-ui/components/Toast.js';
import Dialog from '/kempo-ui/components/Dialog.js';
import '/kempo-ui/components/Tags.js';
import '/kempo-ui/components/Spinner.js';
import '/kempo-ui/components/Tabs.js';
import '/kempo-ui/components/HtmlEditor.js';
import { getConfig, getProduct, getProductTypes, getTemplates, getCategories, getAttributes, createProduct, updateProduct, formatMoney } from '/products/sdk.js';
import '/products/components/MoneyInput.js';
import '/products/components/AttributeInput.js';
import '/products/components/OptionsEditor.js';
import '/products/components/ImagesField.js';
import { keyFromLabel } from '/products/components/AttributesEditor.js';

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
  name: '', slug: '', description: '', status: 'draft', availability: 'available', price: null, minimumPrice: null, priceLabel: '',
  quantity: -1, tags: [], categories: [], images: [], attributes: {}, options: [], template: '', attributeDefs: [], productType: '', creditsGranted: 0, creditsOnly: false, creditPercent: 0,
});

/*
  Adds or edits a product, on one page split into tabs: Details (the basics, price, quantity and the
  custom attributes), Description (a full rich text editor), Media (pictures) and
  Options, plus Credits when kempo-credits is installed and enabled, where a product says how many
  credits buying it gives and whether it is nothing but credits. The Details tab then also says how
  much of the price may be paid in credits. Pass `product-id` to edit; without it, a new product is
  made. With `from-url` it takes both from the address instead (?id= and ?next=). After saving it
  goes to `next` (a path on this site), where the list shows a message.

    <k-products-form product-id="1969-camaro" next="/admin/extension/kempo-products/"></k-products-form>

  Extensions add their own tabs without this file knowing about them. A <k-products-tab> placed
  directly inside the form becomes a tab after the built-in ones, in the order it appears:

    <k-products-form>
      <k-products-tab name="shipping" label="Shipping"> ...anything... </k-products-tab>
    </k-products-form>

  The admin pages put a <location name="products-admin-product-tabs"> inside the form, so an
  extension only ships an admin/*.global.html that pushes its <k-products-tab> there. Buttons go in the same
  way: the pages also put a <location name="products-admin-product-actions"> inside the form, and an element
  with slot="actions" appears beside Save and Cancel. It finds the form with closest('k-products-form') and
  reads `productId` (empty until the product exists) and `original` (the product as it was loaded), and
  hears `product-saved` to learn the id of a new one. What a tab holds
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
    productTypes: { state: true },
    templates: { state: true },
    categories: { state: true },
    allAttributes: { state: true },
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
    this.productTypes = [];
    this.templates = [];
    this.categories = [];
    this.allAttributes = [];
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
    this.extraTabs = [...this.querySelectorAll(':scope > k-products-tab')].map($tab => {
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
    const [[configError, config], [categoriesError, categories], [fieldsError, attributes], [productTypesError, productTypes], [templatesError, templates]] = await Promise.all([getConfig(), getCategories(), getAttributes(), getProductTypes(), getTemplates()]);
    if(configError || categoriesError || fieldsError || productTypesError || templatesError){
      this.error = (configError || categoriesError || fieldsError || productTypesError || templatesError).msg;
      this.loading = false;
      return;
    }
    this.config = config;
    this.productTypes = productTypes.productTypes;
    this.templates = templates.templates;
    this.categories = categories.categories;
    this.allAttributes = attributes.attributes;
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
      /* The form edits what the product itself holds; what its template fills in is shown as a hint, not copied in. */
      this.draft = { ...blank(), ...data.product, ...data.product.own, attributes: { ...data.product.attributes }, attributeDefs: data.product.attributeDefs.map(attribute => ({ ...attribute, default: data.product.attributes[attribute.key] ?? '' })), options: structuredClone(data.product.ownOptions), tags: [...data.product.tags], categories: [...data.product.categories], images: [...data.product.images] };
    } else {
      const params = new URLSearchParams(location.search);
      this.draft = { ...blank(), name: params.get('name') ?? '', template: params.get('template') ?? '' };
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

  toggleCategory = (key, chosen) => {
    const without = this.draft.categories.filter(existing => existing !== key);
    this.set({ categories: chosen ? [...without, key] : without });
  };

  set = changes => {
    this.draft = { ...this.draft, ...changes };
    this.dispatchEvent(new CustomEvent('draft-change', { detail: { changed: Object.keys(changes), draft: this.draft }, bubbles: true, composed: true }));
  };

  /*
    What still has to be filled in before the product can be saved: its name, and every required attribute that has no
    value and no default from the template. The button stays disabled until this is empty.
  */
  get missing(){
    const { draft, template } = this;
    const empty = value => [undefined, null, ''].includes(value);
    const missing = [];
    if(!String(draft.name ?? '').trim()) missing.push('a name');
    for(const attribute of this.attributes){
      if(attribute.required && attribute.type !== 'boolean' && empty(draft.attributes[attribute.key]) && empty(template?.defaults?.[attribute.key])) missing.push(attribute.label);
    }
    for(const attribute of draft.attributeDefs) if(attribute.required && attribute.type !== 'boolean' && empty(attribute.default)) missing.push(attribute.label || 'an attribute');
    return missing;
  }

  /* What the template gives a product that leaves a setting blank, for the hints under the fields. */
  get base(){
    return this.template?.product ?? {};
  }

  /* The product type the form shows for "no choice": the template's, or the generic one. */
  get inheritedTypeName(){
    const key = this.base.productType || 'generic';
    return this.productTypes.find(type => type.key === key)?.name ?? key;
  }

  /* The template's price, written the way the price box writes one. */
  money = minor => (minor === null || minor === undefined ? '' : formatMoney(minor, this.config.decimals));

  /* The template this product is made from, if any. */
  get template(){
    return this.templates.find(template => template.key === this.draft.template) ?? null;
  }

  /* The attributes every product has, then those of its template. The product's own are in draft.attributeDefs. */
  get attributes(){
    const taken = new Set(this.allAttributes.map(attribute => attribute.key));
    return [...this.allAttributes, ...(this.template?.attributes ?? []).filter(attribute => !taken.has(attribute.key)).map(attribute => ({ ...attribute, fromTemplate: true }))];
  }

  /*
    The Template tab: which template the product is made from, the attributes that template gives it (with its default
    shown under a blank one) and the options it offers (read-only here, changed on the template).
  */
  renderTemplate(){
    const { draft, owned, template } = this;
    return html`
      <div class="mb" style="max-width: 20rem;">
        <label class="d-b mbq" for="template">Template<small class="d-b tc-muted">What this product inherits: attributes, options and default values. It can add its own on top.</small></label>
        <select id="template" class="full" ?disabled=${owned} @change=${event => this.set({ template: event.target.value })}>
          <option value="" ?selected=${draft.template === ''}>None</option>
          ${this.templates.map(candidate => html`<option value=${candidate.key} ?selected=${draft.template === candidate.key}>${candidate.name}</option>`)}
        </select>
      </div>
      ${template ? html`<small class="d-b mb"><a href=${`/admin/extension/kempo-products/template?key=${encodeURIComponent(template.key)}`}>Edit the ${template.name} template</a></small>` : ''}
      ${template?.attributes.length ? html`<h4 class="mt mb">${template.name} attributes</h4>${this.attributes.filter(attribute => attribute.fromTemplate).map(this.renderAttributeInput)}` : ''}
      ${template?.options.length ? html`<h4 class="mt mb">${template.name} options</h4>
        <small class="d-b tc-muted mbq">Every product made from this template offers these. Change them on the template, or add choices to one on the Options tab.</small>
        <ul class="mb">${template.options.map(option => html`<li>${option.label}: ${option.choices.map(choice => choice.label).join(', ')}</li>`)}</ul>` : ''}
    `;
  }

  /* Starts an option of the product's own with the key of one its template offers, so its choices are added to the template's. */
  extendOption = option => this.set({ options: [...this.draft.options, { key: option.key, label: option.label, required: option.required, priceType: option.priceType, choices: [{ label: '', price: 0, available: true }] }] });

  /*
    The tabs after Credits: one for each group an attribute names with `tab` ("shipping" gives a Shipping tab holding those
    attributes), and one for each <k-products-tab> an extension added. A group and an extension tab with the same name
    share one tab: the attributes, then what the extension put there.
  */
  get sectionTabs(){
    const tabs = new Map();
    for(const attribute of this.allAttributes.filter(candidate => candidate.tab)){
      if(!tabs.has(attribute.tab)) tabs.set(attribute.tab, { name: attribute.tab, label: attribute.tab.charAt(0).toUpperCase() + attribute.tab.slice(1).replace(/-/g, ' '), attributes: [], slotted: false });
      tabs.get(attribute.tab).attributes.push(attribute);
    }
    for(const extra of this.extraTabs){
      const tab = tabs.get(extra.name) ?? { name: extra.name, label: extra.label, attributes: [], slotted: false };
      tab.slotted = true;
      tabs.set(extra.name, tab);
    }
    return [...tabs.values()];
  }

  renderAttributeInput = attribute => html`<k-products-attribute-input .attribute=${attribute} .value=${this.draft.attributes[attribute.key]} .fallback=${this.template?.defaults?.[attribute.key]} .decimals=${this.config.decimals} .currency=${this.config.currency} @change=${this.handleAttribute}></k-products-attribute-input>`;

  /* True while kempo-credits is installed and enabled: the only time credit settings are shown. */
  get credits(){
    return Boolean(this.config?.credits?.enabled);
  }

  get editing(){
    return Boolean(this.original);
  }

  /* An extension that owns the product keeps its name and slug. */
  get owned(){
    return this.editing && Boolean(this.original.owner);
  }

  /* An extension that keeps quantity in step with something else shows it read-only. */
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

  handleAttribute = event => {
    event.stopPropagation();
    this.set({ attributes: { ...this.draft.attributes, [event.detail.key]: event.detail.value } });
  };

  handleQuantity = event => {
    const value = event.target.value;
    this.set({ quantity: value === '' ? -1 : Number(value) });
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
      description: draft.description,
      status: draft.status,
      availability: draft.availability,
      price: draft.price,
      minimumPrice: draft.minimumPrice,
      priceLabel: draft.priceLabel,
      quantity: draft.quantity,
      tags: this.readTags(),
      categories: draft.categories,
      images: draft.images,
      template: draft.template,
      attributeDefs: draft.attributeDefs.map(({ default: value, ...attribute }) => ({ ...attribute, key: attribute.key || keyFromLabel(attribute.label) })),
      attributes: {
        ...Object.fromEntries(this.attributes.map(attribute => [attribute.key, draft.attributes[attribute.key] ?? (attribute.type === 'boolean' ? false : '')])),
        ...Object.fromEntries(draft.attributeDefs.map(attribute => [attribute.key || keyFromLabel(attribute.label), attribute.default ?? ''])),
      },
      options: draft.options,
    };
    if(this.credits){
      data.creditsGranted = draft.creditsGranted;
      data.creditsOnly = draft.creditsOnly;
      data.creditPercent = draft.creditsOnly ? 0 : draft.creditPercent;
    }
    data.productType = draft.productType;
    if(!this.editing && !data.slug.trim()) delete data.slug;
    if(this.owned) for(const property of ['name', 'slug']) delete data[property];
    if(this.managed) delete data.quantity;
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
  renderCreditPercent(){
    const { draft, config } = this;
    const quote = draft.price && draft.creditPercent > 0 && !draft.creditsOnly
      ? Math.ceil(Math.floor(draft.price * draft.creditPercent / 100) * config.credits.perUnit / 10 ** config.decimals)
      : 0;
    const say = draft.creditsOnly ? 'A credit-only product cannot be paid for with credits.'
      : draft.creditPercent === 0 ? '0% means this cannot be paid for with credits at all. 100% means it can be bought entirely with credits.'
      : draft.creditPercent === 100 ? 'It can be bought entirely with credits.'
      : `Up to ${draft.creditPercent}% of the price can be paid in credits, the rest in money.`;
    return html`<div class="mb" style="max-width: 28rem;">
      <label class="d-b mbq" for="creditPercent">Percentage that can be paid in credits<small class="d-b tc-muted">${say}${quote ? ` At the current rate that is up to ${new Intl.NumberFormat().format(quote)} credits.` : ''}</small></label>
      <div class="d-f" style="gap: var(--spacer_h); align-items: center;">
        <input type="number" id="creditPercent" style="width: 7rem;" min="0" max="100" step="1" .value=${String(draft.creditsOnly ? 0 : draft.creditPercent)} ?disabled=${draft.creditsOnly}
          @input=${event => this.set({ creditPercent: Math.min(100, Math.max(0, Math.trunc(Number(event.target.value)) || 0)) })}>
        <span>%</span>
      </div>
    </div>`;
  }

  renderCredits(){
    const { draft, config } = this;
    const code = config.currency.toUpperCase();
    return html`<div style="max-width: 36rem;">
      <p class="tc-muted mb">Credits are the site's in-app currency, kept by the kempo-credits extension. Buying this product can give the buyer some, and selling credits is just a product that gives them.</p>
      <div class="mb">
        <label class="d-b mbq" for="creditsGranted">Credits the buyer gets<small class="d-b tc-muted">For each one bought. 0 gives none.</small></label>
        <input type="number" id="creditsGranted" style="width: 12rem;" min="0" step="1" .value=${String(draft.creditsGranted)}
          @input=${event => this.set({ creditsGranted: Math.max(0, Math.trunc(Number(event.target.value)) || 0) })}>
      </div>
      ${draft.creditsOnly && draft.creditsGranted < 1 ? html`<p class="tc-danger mb">Give at least 1 credit, or this is not a credit-only item.</p>` : ''}
      ${draft.creditsOnly && draft.price && draft.creditsGranted > 0
        ? html`<p class="tc-muted mb">That is ${new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(draft.creditsGranted / (draft.price / 10 ** config.decimals))} credits for each ${code} 1.00 spent.</p>`
        : ''}
    </div>`;
  }

  /* The categories the product is in: a checkbox for each one the site has. */
  renderCategories(){
    const { draft, categories } = this;
    return html`<div class="mb" id="categories" role="group" aria-labelledby="categoriesLabel">
      <div class="d-b mbq" id="categoriesLabel">Categories<small class="d-b tc-muted">${categories.length ? 'Choose any number. Shoppers browse by category.' : 'Shoppers browse by category.'}</small></div>
      ${categories.length ? html`<div class="d-f" style="gap: var(--spacer_h) var(--spacer);">
        ${categories.map(category => html`<label class="checkbox m0"><input type="checkbox" name="category" value=${category.key} .checked=${draft.categories.includes(category.key)} @change=${event => this.toggleCategory(category.key, event.target.checked)}> ${category.name}</label>`)}
      </div>` : html`<p class="tc-muted m0">There are no categories yet. <a href="/admin/extension/kempo-products/categories">Add some</a>, then choose them here.</p>`}
    </div>`;
  }

  render(){
    if(this.loading) return html`<k-spinner></k-spinner>`;
    if(this.error) return html`<p class="tc-danger">${this.error}</p>`;
    const { draft, config, owned, managed } = this;
    const decimals = config.decimals;
    const editorTag = unsafeStatic(window.kempo?.componentOverrides?.['page-content-editor'] || 'k-html-editor');
    return html`<form @submit=${this.save}>
      ${owned ? html`<p class="tc-muted">Managed by the ${this.original.owner} extension. Its name and slug can only be changed there; everything else you can edit here.</p>` : ''}
      <k-tabs class="mb">
        <k-tab for="details">Details</k-tab>
        <k-tab for="description">Description</k-tab>
        <k-tab for="media">Media</k-tab>
        <k-tab for="template">Template</k-tab>
        <k-tab for="attributes">Attributes</k-tab>
        <k-tab for="options">Options</k-tab>
        ${this.credits ? html`<k-tab for="credits">Credits</k-tab>` : ''}
        ${this.sectionTabs.map(tab => html`<k-tab for=${tab.name}>${tab.label}</k-tab>`)}
        <k-tab-content name="details" class="pt">
          <div class="mb">
            <label class="d-b mbq" for="name">Name *</label>
            <input type="text" id="name" class="full" .value=${draft.name} ?disabled=${owned} @input=${this.handleName}>
          </div>
          <div class="d-f mb" style="gap: var(--spacer); align-items: flex-end;">
            <div class="flex" style="min-width: 12rem;">
              <label class="d-b mbq" for="slug">URL<small class="d-b tc-muted">/products/${draft.slug || '…'}/</small></label>
              <input type="text" id="slug" class="full" placeholder="made from the name" autocapitalize="off" .value=${draft.slug} ?disabled=${owned} @input=${this.handleSlug}>
            </div>
            ${this.productTypes.length > 1 || this.base.productType ? html`<div class="flex" style="min-width: 10rem;">
              <label class="d-b mbq" for="productType">Product type<small class="d-b tc-muted">Decides how it is delivered, such as whether it is shipped</small></label>
              <select id="productType" class="full" ?disabled=${owned} @change=${event => this.set({ productType: event.target.value, creditsOnly: event.target.value === 'credits-only', ...(event.target.value === 'credits-only' ? { creditPercent: 0 } : {}) })}>
                <option value="" ?selected=${draft.productType === ''}>${this.base.productType ? `The template's (${this.inheritedTypeName})` : `Default (${this.inheritedTypeName})`}</option>
                ${this.productTypes.map(productType => html`<option value=${productType.key} ?selected=${draft.productType === productType.key}>${productType.name}</option>`)}
              </select>
            </div>` : ''}
          </div>
          <div class="d-f mb" style="gap: var(--spacer); align-items: flex-end;">
            <div class="flex" style="min-width: 10rem;">
              <label class="d-b mbq" for="status">Status<small class="d-b tc-muted">Only published products are public.</small></label>
              <select id="status" class="full" @change=${event => this.set({ status: event.target.value })}>
                ${config.statuses.map(status => html`<option value=${status} ?selected=${draft.status === status}>${status[0].toUpperCase()}${status.slice(1)}</option>`)}
              </select>
            </div>
            <div class="flex" style="min-width: 10rem;">
              <label class="d-b mbq" for="availability">Availability</label>
              <select id="availability" class="full" @change=${event => this.set({ availability: event.target.value })}>
                ${config.availabilities.map(value => html`<option value=${value} ?selected=${draft.availability === value}>${value[0].toUpperCase()}${value.slice(1)}</option>`)}
              </select>
            </div>
          </div>
          <div class="d-f mb" style="gap: var(--spacer); align-items: flex-end;">
            <div class="flex" style="min-width: 10rem;">
              <label class="d-b mbq">Price (${config.currency.toUpperCase()})</label>
              <k-products-money decimals=${decimals} .value=${draft.price} placeholder=${this.base.price != null ? `Template: ${this.money(this.base.price)}` : 'No price'} label="Price" @change=${event => this.set({ price: event.detail.value })}></k-products-money>
            </div>
            <div class="flex" style="min-width: 10rem;">
              <label class="d-b mbq" for="priceLabel">Shown when there is no price</label>
              <input type="text" id="priceLabel" class="full" placeholder=${this.base.priceLabel || 'Call for price'} .value=${draft.priceLabel} @input=${event => this.set({ priceLabel: event.target.value })}>
            </div>
            <div style="width: 9rem;">
              <label class="d-b mbq" for="quantity">Quantity<small class="d-b tc-muted">${managed ? `Kept up to date by ${managed}.` : 'Blank is unlimited.'}</small></label>
              <input type="number" id="quantity" class="full" min="0" step="1" placeholder="Unlimited" .value=${draft.quantity === -1 ? '' : String(draft.quantity)} ?disabled=${Boolean(managed)} @input=${this.handleQuantity}>
            </div>
          </div>
          <div class="mb" style="max-width: 20rem;">
            <label class="d-b mbq">Lowest price after discounts (${config.currency.toUpperCase()})<small class="d-b tc-muted">Sales and codes never take the price below this. Blank has no limit.</small></label>
            <k-products-money decimals=${decimals} .value=${draft.minimumPrice} placeholder=${this.base.minimumPrice != null ? `Template: ${this.money(this.base.minimumPrice)}` : 'No minimum'} label="Lowest price after discounts" @change=${event => this.set({ minimumPrice: event.detail.value })}></k-products-money>
          </div>
          ${this.credits ? this.renderCreditPercent() : ''}
          <div class="mb">
            <label class="d-b mbq" for="tags">Tags</label>
            ${this.base.tags?.length && !draft.tags.length ? html`<small class="d-b tc-muted">Blank uses the template's tags: ${this.base.tags.join(', ')}.</small>` : ''}
            <k-tags id="tags" .value=${draft.tags.join(',')}></k-tags>
          </div>
          ${this.renderCategories()}
          ${this.allAttributes.some(attribute => !attribute.tab) ? html`<h4 class="mt mb">More details</h4>
            ${this.allAttributes.filter(attribute => !attribute.tab).map(this.renderAttributeInput)}` : ''}
        </k-tab-content>
        <k-tab-content name="description" class="pt">
          <p class="tc-muted mb">Shown on the product's page. Use headings, lists, links and pictures to describe it.${this.base.description && !draft.description ? ' Left blank, this product uses its template\'s description.' : ''}</p>
          ${staticHtml`<${editorTag} id="description" class="r b" controls="full" mode="visual" style="height: 28rem;"
            .value=${draft.description}
            @change=${event => this.set({ description: event.target.getValue?.() ?? event.detail?.value ?? '' })}></${editorTag}>`}
        </k-tab-content>
        <k-tab-content name="media" class="pt">
          ${config.media ? html`<p class="tc-muted">The first picture is the one shown on cards and lists.</p>
            <k-products-images .value=${draft.images} .assets=${this.assets} @change=${event => { this.assets = { ...this.assets, ...event.detail.assets }; this.set({ images: event.detail.value }); }}></k-products-images>`
            : html`<p class="tc-muted">Install the kempo-media extension to add pictures to products.</p>`}
        </k-tab-content>
        <k-tab-content name="template" class="pt">${this.renderTemplate()}</k-tab-content>
        <k-tab-content name="attributes" class="pt">
          <p class="tc-muted">Attributes only <strong>this product</strong> has, in addition to the ones every product has and the ones its template gives it. They are not added to the template. To give every product made from a template an attribute, add it on the template.</p>
          <k-products-attributes-editor .value=${draft.attributeDefs} .config=${this.config} value-label="Value" @change=${event => this.set({ attributeDefs: event.detail.value })}></k-products-attributes-editor>
        </k-tab-content>
        <k-tab-content name="options" class="pt">
          ${this.template?.options.length ? html`<div class="mb"><strong>From the ${this.template.name} template</strong>
            <small class="d-b tc-muted mbq">Every product made from this template offers these. To give this product more choices for one, add choices to it; they are added to the template's.</small>
            <ul class="mb">${this.template.options.map(option => html`<li>${option.label}: ${option.choices.map(choice => choice.label).join(', ')}
              ${draft.options.some(own => own.key === option.key)
                ? html`<span class="tc-muted">(this product's own choices are below)</span>`
                : html`<button type="button" class="btn" ?disabled=${Boolean(managed)} @click=${() => this.extendOption(option)}><k-icon name="add"></k-icon> Add choices</button>`}</li>`)}</ul></div>` : ''}
          <k-products-options-editor .value=${draft.options} decimals=${decimals} managed=${managed} @change=${event => this.set({ options: event.detail.value })}></k-products-options-editor>
        </k-tab-content>
        ${this.credits ? html`<k-tab-content name="credits" class="pt">${this.renderCredits()}</k-tab-content>` : ''}
        ${this.sectionTabs.map(tab => html`<k-tab-content name=${tab.name} class="pt">${tab.attributes.map(this.renderAttributeInput)}${tab.slotted ? html`<slot name=${`tab-${tab.name}`}></slot>` : ''}</k-tab-content>`)}
      </k-tabs>
      <div class="d-f" style="gap: var(--spacer_h); flex-wrap: wrap;">
        <button type="submit" class="btn success" id="saveProduct" ?disabled=${this.saving || this.missing.length > 0} title=${this.missing.length ? `Still needed: ${this.missing.join(', ')}` : ''}>${this.saving ? 'Saving…' : this.editing ? 'Save' : 'Create product'}</button>
        <button type="button" class="btn" id="cancelProduct" ?disabled=${this.saving} @click=${this.cancel}>Cancel</button>
        ${this.editing ? html`<a class="btn" id="viewProduct" href=${`/products/${this.original.slug}/`} target="_blank" rel="noopener" title=${this.original.status === 'published' ? 'Open the product page on the live site' : `This product is ${this.original.status}, so only people who manage products can see its page`}><k-icon name="link"></k-icon> View on site</a>` : ''}
        <slot name="actions"></slot>
      </div>
    </form>`;
  }
}

customElements.define('k-products-form', ProductForm);
