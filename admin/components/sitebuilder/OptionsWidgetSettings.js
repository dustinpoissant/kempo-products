import WidgetSettings from '/kempo-ui/components/pagebuilder/WidgetSettings.js';
import { html } from '/kempo-ui/lit-all.min.js';
import { findNode } from '/kempo-ui/utils/pageTree.js';
import { getProduct } from '/products/sdk.js';
import { parseDefaults, defaultsText, usableDefaults } from '/products/utils/optionDefaults.js';

const NONE = '~none';

/*
  The settings of the Product options widget: a dropdown for each option of the product in the Parent Product it sits in,
  to choose what the page starts on. "Product default" leaves it to the product's own default choice, and "None" starts it empty so the visitor must choose.
*/
export default class OptionsWidgetSettings extends WidgetSettings {
  static properties = {
    ...WidgetSettings.properties,
    product: { state: true },
    failed: { state: true }
  };

  constructor(){
    super();
    this.product = null;
    this.failed = false;
    this.loadedFor = '';
  }

  /*
    Lifecycle callbacks
  */

  willUpdate(){
    const productId = this.parentProductId();
    if(productId === this.loadedFor) return;
    this.loadedFor = productId;
    this.product = null;
    this.failed = false;
    if(productId) this.load(productId);
  }

  /*
    Public methods
  */

  load = async productId => {
    const [error, data] = await getProduct(productId);
    if(this.loadedFor !== productId) return;
    this.failed = !!error;
    this.product = error ? null : data.product;
  };

  /*
    Event handlers
  */

  choose = (option, key) => {
    const picked = parseDefaults(this.node.attrs?.defaults);
    if(key === NONE) picked[option.key] = '';
    else if(key) picked[option.key] = key;
    else delete picked[option.key];
    this.set('defaults', defaultsText(picked), false);
  };

  /*
    Utility methods
  */

  /* The product of the nearest Parent Product above this widget, or '' when it is not inside one or has none chosen. */
  parentProductId(){
    let found = findNode(this.host.nodes, this.node.id);
    while(found?.parent){
      if(found.parent.type === 'kempo-products-parent') return found.parent.attrs?.['product-id'] || '';
      found = findNode(this.host.nodes, found.parent.id);
    }
    return '';
  }

  /*
    Drawing
  */

  render(){
    if(!this.loadedFor) return html`<p class="tc-muted mb">Place this in a Parent Product with a product chosen, then choose what each option starts on here.</p>`;
    if(this.failed) return html`<p class="tc-danger mb">The product's options could not be loaded.</p>`;
    if(!this.product) return html`<p class="tc-muted mb">Loading the product's options</p>`;
    const options = this.product.options ?? [];
    if(!options.length) return html`<p class="tc-muted mb">This product has no options.</p>`;
    const stored = parseDefaults(this.node.attrs?.defaults);
    const picked = usableDefaults(this.product, stored);
    return html`
      <div class="mb">
        <span class="d-b mbq">Starting choices<small class="d-b tc-muted">What each option is set to when the page loads. Visitors can still change them.</small></span>
        ${options.map(option => {
          const own = option.choices.find(choice => choice.default && choice.available);
          return html`
            <div class="mbq">
              <label class="d-b mbq" for="sb-default-${option.key}">${option.label}</label>
              <select id="sb-default-${option.key}" class="full" @change=${event => this.choose(option, event.target.value)}>
                <option value="" ?selected=${stored[option.key] === undefined}>Product default${own ? ` (${own.label})` : ' (none)'}</option>
                <option value=${NONE} ?selected=${stored[option.key] === ''}>None (the visitor chooses)</option>
                ${option.choices.map(choice => html`<option value=${choice.key} ?disabled=${!choice.available} ?selected=${picked[option.key] === choice.key}>${choice.label}${choice.available ? '' : ' - sold out'}</option>`)}
              </select>
            </div>`;
        })}
      </div>
      ${this.renderFields(['defaults'])}
    `;
  }
}

customElements.define('k-products-options-settings', OptionsWidgetSettings);
