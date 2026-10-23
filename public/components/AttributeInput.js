import ShadowComponent from '/kempo-ui/components/ShadowComponent.js';
import { html } from '/kempo-ui/lit-all.min.js';
import '/kempo-ui/components/Toggle.js';
import '/kempo-ui/components/Rating.js';
import '/products/components/MoneyInput.js';

/*
  The form control for one custom attribute, with its label and description. `attribute` is an attribute
  definition from the API and `value` its current value.

    <k-products-attribute-input .attribute=${attribute} .value=${product.attributes[attribute.key]}></k-products-attribute-input>

  Fires `change` with { key, value }. An empty value is '' (which the API reads as "no value"), and
  a boolean is always true or false.
*/
export default class AttributeInput extends ShadowComponent {
  static properties = {
    attribute: { attribute: false },
    value: { attribute: false },
    disabled: { type: Boolean, reflect: true },
    decimals: { type: Number },
    currency: { type: String },
    fallback: { attribute: false },
  };

  constructor(){
    super();
    this.attribute = null;
    this.value = '';
    this.disabled = false;
    this.decimals = 2;
    this.currency = 'USD';
    this.fallback = undefined;
  }

  /*
    Event handlers
  */
  emit = value => {
    this.value = value;
    this.dispatchEvent(new CustomEvent('change', { detail: { key: this.attribute.key, value }, bubbles: true }));
  };

  handleInput = event => this.emit(event.target.value);

  handleNumber = event => this.emit(event.target.value === '' ? '' : Number(event.target.value));


  /*
    View
  */
  control(){
    const { attribute, value, disabled } = this;
    const id = `f-${attribute.key}`;
    switch(attribute.type){
      case 'longtext':
        return html`<textarea id=${id} class="full" rows="3" .value=${value ?? ''} ?disabled=${disabled} @input=${this.handleInput}></textarea>`;
      case 'number':
        return html`<input type="number" step="any" id=${id} class="full" .value=${value ?? ''} ?disabled=${disabled} @input=${this.handleNumber}>`;
      case 'currency':
        return html`<div class="d-f" style="align-items: center;"><k-products-money decimals=${this.decimals} .value=${value === '' || value === undefined ? null : value} placeholder="No charge" label=${attribute.label} ?disabled=${disabled} @change=${event => this.emit(event.detail.value === null ? '' : event.detail.value)}></k-products-money><span class="tc-muted mxh">${this.currency.toUpperCase()}</span></div>`;
      case 'date':
        return html`<input type="date" id=${id} class="full" .value=${value ?? ''} ?disabled=${disabled} @input=${this.handleInput}>`;
      case 'color':
        return html`<div class="d-f" style="align-items: center; gap: var(--spacer_h);">
          <input type="color" id=${id} .value=${value || '#000000'} ?disabled=${disabled} @input=${this.handleInput}>
          ${value ? html`<button type="button" class="no-btn tc-muted" style="cursor: pointer;" @click=${() => this.emit('')}>Clear</button>` : html`<span class="tc-muted">None</span>`}
        </div>`;
      case 'rating':
        return html`<div class="d-f" style="align-items: center; gap: var(--spacer_h);">
          <k-rating id=${id} .value=${Number(value) || 0} @change=${event => this.emit(event.currentTarget.value || '')}></k-rating>
          ${value ? html`<button type="button" class="no-btn tc-muted" style="cursor: pointer;" @click=${() => this.emit('')}>Clear</button>` : ''}
        </div>`;
      case 'boolean':
        return html`<k-toggle id=${id} .value=${value === true} ?disabled=${disabled} @change=${event => this.emit(event.currentTarget.value === true)}></k-toggle>`;
      case 'select':
        return html`<select id=${id} class="full" ?disabled=${disabled} @change=${this.handleInput}>
          <option value="">${attribute.required ? 'Choose…' : 'None'}</option>
          ${attribute.options.map(option => html`<option value=${option} ?selected=${option === value}>${option}</option>`)}
        </select>`;
      default:
        return html`<input type="text" id=${id} class="full" .value=${value ?? ''} ?disabled=${disabled} @input=${this.handleInput}>`;
    }
  }

  get hasFallback(){
    return ![null, undefined, ''].includes(this.fallback);
  }

  /* The default a blank value falls back to, in words. */
  get fallbackText(){
    const { attribute, fallback } = this;
    if(!this.hasFallback || (this.value !== '' && this.value !== undefined && this.value !== null)) return '';
    if(attribute.type === 'currency') return `${(fallback / 10 ** this.decimals).toFixed(this.decimals)} ${this.currency.toUpperCase()}`;
    if(attribute.type === 'boolean') return fallback ? 'Yes' : 'No';
    return String(fallback);
  }

  render(){
    const { attribute } = this;
    if(!attribute) return html``;
    return html`<div class="mb">
      <label class="d-b mbq" for=${`f-${attribute.key}`}>${attribute.label}${attribute.required && !this.hasFallback ? ' *' : ''}${attribute.description ? html`<small class="d-b tc-muted">${attribute.description}</small>` : ''}${this.fallbackText ? html`<small class="d-b tc-muted">Blank uses the template default: ${this.fallbackText}.</small>` : ''}</label>
      ${this.control()}
    </div>`;
  }
}

customElements.define('k-products-attribute-input', AttributeInput);
