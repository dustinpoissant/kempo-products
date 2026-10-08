import ShadowComponent from '/kempo-ui/components/ShadowComponent.js';
import { html } from '/kempo-ui/lit-all.min.js';
import '/kempo-ui/components/Toggle.js';
import '/kempo-ui/components/Rating.js';

/*
  The form control for one custom field, with its label and description. `field` is a field
  definition from the API and `value` its current value.

    <k-prod-field-input .field=${field} .value=${product.fields[field.key]}></k-prod-field-input>

  Fires `change` with { key, value }. An empty value is '' (which the API reads as "no value"), and
  a boolean is always true or false.
*/
export default class FieldInput extends ShadowComponent {
  static properties = {
    field: { attribute: false },
    value: { attribute: false },
    disabled: { type: Boolean, reflect: true },
  };

  constructor(){
    super();
    this.field = null;
    this.value = '';
    this.disabled = false;
  }

  /*
    Event handlers
  */
  emit = value => {
    this.value = value;
    this.dispatchEvent(new CustomEvent('change', { detail: { key: this.field.key, value }, bubbles: true }));
  };

  handleInput = event => this.emit(event.target.value);

  handleNumber = event => this.emit(event.target.value === '' ? '' : Number(event.target.value));

  /*
    View
  */
  control(){
    const { field, value, disabled } = this;
    const id = `f-${field.key}`;
    switch(field.type){
      case 'longtext':
        return html`<textarea id=${id} class="full" rows="3" .value=${value ?? ''} ?disabled=${disabled} @input=${this.handleInput}></textarea>`;
      case 'number':
        return html`<input type="number" step="any" id=${id} class="full" .value=${value ?? ''} ?disabled=${disabled} @input=${this.handleNumber}>`;
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
          <option value="">${field.required ? 'Choose…' : 'None'}</option>
          ${field.options.map(option => html`<option value=${option} ?selected=${option === value}>${option}</option>`)}
        </select>`;
      default:
        return html`<input type="text" id=${id} class="full" .value=${value ?? ''} ?disabled=${disabled} @input=${this.handleInput}>`;
    }
  }

  render(){
    const { field } = this;
    if(!field) return html``;
    return html`<div class="mb">
      <label class="d-b mbq" for=${`f-${field.key}`}>${field.label}${field.required ? ' *' : ''}</label>
      ${this.control()}
      ${field.description ? html`<small class="d-b tc-muted">${field.description}</small>` : ''}
    </div>`;
  }
}

customElements.define('k-prod-field-input', FieldInput);
