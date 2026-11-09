import ShadowComponent from '/kempo-ui/components/ShadowComponent.js';
import { html } from '/kempo-ui/lit-all.min.js';
import '/kempo-ui/components/Tags.js';
import { getTags } from '/products/sdk.js';

/*
  Choose any number of product tags, served at /products/components/TagSelector.js. The value is the tags, comma
  separated (`acrylic,red`), which is what a list's `tag` takes. Typing offers the tags products already carry, most used
  first, and a tag can also be typed as it is. It draws kempo-ui's tags field.

    <k-products-tag-selector name="tag" value="acrylic,red"></k-products-tag-selector>

  It is a form input, so it submits under its `name`, and it fires `change` with detail `{ value }`.
*/
export default class TagSelector extends ShadowComponent {
  static formAssociated = true;

  static properties = {
    value: { type: String, reflect: true },
    name: { type: String, reflect: true },
    placeholder: { type: String },
    disabled: { type: Boolean, reflect: true },
    tags: { state: true }
  };

  constructor(){
    super();
    this.internals = this.attachInternals();
    this.value = '';
    this.name = '';
    this.placeholder = 'Add a tag';
    this.disabled = false;
    this.tags = [];
  }

  connectedCallback(){
    super.connectedCallback();
    this.internals.setFormValue(this.value);
    getTags().then(([error, data]) => {
      if(!error) this.tags = data.tags;
    });
  }

  willUpdate(changed){
    if(changed.has('value')) this.internals.setFormValue(this.value);
  }

  /*
    Event handlers
  */

  suggest = (query, callback) => {
    const needle = query.trim().toLowerCase();
    callback(this.tags.filter(({ tag }) => tag.includes(needle)).map(({ tag }) => tag).slice(0, 10));
  };

  changed = event => {
    event.stopPropagation();
    if(event.target.value === this.value) return;
    this.value = event.target.value;
    this.dispatchEvent(new CustomEvent('change', { bubbles: true, detail: { value: this.value } }));
  };

  /*
    Drawing
  */

  render(){
    return html`<k-tags
      .value=${this.value}
      placeholder=${this.placeholder}
      ?disabled=${this.disabled}
      .getSuggestions=${this.suggest}
      @change=${this.changed}
    ></k-tags>`;
  }
}

customElements.define('k-products-tag-selector', TagSelector);
