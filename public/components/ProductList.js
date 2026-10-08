import ShadowComponent from '/kempo-ui/components/ShadowComponent.js';
import { html } from '/kempo-ui/lit-all.min.js';
import '/kempo-ui/components/Pagination.js';
import '/kempo-ui/components/Spinner.js';
import { getConfig, getProducts, getTypes, getFields } from '/products/sdk.js';
import '/products/components/ProductCard.js';

const SORT_LABELS = { newest: 'Newest', oldest: 'Oldest', name: 'Name', 'price-asc': 'Price: low to high', 'price-desc': 'Price: high to low' };

/*
  The public product list: search, filters, sorting and paging. What is searched and filtered is in
  the address, so a filtered list can be bookmarked or shared and survives a refresh:

    /products/?q=camaro&type=model-car&sort=price-asc&page=2&f.scale=1:18

  Set `type` to pin the list to one product type, or `page-size` to change how many show per page.

    <k-prod-list></k-prod-list>
    <k-prod-list type="model-car" page-size="12"></k-prod-list>
*/
export default class ProductList extends ShadowComponent {
  static properties = {
    type: { type: String, reflect: true },
    pageSize: { type: Number, attribute: 'page-size' },
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
    this.pageSize = 0;
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
    window.addEventListener('popstate', this.restore);
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

  /* Reads the address into the query and loads. */
  restore = () => {
    const params = new URLSearchParams(location.search);
    const filters = {};
    for(const [name, value] of params) if(name.startsWith('f.') && value) filters[name.slice(2)] = value;
    this.query = {
      q: params.get('q') ?? '',
      type: this.type || params.get('type') || '',
      sort: params.get('sort') || 'newest',
      page: Math.max(parseInt(params.get('page')) || 1, 1),
      filters,
    };
    this.load();
  };

  /* Writes the query into the address (without adding a history entry for every keystroke). */
  remember = () => {
    const { q, type, sort, page, filters } = this.query;
    const params = new URLSearchParams();
    if(q) params.set('q', q);
    if(type && !this.type) params.set('type', type);
    if(sort !== 'newest') params.set('sort', sort);
    if(page > 1) params.set('page', String(page));
    for(const [key, value] of Object.entries(filters)) if(value) params.set(`f.${key}`, value);
    history.replaceState(null, '', `${location.pathname}${params.size ? `?${params}` : ''}`);
  };

  load = async () => {
    this.loading = true;
    const size = this.pageSize || this.config.pageSize;
    const { q, type, sort, page, filters } = this.query;
    const [error, data] = await getProducts({
      q, type: type || undefined, status: 'published', sort, filters, limit: size, offset: (page - 1) * size,
    });
    this.loading = false;
    if(error){
      this.error = error.msg;
      return;
    }
    this.products = data.items;
    this.images = data.images;
    this.total = data.total;
  };

  change = changes => {
    this.query = { ...this.query, page: 1, ...changes };
    this.remember();
    this.load();
  };

  /* The select fields that apply to the chosen type (or to every product when no type is chosen). */
  get filterFields(){
    const { type } = this.query;
    return this.fields.filter(field => !field.productType || (type && field.productType === type));
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
    const size = this.pageSize || this.config.pageSize;
    if(itemsPerPage !== size) return;
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
    const size = this.pageSize || this.config.pageSize;
    return html`<div>
      ${this.renderControls()}
      ${this.loading ? html`<k-spinner></k-spinner>` : this.products.length ? html`
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr)); gap: var(--spacer);">
          ${this.products.map(product => html`<k-prod-card .product=${product} .images=${this.images} .config=${this.config}></k-prod-card>`)}
        </div>
        ${this.total > size ? html`<k-pagination style="margin-top: var(--spacer)" controls="simple" .page=${this.query.page} .totalItems=${this.total} .itemsPerPage=${size} @page-change=${this.handlePage}></k-pagination>` : ''}
      ` : html`<p class="tc-muted">No products found.</p>`}
    </div>`;
  }
}

customElements.define('k-prod-list', ProductList);
