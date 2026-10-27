import ButtonControl from '/kempo-ui/components/controls/ButtonControl.js';
import { html } from '/kempo-ui/lit-all.min.js';
import '/kempo-ui/components/Icon.js';

/*
  One action on a row of a product list (edit or delete an attribute, a template). It shows only when its row's
  `actions` list names it, and reports the choice as a `listAction` event on the table: { action, record }.

    <k-products-list-action slot="after" action="delete" icon="delete" title="Delete"></k-products-list-action>
*/
export default class ListRowAction extends ButtonControl {
  static properties = {
    ...ButtonControl.properties,
    action: { type: String },
    icon: { type: String },
  };

  constructor(){
    super();
    this.action = '';
    this.icon = 'edit';
  }

  get record(){
    const index = this.closest('.record')?.dataset?.index;
    return index === undefined ? null : this.host?.records?.[index] ?? null;
  }

  get shown(){
    return Boolean(this.record?.actions?.includes(this.action));
  }

  handleAction(){
    if(!this.shown) return;
    this.host.dispatchEvent(new CustomEvent('listAction', { detail: { action: this.action, record: this.record } }));
  }

  /* A row that does not offer this action gets no box at all, not an empty one. */
  render(){
    this.toggleAttribute('hidden', !this.shown);
    return html`<slot><k-icon name="${this.icon}"></k-icon></slot>`;
  }
}

customElements.define('k-products-list-action', ListRowAction);
