import ShadowComponent from '/kempo-ui/components/ShadowComponent.js';
import { html } from '/kempo-ui/lit-all.min.js';
import sanitizeHtml from '/kempo-ui/utils/sanitizeHtml.js';
import '/kempo-ui/components/Icon.js';
import '/kempo-ui/components/Spinner.js';
import { getConfig, getProduct, getPrice, displayMoney, formatMoney } from '/products/sdk.js';
import { syncActions } from '/products/components/actions.js';
import renderGallery from '/products/utils/renderGallery.js';
import { primaryPicture } from '/products/utils/productMedia.js';
import renderText from '/products/utils/renderText.js';

/*
  A product's page: pictures, price, the options a buyer chooses and its details.

  Choosing an option writes it into the address (/products/camaro/?color=red&clear-coat=no), so a
  refresh or a shared link comes back with the same choices selected. A choice that does not exist
  or is sold out in the address is ignored. The price shown is the server's, asked for again every
  time the choices change, so it is always the number that would be charged.

    <k-products-detail slug="1969-camaro"></k-products-detail>

  Without a `slug` it uses the last part of the address. Fires `selection-change` with
  { product, selections, price, complete } whenever the choices (or the price they make) change.

  Other extensions add to the page by composition, through slots. A component an extension puts in one is
  an ordinary child of this element and finds it with `closest('k-products-detail')`. It reads `product`,
  `selections`, `price` and `complete` from here (and `config` and `money(minor)` to show an amount), and
  listens for `selection-change` on it to follow the buyer's choices.
    top                 full width above the pictures and the column beside them (a sale banner)
    price               has the price line as its default content. An extension that shows it differently (a sale
                        price with the old one struck through) puts its own element here and the default is not shown
    before-options      in the right column, after the short description and above the options
    actions             under the options, such as add to cart
    extra               under the tags, in the right column
    before-description  full width, above the full description
    after-description   full width, between the full description and the table of attributes
    bottom              full width, at the very bottom (recommended products, reviews, a discussion)
  Every slot but price holds any number of elements and has no default content. A slot nothing fills takes no room.
  Elements registered with registerProductAction (see actions.js) are still placed under the options
  for extensions that have not moved over.

  The short description sits between the price and the options. The full description is full width under the
  picture and the column beside it, and the table of attributes is full width under that, at the very bottom.
*/
export default class ProductDetail extends ShadowComponent {
  static properties = {
    slug: { type: String },
    noUrl: { type: Boolean, attribute: 'no-url' },
    noFullscreen: { type: Boolean, attribute: 'no-fullscreen' },
    config: { state: true },
    data: { state: true },
    selections: { state: true },
    price: { state: true },
    pricing: { state: true },
    loading: { state: true },
    error: { state: true },
  };

  constructor(){
    super();
    this.slug = '';
    this.noUrl = false;
    this.noFullscreen = false;
    this.config = null;
    this.data = null;
    this.selections = {};
    this.price = null;
    this.pricing = false;
    this.loading = true;
    this.error = '';
    this.priceRequest = 0;
    this.slotWatcher = new MutationObserver(() => this.requestUpdate());
  }

  /*
    Lifecycle callbacks
  */
  connectedCallback(){
    super.connectedCallback();
    window.addEventListener('popstate', this.readSelections);
    window.addEventListener('products-actions-changed', this.refreshActions);
    this.slotWatcher.observe(this, { childList: true });
    this.load();
  }

  disconnectedCallback(){
    window.removeEventListener('popstate', this.readSelections);
    window.removeEventListener('products-actions-changed', this.refreshActions);
    this.slotWatcher.disconnect();
    super.disconnectedCallback();
  }

  /* What a component inside the page reads: the product being shown, or null until it has loaded. */
  get product(){
    return this.data?.product ?? null;
  }

  updated(){
    if(!this.data) return;
    syncActions(this.renderRoot.querySelector('[data-actions]'), 'detail', {
      product: this.data.product, selections: this.selections, price: this.price, complete: this.complete,
    });
  }

  refreshActions = () => this.requestUpdate();

  /*
    Utility functions
  */
  load = async () => {
    const slug = this.slug || location.pathname.split('/').filter(Boolean).at(-1);
    const [[configError, config], [error, data]] = await Promise.all([getConfig(), getProduct(slug)]);
    this.loading = false;
    if(configError || error){
      this.error = (error ?? configError).code === 404 ? 'This product could not be found.' : (error ?? configError).msg;
      /* The page itself answers 200 (the product is looked up in the browser), so tell crawlers not to index a missing one. */
      const robots = document.createElement('meta');
      robots.name = 'robots';
      robots.content = 'noindex';
      document.head.append(robots);
      return;
    }
    this.config = config;
    this.data = data;
    document.title = `${data.product.name} - ${document.title.split(' - ').at(-1) || ''}`.replace(/ - $/, '');
    this.describePage();
    this.readSelections();
  };

  /*
    What a search engine reads: a meta description and schema.org Product data, so the product can
    show up with its picture, price and whether it is in stock. A product with no price, or on a
    site that hides prices, says nothing about an offer.
  */
  describePage = () => {
    const { product } = this.data;
    const image = primaryPicture(product, this.data.images);
    const absolute = path => path ? new URL(path, location.origin).href : undefined;
    const description = (new DOMParser().parseFromString(sanitizeHtml(product.shortDescription || product.description).replace(/<\/(p|h[1-6]|li|div|tr|td|th|blockquote)>|<br\s*\/?>/gi, '$& '), 'text/html').body.textContent || product.name).replace(/\s+/g, ' ').trim().slice(0, 300);
    let meta = document.head.querySelector('meta[name="description"]');
    if(!meta){
      meta = document.createElement('meta');
      meta.name = 'description';
      document.head.append(meta);
    }
    meta.content = description;

    const data = { '@context': 'https://schema.org', '@type': 'Product', name: product.name, description, image: absolute(image?.path), url: location.origin + location.pathname };
    if(this.config.showPrices && product.price !== null){
      const available = product.availability === 'available' && product.inStock;
      data.offers = {
        '@type': 'Offer',
        price: formatMoney(product.price, this.config.decimals),
        priceCurrency: this.config.currency.toUpperCase(),
        availability: `https://schema.org/${product.availability === 'sold' ? 'SoldOut' : product.availability === 'pending' ? 'LimitedAvailability' : available ? 'InStock' : 'OutOfStock'}`,
      };
    }
    let script = document.head.querySelector('script#products-jsonld');
    if(!script){
      script = document.createElement('script');
      script.id = 'products-jsonld';
      script.type = 'application/ld+json';
      document.head.append(script);
    }
    script.textContent = JSON.stringify(data);
  };

  /*
    Reads the address into the choices. Anything that is not a real, available choice is dropped,
    and an option starts on its default choice.
  */
  readSelections = () => {
    if(!this.data) return;
    const params = new URLSearchParams(this.noUrl ? '' : location.search);
    const selections = {};
    for(const option of this.data.product.options){
      const wanted = params.get(option.key);
      const choice = option.choices.find(candidate => candidate.key === wanted && candidate.available);
      const preset = choice ?? option.choices.find(candidate => candidate.default && candidate.available);
      if(preset) selections[option.key] = preset.key;
    }
    this.selections = selections;
    this.refreshPrice();
  };

  writeSelections = () => {
    if(this.noUrl) return;
    const params = new URLSearchParams(location.search);
    for(const option of this.data.product.options){
      if(this.selections[option.key]) params.set(option.key, this.selections[option.key]); else params.delete(option.key);
    }
    history.replaceState(null, '', `${location.pathname}${params.size ? `?${params}` : ''}`);
  };

  /* Whether every required option is chosen. False until the product has loaded. */
  get complete(){
    if(!this.data) return false;
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

  money = minor => displayMoney(minor, this.config.currency);

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

  /*
    What credits mean for this product, when kempo-credits is in use: credits it gives, and how much
    of the price credits can pay. The amount comes with the server's price, so it follows the
    options the buyer picks.
  */
  get creditLines(){
    if(!this.config.credits?.enabled) return [];
    const { product } = this.data;
    const number = new Intl.NumberFormat();
    const lines = [];
    if(product.creditsOnly) lines.push(`Gives ${number.format(product.creditsGranted)} credits`);
    else if(product.creditsGranted > 0) lines.push(`Includes ${number.format(product.creditsGranted)} credits`);
    if(this.config.showPrices && product.creditPercent > 0){
      const credits = this.price?.credits ? ` (${number.format(this.price.credits.maxCredits)} credits)` : '';
      lines.push(product.creditPercent === 100 ? `Can be paid for entirely with credits${credits}` : `Up to ${product.creditPercent}% can be paid with credits${credits}`);
    }
    return lines;
  }

  choiceLabel(option, choice){
    const price = this.config.showPrices && choice.price !== 0
      ? ` (${option.priceType === 'replace' ? this.money(choice.price) : `${choice.price < 0 ? '−' : '+'}${formatMoney(Math.abs(choice.price), this.config.decimals)}`})`
      : '';
    return `${choice.label}${price}${choice.available ? '' : ' - sold out'}`;
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

  /* A slot's place in the page, drawn only while something is in it, so an empty one adds no gap. */
  renderSlot(name, classes){
    return [...this.children].some(child => child.slot === name) ? html`<div class=${classes}><slot name=${name}></slot></div>` : '';
  }

  renderDetails(){
    const { product } = this.data;
    const rows = this.data.attributes
      .map(attribute => [attribute, [undefined, null, ''].includes(product.attributes[attribute.key]) ? product.inherited?.[attribute.key] : product.attributes[attribute.key]])
      .filter(([, value]) => value !== undefined && value !== null && value !== '');
    if(!rows.length) return '';
    const show = (attribute, value) => {
      if(attribute.type === 'boolean') return value ? 'Yes' : 'No';
      if(attribute.type === 'rating') return `${value} / 5`;
      if(attribute.type === 'currency') return this.money(value);
      if(attribute.type === 'color') return html`<span style=${`display: inline-block; width: 1em; height: 1em; vertical-align: middle; border: 1px solid var(--c_border); background: ${/^#[0-9a-f]{6,8}$/i.test(value) ? value : 'transparent'}`}></span> ${value}`;
      return String(value);
    };
    return html`<div class="span-12"><div class="table-wrapper mb"><table class="left-headers"><tbody>
      ${rows.map(([attribute, value]) => html`<tr><th scope="row">${attribute.label}</th><td>${show(attribute, value)}</td></tr>`)}
    </tbody></table></div></div>`;
  }

  render(){
    if(this.loading) return html`<k-spinner></k-spinner>`;
    if(this.error) return html`<p class="tc-muted">${this.error}</p>`;
    const { product } = this.data;
    const status = product.availability === 'sold' ? 'Sold' : product.availability === 'pending' ? 'Sale pending' : !product.inStock ? 'Out of stock' : '';
    return html`<article class="row" style="gap: var(--spacer) 0;">
      ${this.renderSlot('top', 'span-12')}
      <div class="span-12 d-span-6" style="padding-right: var(--spacer);">${renderGallery(this.data.product, this.data.images, { noFullscreen: this.noFullscreen })}</div>
      <div class="span-12 d-span-6">
        <h1>${product.name}</h1>
        <slot name="price"><div class="large mb" aria-live="polite">${this.priceLine}${this.pricing ? html` <k-spinner size="xs"></k-spinner>` : ''}</div></slot>
        ${this.creditLines.map(line => html`<p class="tc-muted mbq">${line}</p>`)}
        ${status ? html`<p><strong>${status}</strong></p>` : ''}
        ${renderText(product.shortDescription)}
        ${this.renderSlot('before-options', 'mb')}
        ${product.options.map(option => this.renderOption(option))}
        <slot name="actions"></slot>
        <div data-actions class="mb"></div>
        ${product.tags.length ? html`<p class="tc-muted small">${product.tags.join(' · ')}</p>` : ''}
        <slot name="extra"></slot>
      </div>
      ${this.renderSlot('before-description', 'span-12')}
      ${product.description ? html`<div class="span-12">${renderText(product.description)}</div>` : ''}
      ${this.renderSlot('after-description', 'span-12')}
      ${this.renderDetails()}
      ${this.renderSlot('bottom', 'span-12')}
    </article>`;
  }
}

customElements.define('k-products-detail', ProductDetail);
