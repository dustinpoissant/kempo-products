import { getConfig, getProduct, getProductTypes, getTemplates, getCategories, getAttributes, createProduct, updateProduct, formatMoney } from '/products/sdk.js';
import Toast from '/kempo-ui/components/Toast.js';
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

export const blank = () => ({
  name: '', slug: '', description: '', status: 'draft', availability: 'available', price: null, minimumPrice: null, priceLabel: '',
  quantity: -1, tags: [], categories: [], images: [], attributes: {}, options: [], template: '', attributeDefs: [], productType: '', creditsGranted: 0, creditsOnly: false, creditPercent: 0,
});

/*
  Which draft fields each tab saves, named as the request body names them. A tab's Save button saves only its own fields.
*/
export const SECTIONS = {
  details: ['name', 'slug', 'status', 'availability', 'price', 'minimumPrice', 'priceLabel', 'quantity', 'tags', 'categories', 'productType'],
  description: ['description'],
  media: ['images'],
  template: ['template'],
  attributes: ['attributeDefs'],
  options: ['options'],
  credits: ['creditsGranted', 'creditsOnly', 'creditPercent'],
};

/*
  The product form: a context, not a visible component. It holds the product being edited and the methods that load and save
  it. The tabs are the page's own, each a component that finds this element with closest('k-products-form') and calls its
  methods. A tab's Save button calls save(section), so it saves only what that tab holds. Any Save creates the product when it
  does not exist yet, from the whole draft, and the page then moves to the edit address.

    <k-products-form from-url>
      <k-tabs> ...tabs, each with its component... <location name="products-admin-product-tabs"></location> </k-tabs>
      <location name="products-admin-product-actions"></location>
    </k-products-form>

  Events, bubbling from this element: `draft-change` ({ changed, draft }) as the draft is edited, and `product-saved` ({ product,
  created, section }) once a save is stored. `productId` and `original` (the product as it was saved) are read by extensions.
*/
export default class ProductForm extends HTMLElement {
  constructor(){
    super();
    this.productId = '';
    this.loading = true;
    this.saving = false;
    this.error = '';
    this.config = null;
    this.productTypes = [];
    this.templates = [];
    this.categories = [];
    this.allAttributes = [];
    this.original = null;
    this.draft = blank();
    this.assets = {};
    this.dirtyKeys = new Set();
    this.slugEdited = false;
    this.subscribers = new Set();
  }

  connectedCallback(){
    this.style.display = 'contents';
    window.addEventListener('beforeunload', this.warn);
    if(this.hasAttribute('from-url')){
      this.productId = new URLSearchParams(location.search).get('id') ?? '';
    } else {
      this.productId = this.getAttribute('product-id') ?? '';
    }
    this.load();
  }

  disconnectedCallback(){
    window.removeEventListener('beforeunload', this.warn);
  }

  /*
    Subscribers: the tabs, which redraw when the draft or the product changes
  */
  subscribe = component => {
    this.subscribers.add(component);
    if(!this.loading) component.requestUpdate?.();
  };

  unsubscribe = component => {
    this.subscribers.delete(component);
  };

  notify = () => {
    for(const component of this.subscribers) component.requestUpdate?.();
  };

  /*
    Loading
  */
  load = async () => {
    const [[configError, config], [categoriesError, categories], [fieldsError, attributes], [productTypesError, productTypes], [templatesError, templates]] = await Promise.all([getConfig(), getCategories(), getAttributes(), getProductTypes(), getTemplates()]);
    const failure = configError || categoriesError || fieldsError || productTypesError || templatesError;
    if(failure){
      this.error = failure.msg;
      this.loading = false;
      this.notify();
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
        this.notify();
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
    this.dirtyKeys = new Set();
    this.loading = false;
    this.notify();
  };

  /*
    Reading
  */
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

  /* The template this product is made from, if any. */
  get template(){
    return this.templates.find(template => template.key === this.draft.template) ?? null;
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

  /* Every attribute the product has: the shared ones, then those its template gives it. */
  get attributes(){
    const taken = new Set(this.allAttributes.map(attribute => attribute.key));
    return [...this.allAttributes, ...(this.template?.attributes ?? []).filter(attribute => !taken.has(attribute.key)).map(attribute => ({ ...attribute, fromTemplate: true }))];
  }

  /* The attributes an administrator added for every product. Each extension shows its own. */
  get customAttributes(){
    return this.allAttributes.filter(attribute => !attribute.owner);
  }

  /*
    What still has to be filled in before the product can be saved: its name, and every required attribute that has no
    value and no default from the template.
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

  /* True while kempo-credits is installed and enabled. */
  get credits(){
    return Boolean(this.config?.credits?.enabled);
  }

  /*
    Changing the draft
  */
  set = changes => {
    this.draft = { ...this.draft, ...changes };
    for(const key of Object.keys(changes)) this.dirtyKeys.add(key);
    this.dispatchEvent(new CustomEvent('draft-change', { detail: { changed: Object.keys(changes), draft: this.draft }, bubbles: true }));
    this.notify();
  };

  /* Attribute values, as one object: the product's own, with a blank for each attribute it does not set. */
  attributeValues = keys => Object.fromEntries(keys.map(key => [key, this.draft.attributes[key] ?? '']));

  /* The defaults of the product's own attributes, which are stored as values too. */
  defaultValues = () => Object.fromEntries(this.draft.attributeDefs.map(attribute => [attribute.key || keyFromLabel(attribute.label), attribute.default ?? '']));

  /*
    The request body for some of the draft's fields. An extension-owned name or slug, and a managed quantity, are left out.
  */
  payload(keys){
    const { draft, config } = this;
    const body = {};
    for(const key of keys){
      if(['name', 'slug'].includes(key) && this.owned) continue;
      if(key === 'quantity' && this.managed) continue;
      if(key === 'images' && !config.media) continue;
      if(key === 'creditPercent'){
        body.creditPercent = draft.creditsOnly ? 0 : draft.creditPercent;
        continue;
      }
      if(key === 'attributeDefs'){
        body.attributeDefs = draft.attributeDefs.map(({ default: value, ...attribute }) => ({ ...attribute, key: attribute.key || keyFromLabel(attribute.label) }));
        continue;
      }
      body[key] = draft[key];
    }
    return body;
  }

  /*
    Saving. `pending` is changes the tab holds that the draft does not have yet (text still in a tag box, say).
    Creating a product needs a name, and then saves the whole draft; the page moves to the edit address after that.
  */
  /*
    Saves the whole product, from the Save button above the tabs. `section` is only for an extension that saves part of it.
  */
  save = async (section = 'all', pending = {}) => {
    if(this.saving) return;
    if(Object.keys(pending).length) this.set(pending);
    if(!String(this.draft.name ?? '').trim()){
      Toast.error('Give the product a name on the Details tab first');
      return;
    }
    const missing = this.missing;
    if(missing.length){
      Toast.error(`Still needed: ${missing.join(', ')}`);
      return;
    }

    const created = !this.editing;
    this.saving = true;
    this.notify();
    let result;
    const keys = section === 'all' ? Object.values(SECTIONS).flat() : SECTIONS[section];
    const values = { ...this.attributeValues(this.attributes.map(attribute => attribute.key)), ...this.defaultValues() };
    if(this.editing){
      const body = this.payload(keys);
      if(section === 'all' || section === 'attributes') body.attributes = values;
      result = await updateProduct(this.original.id, body);
    } else {
      const body = this.payload(keys);
      if(!String(body.slug ?? '').trim()) delete body.slug;
      body.attributes = values;
      result = await createProduct(body);
    }
    this.saving = false;
    const [error, saved] = result;
    if(error){
      Toast.error(error.msg || 'Failed to save the product');
      this.notify();
      return;
    }
    this.original = saved.product;
    this.assets = { ...this.assets, ...(saved.images ?? {}) };
    for(const key of keys) this.dirtyKeys.delete(key);
    if(!this.productId){
      this.productId = saved.product.id;
      history.replaceState(null, '', `/admin/extension/kempo-products/edit?id=${encodeURIComponent(saved.product.id)}`);
    }
    this.dispatchEvent(new CustomEvent('product-saved', { detail: { product: saved.product, created, section }, bubbles: true }));
    Toast.success(`Saved ${saved.product.name}`);
    this.notify();
  };

  /* Saves the values of the attributes a tab holds (the shared ones, or an extension's), and no others. */
  saveAttributes = async (keys, pending = {}) => {
    if(this.saving) return;
    if(!this.editing){
      await this.save('attributes', pending);
      return;
    }
    this.draft = { ...this.draft, attributes: { ...this.draft.attributes, ...pending } };
    this.saving = true;
    this.notify();
    const [error, saved] = await updateProduct(this.original.id, { attributes: this.attributeValues(keys) });
    this.saving = false;
    if(error){
      Toast.error(error.msg || 'Failed to save the attributes');
      this.notify();
      return;
    }
    this.original = saved.product;
    this.dirtyKeys.delete('attributes');
    this.dispatchEvent(new CustomEvent('product-saved', { detail: { product: saved.product, created: false, section: 'attributes' }, bubbles: true }));
    Toast.success('Attributes saved');
    this.notify();
  };

  /* Leaving with unsaved changes asks first. */
  warn = event => {
    if(!this.dirtyKeys.size) return;
    event.preventDefault();
    event.returnValue = '';
  };
}

customElements.define('k-products-form', ProductForm);
