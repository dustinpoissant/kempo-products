import ShadowComponent from '/kempo-ui/components/ShadowComponent.js';
import { html } from '/kempo-ui/lit-all.min.js';
import '/kempo-ui/components/Pagination.js';
import '/kempo-ui/components/Spinner.js';
import { getConfig, getProducts, getTypes, getFields } from '/products/sdk.js';
import '/products/components/ProductCard.js';

const SORT_LABELS = { newest: 'Newest', oldest: 'Oldest', name: 'Name', 'price-asc': 'Price: low to high', 'price-desc': 'Price: high to low' };

const split = text => String(text ?? '').split(',').map(part => part.trim()).filter(Boolean);

/*
  A list of products, as a page of its own or a few picked ones on your home page. Every attribute
  is optional; see docs/components.md for examples.

  What the list is limited to (visitors cannot change these):
    type            only products of this type (a type's key, e.g. "model-car")
    tag             only products with every one of these tags, comma separated
    slugs           only these products, by slug, comma separated; shown in that order
    availability    only these, comma separated: available, pending, sold
    in-stock        only products that are not out of stock
    filters         only products whose fields match, as JSON: filters='{"scale":"1:18"}'

  Where it starts (visitors can change these unless the controls are hidden):
    search          the text in the search box
    sort            newest (default), oldest, name, price-asc, price-desc

  How it looks:
    limit           show at most this many, with no paging
    page-size       products per page (the site's page_size setting when not given)
    hide-controls   no search box, filters or sorting
    no-url          do not read or write the address. Use it for a list that is part of another
                    page, so it neither picks up ?q= from the address nor adds its own

  On a page of its own the list keeps what is searched and filtered in the address, so a filtered
  list can be bookmarked or shared and survives a refresh:

    /products/?q=camaro&type=model-car&sort=price-asc&page=2&f.scale=1:18
*/
export default class ProductList extends ShadowComponent {
  static properties = {
    type: { type: String, reflect: true },
    tag: { type: String },
    slugs: { type: String },
    availability: { type: String },
    inStock: { type: Boolean, attribute: 'in-stock' },
    filters: { type: String },
    search: { type: String },
    sort: { type: String },
    limit: { type: Number },
    pageSize: { type: Number, attribute: 'page-size' },
    hideControls: { type: Boolean, attribute: 'hide-controls' },
    noUrl: { type: Boolean, attribute: 'no-url' },
    config: { state: true },
    types: { state: true },
    fields: { state: true },
    products: { state: true },
    images: { state: true },
    total: { state: true },
    loading: { state: true },
    error: { state: true },
    query: { state: true },
  };

  constructor(){
    super();
    this.type = '';
    this.tag = '';
    this.slugs = '';
    this.availability = '';
    this.inStock = false;
    this.filters = '';
    this.search = '';
    this.sort = '';
    this.limit = 0;
    this.pageSize = 0;
    this.hideControls = false;
    this.noUrl = false;
    this.config = null;
    this.types = [];
    this.fields = [];
    this.products = [];
    this.images = {};
    this.total = 0;
    this.loading = true;
    this.error = '';
    this.query = { q: '', type: '', sort: 'newest', page: 1, filters: {} };
    this.searchTimer = null;
  }

  /*
    Lifecycle callbacks
  */
  connectedCallback(){
    super.connectedCallback();
    if(!this.noUrl) window.addEventListener('popstate', this.restore);
    this.start();
  }

  disconnectedCallback(){
    window.removeEventListener('popstate', this.restore);
    super.disconnectedCallback();
  }

  /*
    Utility functions
  */
  start = async () => {
    const [[configError, config], [typesError, types], [fieldsError, fields]] = await Promise.all([getConfig(), getTypes(), getFields()]);
    if(configError || typesError || fieldsError){
      this.error = (configError || typesError || fieldsError).msg;
      this.loading = false;
      return;
    }
    this.config = config;
    this.types = types.types;
    this.fields = fields.fields.filter(field => field.filterable && field.type === 'select');
    this.restore();
  };

  /* The `filters` attribute as an object. A mistake in it is reported in the console and ignored. */
  get fixedFilters(){
    if(!this.filters) return {};
    try {
      const parsed = JSON.parse(this.filters);
      if(parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch { /* reported below */ }
    console.warn('<k-prod-list>: the filters attribute must be a JSON object such as {"scale":"1:18"}');
    return {};
  }

  get defaultSort(){
    return this.sort || 'newest';
  }

  /* Reads the address into the query (unless the list ignores it) and loads. */
  restore = () => {
    const params = this.noUrl ? new URLSearchParams() : new URLSearchParams(location.search);
    const filters = {};
    for(const [name, value] of params) if(name.startsWith('f.') && value) filters[name.slice(2)] = value;
    this.query = {
      q: params.get('q') ?? this.search,
      type: this.type || params.get('type') || '',
      sort: params.get('sort') || this.defaultSort,
      page: Math.max(parseInt(params.get('page')) || 1, 1),
      filters,
    };
    this.load();
  };

  /* Writes the query into the address (without adding a history entry for every keystroke). */
  remember = () => {
    if(this.noUrl) return;
    const { q, type, sort, page, filters } = this.query;
    const params = new URLSearchParams();
    if(q) params.set('q', q);
    if(type && !this.type) params.set('type', type);
    if(sort !== this.defaultSort) params.set('sort', sort);
    if(page > 1) params.set('page', String(page));
    for(const [key, value] of Object.entries(filters)) if(value) params.set(`f.${key}`, value);
    history.replaceState(null, '', `${location.pathname}${params.size ? `?${params}` : ''}`);
  };

  get size(){
    return this.limit || this.pageSize || this.config.pageSize;
  }

  load = async () => {
    this.loading = true;
    const { q, type, sort, page, filters } = this.query;
    const slugs = split(this.slugs).map(slug => slug.toLowerCase());
    const [error, data] = await getProducts({
      q,
      type: type || undefined,
      status: 'published',
      tag: split(this.tag),
      slugs: slugs.length ? slugs.join(',') : undefined,
      availability: this.availability || undefined,
      inStock: this.inStock || undefined,
      sort,
      filters: { ...this.fixedFilters, ...filters },
      limit: this.size,
      offset: this.limit ? 0 : (page - 1) * this.size,
    });
    this.loading = false;
    if(error){
      this.error = error.msg;
      return;
    }
    /* Picked by slug and not sorted on purpose (no sort attribute, none chosen): show them in the order they were listed. */
    this.products = slugs.length && !this.sort && sort === 'newest' ? [...data.items].sort((a, b) => slugs.indexOf(a.slug) - slugs.indexOf(b.slug)) : data.items;
    this.images = data.images;
    this.total = data.total;
  };

  change = changes => {
    this.query = { ...this.query, page: 1, ...changes };
    this.remember();
    this.load();
  };

  /* The select fields that apply to the chosen type (or to every product when no type is chosen), except those the list is already fixed to. */
  get filterFields(){
    const { type } = this.query;
    const fixed = this.fixedFilters;
    return this.fields.filter(field => !(field.key in fixed) && (!field.productType || (type && field.productType === type)));
  }

  /*
    Event handlers
  */
  handleSearch = event => {
    const q = event.target.value;
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.change({ q }), 300);
  };

  handleFilter = (key, value) => {
    const filters = { ...this.query.filters };
    if(value) filters[key] = value; else delete filters[key];
    this.change({ filters });
  };

  handlePage = event => {
    const { currentPage, itemsPerPage } = event.detail;
    if(itemsPerPage !== this.size) return;
    if(currentPage === this.query.page) return;
    this.query = { ...this.query, page: currentPage };
    this.remember();
    this.load();
    this.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  /*
    View
  */
  renderControls(){
    const { q, type, sort, filters } = this.query;
    return html`<div class="d-f mb" style="gap: var(--spacer_h); align-items: flex-end;">
      <div class="flex" style="min-width: 12rem;">
        <label class="d-b mbq" for="q">Search</label>
        <input type="search" id="q" class="full" placeholder="Search products" .value=${q} @input=${this.handleSearch}>
      </div>
      ${!this.type && this.types.length ? html`<div>
        <label class="d-b mbq" for="type">Type</label>
        <select id="type" @change=${event => this.change({ type: event.target.value, filters: {} })}>
          <option value="">All</option>
          ${this.types.map(candidate => html`<option value=${candidate.key} ?selected=${candidate.key === type}>${candidate.name}</option>`)}
        </select>
      </div>` : ''}
      ${this.filterFields.map(field => html`<div>
        <label class="d-b mbq" for=${`f-${field.key}`}>${field.label}</label>
        <select id=${`f-${field.key}`} @change=${event => this.handleFilter(field.key, event.target.value)}>
          <option value="">Any</option>
          ${field.options.map(option => html`<option value=${option} ?selected=${filters[field.key] === option}>${option}</option>`)}
        </select>
      </div>`)}
      <div>
        <label class="d-b mbq" for="sort">Sort</label>
        <select id="sort" @change=${event => this.change({ sort: event.target.value })}>
          ${this.config.sorts.map(key => html`<option value=${key} ?selected=${key === sort}>${SORT_LABELS[key] ?? key}</option>`)}
        </select>
      </div>
    </div>`;
  }

  render(){
    if(this.error) return html`<p class="tc-muted">${this.error}</p>`;
    if(!this.config) return html`<k-spinner></k-spinner>`;
    const size = this.size;
    return html`<div>
      ${this.hideControls ? '' : this.renderControls()}
      ${this.loading ? html`<k-spinner></k-spinner>` : this.products.length ? html`
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr)); gap: var(--spacer);">
          ${this.products.map(product => html`<k-prod-card .product=${product} .images=${this.images} .config=${this.config}></k-prod-card>`)}
        </div>
        ${!this.limit && this.total > size ? html`<k-pagination style="margin-top: var(--spacer)" controls="simple" .page=${this.query.page} .totalItems=${this.total} .itemsPerPage=${size} @page-change=${this.handlePage}></k-pagination>` : ''}
      ` : html`<p class="tc-muted">No products found.</p>`}
    </div>`;
  }
}

customElements.define('k-prod-list', ProductList);
