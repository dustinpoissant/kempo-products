import ShadowComponent from '/kempo-ui/components/ShadowComponent.js';
import { html } from '/kempo-ui/lit-all.min.js';
import '/kempo-ui/components/Icon.js';
import '/products/components/AttributeInput.js';

export const LABELS = {
  text: 'Short text', longtext: 'Long text', number: 'Number', currency: 'Money', boolean: 'Yes / no', date: 'Date', color: 'Colour',
  rating: 'Rating', select: 'Choice list', media: 'Images and files',
};

/* The key the server makes from a label ("Engine size" -> engineSize), so a value can be sent with its attribute before the attribute exists. */
export const keyFromLabel = label => {
  const words = String(label ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').split(/[^a-zA-Z0-9]+/).filter(Boolean);
  const key = words.map((word, index) => index === 0 ? word.charAt(0).toLowerCase() + word.slice(1) : word.charAt(0).toUpperCase() + word.slice(1)).join('');
  return /^[a-z]/.test(key) ? key.slice(0, 40) : '';
};

/*
  Edits a list of custom attributes as cards, the way options are edited: what an attribute is called, what kind of value it
  holds, whether it is required, its help text and choices, and a value for it. Used for the attributes of a template
  (where the value is the default every product made from it shows until it sets its own) and for the attributes one
  product adds to its template's (where it is that product's value). Nothing is saved here; the form around it saves
  the list.

    <k-products-attributes-editor .value=${attributes} .config=${config} value-label="Default value"></k-products-attributes-editor>

  An attribute in `value` has label, type, options, description, required, listed, filterable, and `default` (its value).
  One with a `key` already exists, so its key and its kind (beyond what loses nothing) are fixed. Fires `change`
  with { value }: the whole list.
*/
export default class AttributesEditor extends ShadowComponent {
  static properties = {
    value: { attribute: false },
    config: { attribute: false },
    valueLabel: { type: String, attribute: 'value-label' },
    valueHint: { type: String, attribute: 'value-hint' },
    attributes: { state: true },
  };

  constructor(){
    super();
    this.value = [];
    this.config = { attributeTypes: [], conversions: {}, decimals: 2, currency: 'USD' };
    this.valueLabel = 'Value';
    this.valueHint = '';
    this.attributes = [];
  }

  /*
    Lifecycle callbacks
  */
  willUpdate(changed){
    if(changed.has('value')) this.attributes = structuredClone(this.value ?? []);
  }

  /*
    Utility functions
  */
  commit = attributes => {
    this.attributes = attributes;
    this.dispatchEvent(new CustomEvent('change', { detail: { value: attributes }, bubbles: true }));
  };

  patch = (index, changes) => this.commit(this.attributes.map((attribute, i) => i === index ? { ...attribute, ...changes } : attribute));

  /* An attribute that exists can only become a kind that loses nothing; a new one can be any. */
  kindsFor = attribute => (attribute.key ? [attribute.type, ...(this.config.conversions[attribute.type] ?? [])] : this.config.attributeTypes);

  /*
    Event handlers
  */
  add = () => this.commit([...this.attributes, { label: '', type: 'text', options: [], description: '', required: false, listed: true, filterable: false, default: '' }]);

  remove = index => this.commit(this.attributes.filter((_, i) => i !== index));

  /*
    View
  */
  renderAttribute(attribute, index){
    const kinds = this.kindsFor(attribute);
    const asked = { ...attribute, key: attribute.key || `new-${index}`, label: this.valueLabel, required: false, description: this.valueHint, options: attribute.options ?? [] };
    return html`<div class="card mb">
      <div class="d-f mbh" style="align-items: center; gap: var(--spacer_h); flex-wrap: nowrap;">
        <input type="text" class="flex" style="width: auto; min-width: 0; margin: 0;" placeholder="Attribute, e.g. Scale" aria-label="Attribute name"
          .value=${attribute.label} @input=${event => this.patch(index, { label: event.target.value })}>
        <select style="width: auto; margin: 0;" aria-label="Kind of value" ?disabled=${attribute.key && kinds.length < 2}
          @change=${event => this.patch(index, { type: event.target.value, default: '' })}>
          ${kinds.map(kind => html`<option value=${kind} ?selected=${kind === attribute.type}>${LABELS[kind] ?? kind}</option>`)}
        </select>
        <label class="checkbox" style="margin: 0; white-space: nowrap;">
          <input type="checkbox" .checked=${attribute.required} @change=${event => this.patch(index, { required: event.target.checked })}> Required
        </label>
        <button type="button" class="no-btn tc-danger" style="cursor: pointer;" title="Remove this attribute" aria-label="Remove attribute"
          @click=${() => this.remove(index)}><k-icon name="delete"></k-icon></button>
      </div>
      <div class="ml">
        ${attribute.type === 'select' ? html`<div class="mb">
          <label class="d-b mbq" for=${`choices-${index}`}>Choices, one per line</label>
          <textarea id=${`choices-${index}`} class="full" rows="3" .value=${(attribute.options ?? []).join('\n')}
            @input=${event => this.patch(index, { options: event.target.value.split('\n').map(line => line.trim()).filter(Boolean) })}></textarea>
        </div>` : ''}
        <div class="mb">
          <label class="d-b mbq" for=${`help-${index}`}>Help text</label>
          <input type="text" id=${`help-${index}`} class="full" .value=${attribute.description ?? ''} @input=${event => this.patch(index, { description: event.target.value })}>
        </div>
        <div class="mb">
          <label class="checkbox"><input type="checkbox" .checked=${attribute.listed} @change=${event => this.patch(index, { listed: event.target.checked })}> Show in the product list</label>
          <label class="checkbox"><input type="checkbox" .checked=${attribute.filterable} @change=${event => this.patch(index, { filterable: event.target.checked })}> Visitors can filter by this</label>
        </div>
        <k-products-attribute-input .attribute=${asked} .value=${attribute.default ?? ''} .decimals=${this.config.decimals} .currency=${this.config.currency}
          @change=${event => this.patch(index, { default: event.detail.value })}></k-products-attribute-input>
      </div>
    </div>`;
  }

  render(){
    return html`<div>
      ${this.attributes.map((attribute, index) => this.renderAttribute(attribute, index))}
      <button type="button" class="btn primary mb" @click=${this.add}><k-icon name="add"></k-icon> Add attribute</button>
    </div>`;
  }
}

customElements.define('k-products-attributes-editor', AttributesEditor);
