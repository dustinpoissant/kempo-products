import { getConfig, getTemplates, getAttributes, getProductTypes, getCategories, createTemplate, updateTemplate } from '/products/sdk.js';
import Toast from '/kempo-ui/components/Toast.js';
import { keyFromLabel } from '/products/components/AttributesEditor.js';

/* What a product made from the template starts with, as the Product tab edits it. */
const BLANK_PRODUCT = { productType: '', price: null, minimumPrice: null, priceLabel: '', description: '', tags: [], categories: [] };

const blank = value => value === null || value === undefined || value === '';

/*
  A product template's page, as a context: it holds the template being edited and the methods that load and save it. The tabs are
  the page's own, each a component that finds this element with closest('k-products-template-form') and saves its own fields.
  Any Save creates the template when it does not exist yet, from the whole draft, and the page then moves to the template's address.

    <k-products-template-form from-url>
      <k-tabs> ...tabs... <location name="products-admin-template-tabs"></location> </k-tabs>
    </k-products-template-form>

  With `from-url` the template is the `?key=` of the page; without one a new template is made.
*/
export default class TemplateForm extends HTMLElement {
  constructor(){
    super();
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
    this.subscribers = new Set();
  }

  connectedCallback(){
    this.style.display = 'contents';
    if(this.hasAttribute('from-url')) this.key = new URLSearchParams(location.search).get('key') ?? '';
    this.load();
  }

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

  get editing(){
    return Boolean(this.key);
  }

  load = async () => {
    const [[configError, config], [templatesError, templates], [fieldsError, attributes], [typesError, types], [categoriesError, categories]] = await Promise.all([getConfig(), getTemplates(), getAttributes(), getProductTypes(), getCategories()]);
    const failure = configError || templatesError || fieldsError || typesError || categoriesError;
    if(failure){
      this.error = failure.msg;
      this.loading = false;
      this.notify();
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
        this.notify();
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
    this.notify();
  };

  set = changes => {
    this.draft = { ...this.draft, ...changes };
    this.notify();
  };

  setProduct = changes => this.set({ product: { ...this.draft.product, ...changes } });

  /* The defaults for the template: those of the attributes it defines, and those it gives the attributes every product has. */
  get defaults(){
    const defaults = { ...this.draft.defaults };
    for(const attribute of this.draft.attributes) {
      if(!blank(attribute.default)) defaults[attribute.key || keyFromLabel(attribute.label)] = attribute.default;
    }
    return defaults;
  }

  /* The template's own attributes, without the defaults, which are stored in `defaults`. */
  get ownAttributes(){
    return this.draft.attributes.map(({ default: value, ...attribute }) => ({ ...attribute, key: attribute.key || keyFromLabel(attribute.label) }));
  }

  /*
    The request body for one tab's fields. `all` is what a new template is made from.
  */
  payload(section){
    const { draft } = this;
    const body = {};
    if(section === 'details' || section === 'all'){
      if(!this.owner) body.name = draft.name;
      body.description = draft.description;
    }
    if(section === 'product' || section === 'all') body.product = draft.product;
    if(section === 'options' || section === 'all') body.options = draft.options;
    if(section === 'attributes' || section === 'all') body.attributes = this.ownAttributes;
    if(['attributes', 'defaults', 'all'].includes(section)) body.defaults = this.defaults;
    return body;
  }

  /*
    Saving. `pending` holds changes a tab has that the draft does not yet (text still in a tag box, say).
  */
  save = async (section = 'all', pending = {}) => {
    if(this.saving) return;
    if(Object.keys(pending).length) this.set(pending);
    if(!this.draft.name.trim()){
      Toast.error('Give the template a name on the Details tab first');
      return;
    }
    this.saving = true;
    this.notify();
    const [error, saved] = this.editing
      ? await updateTemplate(this.key, this.payload(section))
      : await createTemplate({ ...this.payload('all'), name: this.draft.name });
    this.saving = false;
    if(error){
      Toast.error(error.msg);
      this.notify();
      return;
    }
    if(!this.editing && saved?.template?.key){
      this.key = saved.template.key;
      history.replaceState(null, '', `/admin/extension/kempo-products/template?key=${encodeURIComponent(this.key)}`);
    }
    Toast.success(`Saved ${this.draft.name}`);
    this.notify();
  };
}

customElements.define('k-products-template-form', TemplateForm);
