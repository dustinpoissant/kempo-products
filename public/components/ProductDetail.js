import ShadowComponent from '/kempo-ui/components/ShadowComponent.js';
import { html } from '/kempo-ui/lit-all.min.js';
import '/kempo-ui/components/Icon.js';
import '/kempo-ui/components/Spinner.js';
import { getConfig, getProduct, getPrice, displayMoney, formatMoney } from '/products/sdk.js';

/*
  A product's page: pictures, price, the options a buyer chooses and the details of its type.

  Choosing an option writes it into the address (/products/camaro/?color=red&clear-coat=no), so a
  refresh or a shared link comes back with the same choices selected. A choice that does not exist
  or is sold out in the address is ignored. The price shown is the server's, asked for again every
  time the choices change, so it is always the number that would be charged.

    <k-prod-detail slug="1969-camaro"></k-prod-detail>

  Without a `slug` it uses the last part of the address. Fires `selection-change` with
  { product, selections, price } whenever the choices (or the price they make) change; an extension
  that adds a buy button reads the choices from it. Slot `actions` holds that button, and slot
  `extra` anything else an extension wants under the description.
*/
export default class ProductDetail extends ShadowComponent {
  static properties = {
    slug: { type: String },
    config: { state: true },
    data: { state: true },
    selections: { state: true },
    price: { state: true },
    pricing: { state: true },
    activeImage: { state: true },
    loading: { state: true },
    error: { state: true },
  };

  constructor(){
    super();
    this.slug = '';
    this.config = null;
    this.data = null;
    this.selections = {};
    this.price = null;
    this.pricing = false;
    this.activeImage = 0;
    this.loading = true;
    this.error = '';
    this.priceRequest = 0;
  }

  /*
    Lifecycle callbacks
  */
  connectedCallback(){
    super.connectedCallback();
    window.addEventListener('popstate', this.readSelections);
    this.load();
  }

  disconnectedCallback(){
    window.removeEventListener('popstate', this.readSelections);
    super.disconnectedCallback();
  }

  /*
    Utility functions
  */
  load = async () => {
    const slug = this.slug || location.pathname.split('/').filter(Boolean).at(-1);
    const [[configError, config], [error, data]] = await Promise.all([getConfig(), getProduct(slug)]);
    this.loading = false;
    if(configError || error){
      this.error = (error ?? configError).code === 404 ? 'This product could not be found.' : (error ?? configError).msg;
      return;
    }
    this.config = config;
    this.data = data;
    document.title = `${data.product.name} - ${document.title.split(' - ').at(-1) || ''}`.replace(/ - $/, '');
    this.readSelections();
  };

  /*
    Reads the address into the choices. Anything that is not a real, available choice is dropped,
    and a required option with exactly one available choice is chosen for the buyer.
  */
  readSelections = () => {
    if(!this.data) return;
    const params = new URLSearchParams(location.search);
    const selections = {};
    for(const option of this.data.product.options){
      const wanted = params.get(option.key);
      const choice = option.choices.find(candidate => candidate.key === wanted && candidate.available);
      if(choice) selections[option.key] = choice.key;
    }
    this.selections = selections;
    this.refreshPrice();
  };

  writeSelections = () => {
    const params = new URLSearchParams(location.search);
    for(const option of this.data.product.options){
      if(this.selections[option.key]) params.set(option.key, this.selections[option.key]); else params.delete(option.key);
    }
    history.replaceState(null, '', `${location.pathname}${params.size ? `?${params}` : ''}`);
  };

  get complete(){
    return this.data.product.options.every(option => !option.required || this.selections[option.key]);
  }

  /*
    The price for the current choices comes from the server. With a required option still unchosen
    there is no single price, so the base price is shown until every one is picked.
  */
  refreshPrice = async () => {
    const { product } = this.data;
    if(!this.config.showPrices || product.price === null){
      this.price = null;
      this.announce();
      return;
    }
    if(!this.complete){
      this.price = null;
      this.announce();
      return;
    }
    const request = ++this.priceRequest;
    this.pricing = true;
    const [error, data] = await getPrice(product.id, this.selections);
    if(request !== this.priceRequest) return;
    this.pricing = false;
    this.price = error ? null : data.price;
    this.announce();
  };

  announce = () => {
    this.dispatchEvent(new CustomEvent('selection-change', {
      detail: { product: this.data.product, selections: { ...this.selections }, price: this.price, complete: this.complete },
      bubbles: true,
      composed: true,
    }));
  };

  money = minor => displayMoney(minor, this.config.currency, this.config.decimals);

  /*
    Event handlers
  */
  choose = (option, key) => {
    const selections = { ...this.selections };
    if(key) selections[option.key] = key; else delete selections[option.key];
    this.selections = selections;
    this.writeSelections();
    this.refreshPrice();
  };

  /*
    View
  */
  get priceLine(){
    const { product } = this.data;
    if(!this.config.showPrices) return '';
    if(this.price) return this.money(this.price.unit);
    if(product.price === null) return product.priceLabel;
    const adjusts = product.options.some(option => option.priceType === 'adjust' && option.choices.some(choice => choice.price !== 0));
    return `${adjusts ? 'From ' : ''}${this.money(product.price)}`;
  }

  choiceLabel(option, choice){
    const price = this.config.showPrices && choice.price !== 0
      ? ` (${option.priceType === 'replace' ? this.money(choice.price) : `${choice.price < 0 ? '−' : '+'}${formatMoney(Math.abs(choice.price), this.config.decimals)}`})`
      : '';
    return `${choice.label}${price}${choice.available ? '' : ' - sold out'}`;
  }

  renderGallery(){
    const { product } = this.data;
    const images = product.images.map(id => this.data.images[id]).filter(Boolean);
    if(!images.length) return html`<div class="tc-muted" style="display: flex; align-items: center; justify-content: center; aspect-ratio: 4 / 3; border: 1px solid var(--c_border); border-radius: var(--radius); font-size: 3rem;"><k-icon name="image"></k-icon></div>`;
    const current = images[Math.min(this.activeImage, images.length - 1)];
    return html`<div>
      <img src=${current.path} alt=${current.alt || product.name} style="width: 100%; border-radius: var(--radius); display: block;">
      ${images.length > 1 ? html`<div class="d-f mt" style="gap: var(--spacer_h);">
        ${images.map((image, index) => html`<button type="button" class="no-btn" style="cursor: pointer; width: 4.5rem; aspect-ratio: 1; padding: 0; border: 2px solid ${index === this.activeImage ? 'var(--c_primary)' : 'transparent'}; border-radius: var(--radius); overflow: hidden;" aria-label=${`Show picture ${index + 1}`} @click=${() => { this.activeImage = index; }}>
          <img src=${image.thumbnail ?? image.path} alt="" style="width: 100%; height: 100%; object-fit: cover; display: block;">
        </button>`)}
      </div>` : ''}
    </div>`;
  }

  renderOption(option){
    const id = `opt-${option.key}`;
    return html`<div class="mb">
      <label class="d-b mbq" for=${id}>${option.label}${option.required ? '' : ' (optional)'}</label>
      <select id=${id} class="full" @change=${event => this.choose(option, event.target.value)}>
        <option value="">${option.required ? 'Choose…' : 'None'}</option>
        ${option.choices.map(choice => html`<option value=${choice.key} ?disabled=${!choice.available} ?selected=${this.selections[option.key] === choice.key}>${this.choiceLabel(option, choice)}</option>`)}
      </select>
    </div>`;
  }

  renderDetails(){
    const { product } = this.data;
    const rows = this.data.fields
      .map(field => [field, product.fields[field.key]])
      .filter(([, value]) => value !== undefined && value !== null && value !== '');
    if(!rows.length) return '';
    const show = (field, value) => {
      if(field.type === 'boolean') return value ? 'Yes' : 'No';
      if(field.type === 'rating') return `${value} / 5`;
      if(field.type === 'color') return html`<span style=${`display: inline-block; width: 1em; height: 1em; vertical-align: middle; border: 1px solid var(--c_border); background: ${/^#[0-9a-f]{6,8}$/i.test(value) ? value : 'transparent'}`}></span> ${value}`;
      return String(value);
    };
    return html`<table class="mb"><tbody>
      ${rows.map(([field, value]) => html`<tr><th scope="row" style="width: 40%;">${field.label}</th><td>${show(field, value)}</td></tr>`)}
    </tbody></table>`;
  }

  render(){
    if(this.loading) return html`<k-spinner></k-spinner>`;
    if(this.error) return html`<p class="tc-muted">${this.error}</p>`;
    const { product, type } = this.data;
    const status = product.availability === 'sold' ? 'Sold' : product.availability === 'pending' ? 'Sale pending' : !product.inStock ? 'Out of stock' : '';
    return html`<article class="row" style="gap: var(--spacer) 0;">
      <div class="span-12 d-span-6" style="padding-right: var(--spacer);">${this.renderGallery()}</div>
      <div class="span-12 d-span-6">
        ${type ? html`<div class="tc-muted small">${type.name}</div>` : ''}
        <h1>${product.name}</h1>
        <div class="large mb" aria-live="polite">${this.priceLine}${this.pricing ? html` <k-spinner size="xs"></k-spinner>` : ''}</div>
        ${status ? html`<p><strong>${status}</strong></p>` : ''}
        ${product.options.map(option => this.renderOption(option))}
        <slot name="actions"></slot>
        ${product.description ? html`<div style="white-space: pre-line;" class="mb">${product.description}</div>` : ''}
        ${this.renderDetails()}
        ${product.tags.length ? html`<p class="tc-muted small">${product.tags.join(' · ')}</p>` : ''}
        <slot name="extra"></slot>
      </div>
    </article>`;
  }
}

customElements.define('k-prod-detail', ProductDetail);
