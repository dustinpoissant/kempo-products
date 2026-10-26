import AdminTableControl from '/admin/components/AdminTableControl.js';
import { html } from '/kempo-ui/lit-all.min.js';
import '/kempo-ui/components/Icon.js';

/*
  One action on a category's row (edit or delete). The list owns the dialog and the request, so this only reports
  the choice, as a `categoryAction` event on the table: { action, record }.

    <k-products-category-action action="edit" icon="edit" title="Edit"></k-products-category-action>
*/
export default class CategoryRowAction extends AdminTableControl {
  static properties = {
    ...AdminTableControl.properties,
    action: { type: String },
    icon: { type: String },
  };

  constructor(){
    super();
    this.action = '';
    this.icon = 'edit';
  }

  handleAction(){
    if(!this.record) return;
    this.table.dispatchEvent(new CustomEvent('categoryAction', { detail: { action: this.action, record: this.record } }));
  }

  render(){ return html`<slot><k-icon name="${this.icon}"></k-icon></slot>`; }
}

customElements.define('k-products-category-action', CategoryRowAction);
