import ShadowComponent from '/kempo-ui/components/ShadowComponent.js';
import { html } from '/kempo-ui/lit-all.min.js';
import '/kempo-ui/components/Icon.js';
import '/products/components/MoneyInput.js';

/*
  Edits a product's options: the choices a buyer makes (colour, clear coat, size). Each choice has
  a price that is, by default, relative to the product's base price: "-1.00" takes a dollar off,
  "0.00" changes nothing. An option set to "replace the base price" instead uses its choice's price
  as the price, the way most shops price variations.

    <k-prod-options-editor .value=${product.options} decimals="2"></k-prod-options-editor>

  `managed` is the name of an extension that keeps stock in step with something else; it decides
  which choices are in stock, so that box is shown read-only. Fires `change` with { value }: the
  whole list of options.
*/
export default class OptionsEditor extends ShadowComponent {
  static properties = {
    value: { attribute: false },
    decimals: { type: Number },
    managed: { type: String },
    options: { state: true },
  };

  constructor(){
    super();
    this.value = [];
    this.decimals = 2;
    this.managed = '';
    this.options = [];
  }

  /*
    Lifecycle callbacks
  */
  willUpdate(changed){
    if(changed.has('value')) this.options = structuredClone(this.value ?? []);
  }

  /*
    Utility functions
  */
  commit = options => {
    this.options = options;
    this.dispatchEvent(new CustomEvent('change', { detail: { value: structuredClone(options) }, bubbles: true }));
  };

  patchOption = (index, changes) => this.commit(this.options.map((option, i) => i === index ? { ...option, ...changes } : option));

  patchChoice = (index, choiceIndex, changes) => this.patchOption(index, {
    choices: this.options[index].choices.map((choice, i) => i === choiceIndex ? { ...choice, ...changes } : choice),
  });

  /*
    Event handlers
  */
  addOption = () => this.commit([...this.options, {
    label: '', required: true, priceType: 'adjust', choices: [{ label: '', price: 0, available: true }],
  }]);

  removeOption = index => this.commit(this.options.filter((_, i) => i !== index));

  addChoice = index => this.patchOption(index, { choices: [...this.options[index].choices, { label: '', price: 0, available: true }] });

  removeChoice = (index, choiceIndex) => this.patchOption(index, { choices: this.options[index].choices.filter((_, i) => i !== choiceIndex) });

  /*
    View
  */
  renderChoice(option, index, choice, choiceIndex){
    const replacing = option.priceType === 'replace';
    return html`<div class="d-f mbh" style="align-items: center; gap: var(--spacer_h); flex-wrap: nowrap;">
      <input type="text" class="flex" style="width: auto; min-width: 0; margin: 0;" placeholder="Choice, e.g. Red" aria-label="Choice name"
        .value=${choice.label} @input=${event => this.patchChoice(index, choiceIndex, { label: event.target.value })}>
      <k-prod-money style="width: 8rem;" ?signed=${!replacing} decimals=${this.decimals} .value=${choice.price} placeholder=${replacing ? 'Price' : '+/- 0.00'}
        label=${replacing ? 'Price of this choice' : 'Price change for this choice'}
        @change=${event => this.patchChoice(index, choiceIndex, { price: event.detail.value ?? 0 })}></k-prod-money>
      <label class="checkbox" style="margin: 0; white-space: nowrap;" title=${this.managed ? `In stock is kept up to date by ${this.managed}` : 'Untick when this choice is sold out'}>
        <input type="checkbox" .checked=${choice.available} ?disabled=${Boolean(this.managed)}
          @change=${event => this.patchChoice(index, choiceIndex, { available: event.target.checked })}> In stock
      </label>
      <button type="button" class="no-btn tc-danger" style="cursor: pointer;" title="Remove this choice" aria-label="Remove this choice"
        ?disabled=${option.choices.length < 2} @click=${() => this.removeChoice(index, choiceIndex)}><k-icon name="delete"></k-icon></button>
    </div>`;
  }

  renderOption(option, index){
    return html`<div class="card mb">
      <div class="d-f mbh" style="align-items: center; gap: var(--spacer_h); flex-wrap: nowrap;">
        <input type="text" class="flex" style="width: auto; min-width: 0; margin: 0;" placeholder="Option, e.g. Clear coat" aria-label="Option name"
          .value=${option.label} @input=${event => this.patchOption(index, { label: event.target.value })}>
        <select style="width: auto; margin: 0;" aria-label="How the choice prices work" @change=${event => this.patchOption(index, { priceType: event.target.value })}>
          <option value="adjust" ?selected=${option.priceType === 'adjust'}>Adds to the base price</option>
          <option value="replace" ?selected=${option.priceType === 'replace'}>Replaces the base price</option>
        </select>
        <label class="checkbox" style="margin: 0; white-space: nowrap;">
          <input type="checkbox" .checked=${option.required} @change=${event => this.patchOption(index, { required: event.target.checked })}> Required
        </label>
        <button type="button" class="no-btn tc-danger" style="cursor: pointer;" title="Remove this option" aria-label="Remove this option"
          @click=${() => this.removeOption(index)}><k-icon name="delete"></k-icon></button>
      </div>
      ${option.choices.map((choice, choiceIndex) => this.renderChoice(option, index, choice, choiceIndex))}
      <button type="button" class="btn mbh" @click=${() => this.addChoice(index)}><k-icon name="add"></k-icon> Add choice</button>
    </div>`;
  }

  render(){
    return html`<div>
      ${this.managed ? html`<p class="tc-muted">Which choices are in stock is kept up to date by the ${this.managed} extension.</p>` : ''}
      ${this.options.map((option, index) => this.renderOption(option, index))}
      <button type="button" class="btn" @click=${this.addOption}><k-icon name="add"></k-icon> Add option</button>
      ${this.options.length ? html`<small class="d-b tc-muted mtq">A choice is added to the base price by default: -1.00 takes a dollar off and 0.00 changes nothing. Only one option can replace the base price.</small>` : ''}
    </div>`;
  }
}

customElements.define('k-prod-options-editor', OptionsEditor);
