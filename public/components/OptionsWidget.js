import ProductPart from '/products/components/ProductPart.js';
import { html, css, nothing } from '/kempo-ui/lit-all.min.js';
import { parseDefaults } from '/products/utils/optionDefaults.js';

/*
  The options of the product in the Parent Product it sits in, one dropdown each, as a product page shows them. Choosing
  one changes the choices the Parent Product holds, so the price and any add-to-cart button follow.
*/
class OptionsWidget extends ProductPart {
  static properties = {
    defaults: { type: String }
  };

  static styles = css`
    :host { display: block; }
  `;

  constructor(){
    super();
    this.defaults = '';
    this.startedWith = null;
  }

  /* The page's chosen starting choices are applied once for each product and each change of the setting, never over a buyer's choice. */
  updated(changed){
    super.updated?.(changed);
    if(!this.product) return;
    const started = `${this.product.id}|${this.defaults}`;
    if(started === this.startedWith) return;
    const first = this.startedWith === null;
    this.startedWith = started;
    if(first && !this.defaults) return;
    this.parentProduct.applyDefaults(parseDefaults(this.defaults));
  }

  choiceLabel(option, choice){
    const config = this.parentProduct.config;
    const price = config?.showPrices && choice.price !== 0
      ? ` (${option.priceType === 'replace' ? this.parentProduct.money(choice.price) : `${choice.price < 0 ? '−' : '+'}${this.parentProduct.money(Math.abs(choice.price))}`})`
      : '';
    return `${choice.label}${price}${choice.available ? '' : ' - sold out'}`;
  }

  render(){
    if(!this.parentProduct) return html`<p class="tc-muted">Place this in a Parent Product</p>`;
    if(!this.product) return nothing;
    return html`${this.product.options.map(option => html`<div class="mb">
      <label class="d-b mbq" for="opt-${option.key}">${option.label}${option.required ? '' : ' (optional)'}</label>
      <select id="opt-${option.key}" class="full" @change=${event => this.parentProduct.chooseOption(option, event.target.value)}>
        <option value="">${option.required ? 'Choose…' : 'None'}</option>
        ${option.choices.map(choice => html`<option value=${choice.key} ?disabled=${!choice.available} ?selected=${this.parentProduct.selections[option.key] === choice.key}>${this.choiceLabel(option, choice)}</option>`)}
      </select>
    </div>`)}`;
  }
}

customElements.define('k-products-options-widget', OptionsWidget);
