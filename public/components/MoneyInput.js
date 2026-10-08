import ShadowComponent from '/kempo-ui/components/ShadowComponent.js';
import { html } from '/kempo-ui/lit-all.min.js';
import { parseMoney, formatMoney } from '/products/sdk.js';

/*
  An amount of money. `value` is a whole number of the smallest currency unit (4999 is 49.99), or
  null when empty; what a person types is parsed into it, so "49.99", "$49.99" and "49.9" all work.
  With `signed`, amounts read as adjustments: "+1.00", "-1.00" and "0.00".

    <k-prod-money .value=${4999} decimals="2"></k-prod-money>
    <k-prod-money signed .value=${-100}></k-prod-money>

  Fires `change` with { value } whenever the text is a valid amount (or empty).
*/
export default class MoneyInput extends ShadowComponent {
  static properties = {
    value: { type: Number },
    decimals: { type: Number },
    signed: { type: Boolean },
    placeholder: { type: String },
    disabled: { type: Boolean, reflect: true },
    label: { type: String },
    text: { state: true },
    invalid: { state: true },
  };

  constructor(){
    super();
    this.value = null;
    this.decimals = 2;
    this.signed = false;
    this.placeholder = '';
    this.disabled = false;
    this.label = '';
    this.text = '';
    this.invalid = false;
    this.focused = false;
  }

  /*
    Lifecycle callbacks
  */
  willUpdate(changed){
    if(changed.has('value') && !this.focused) this.text = this.display();
  }

  /*
    Utility functions
  */
  display = () => this.value === null || this.value === undefined ? '' : formatMoney(this.value, this.decimals, { signed: this.signed });

  /*
    Event handlers
  */
  handleInput = event => {
    this.text = event.target.value;
    if(!this.text.trim()){
      this.invalid = false;
      this.value = null;
      this.dispatchEvent(new CustomEvent('change', { detail: { value: null }, bubbles: true }));
      return;
    }
    const minor = parseMoney(this.text, this.decimals);
    this.invalid = minor === null;
    if(minor === null) return;
    this.value = minor;
    this.dispatchEvent(new CustomEvent('change', { detail: { value: minor }, bubbles: true }));
  };

  handleFocus = () => {
    this.focused = true;
  };

  handleBlur = () => {
    this.focused = false;
    if(!this.invalid) this.text = this.display();
  };

  /*
    View
  */
  render(){
    return html`<input
      type="text"
      inputmode="decimal"
      class="full"
      style=${this.invalid ? 'border-color: var(--c_danger)' : ''}
      aria-label=${this.label || 'Amount'}
      aria-invalid=${this.invalid ? 'true' : 'false'}
      placeholder=${this.placeholder}
      .value=${this.text}
      ?disabled=${this.disabled}
      @input=${this.handleInput}
      @focus=${this.handleFocus}
      @blur=${this.handleBlur}
    >`;
  }
}

customElements.define('k-prod-money', MoneyInput);
