import ShadowComponent from '/kempo-ui/components/ShadowComponent.js';
import { html, render } from '/kempo-ui/lit-all.min.js';
import Toast from '/kempo-ui/components/Toast.js';
import Dialog from '/kempo-ui/components/Dialog.js';
import '/kempo-ui/components/Icon.js';
import '/kempo-ui/components/Spinner.js';
import '/kempo-ui/components/Table.js';
import './CategoryRowAction.js';
import { getCategories, createCategory, updateCategory, deleteCategory } from '/products/sdk.js';

/*
  Lists the product categories ("Model cars", "Paint") and lets them be added, renamed and deleted.
  A category groups products for browsing: a product is of one type but can be in any number of
  categories, chosen on the product's own form. Deleting one takes it off its products and leaves them.

    <k-products-categories>
      <template><location name="products-admin-category-actions" /></template>
    </k-products-categories>

  The optional <template> is what other extensions add to every row. Its elements become row controls
  (`slot="after"`), so each one finds its category from its own row, the way the table's controls do.
*/
const fields = [
  { name: 'name', label: 'Name', size: 200, editable: false },
  { name: 'key', label: 'Key', size: 160, editable: false },
  { name: 'description', label: 'Description', editable: false },
  { name: 'total', label: 'Products', size: 170, editable: false, calculator: category => `${category.total}${category.total !== category.count ? ` (${category.count} published)` : ''}` },
];

export default class CategoriesManager extends ShadowComponent {
  static properties = {
    categories: { state: true },
    loading: { state: true },
    error: { state: true },
  };

  constructor(){
    super();
    this.categories = [];
    this.loading = true;
    this.error = '';
    this.extras = null;
  }

  /*
    Lifecycle callbacks
  */
  connectedCallback(){
    super.connectedCallback();
    this.load();
  }

  /*
    Utility functions
  */
  load = async () => {
    const [error, data] = await getCategories();
    this.loading = false;
    if(error){
      this.error = error.msg;
      return;
    }
    this.categories = data.categories;
  };

  form = (category = {}) => {
    const $root = document.createElement('div');
    $root.className = 'p';
    render(html`
      <div class="mb"><label class="d-b mbq" for="categoryName">Name *</label><input type="text" id="categoryName" class="full" .value=${category.name ?? ''}></div>
      <div class="mb"><label class="d-b mbq" for="categoryDescription">Description<small class="d-b tc-muted">Shown under the category's name on the categories page.</small></label><textarea id="categoryDescription" class="full" rows="2" .value=${category.description ?? ''}></textarea></div>
    `, $root);
    return $root;
  };

  /*
    Event handlers
  */
  add = () => {
    const $form = this.form();
    const $dialog = Dialog.create($form, {
      title: 'New category',
      confirmText: 'Create',
      cancelText: 'Cancel',
      overlayClose: false,
      confirmAction: async event => {
        event.keepDialogOpen = true;
        const [error] = await createCategory({ name: $form.querySelector('#categoryName').value, description: $form.querySelector('#categoryDescription').value });
        if(error){
          Toast.error(error.msg);
          return;
        }
        $dialog.close();
        Toast.success('Category added');
        this.load();
      },
    });
  };

  edit = category => {
    const $form = this.form(category);
    const $dialog = Dialog.create($form, {
      title: `Edit ${category.name}`,
      confirmText: 'Save',
      cancelText: 'Cancel',
      overlayClose: false,
      confirmAction: async event => {
        event.keepDialogOpen = true;
        const [error] = await updateCategory(category.key, { name: $form.querySelector('#categoryName').value, description: $form.querySelector('#categoryDescription').value });
        if(error){
          Toast.error(error.msg);
          return;
        }
        $dialog.close();
        Toast.success('Category saved');
        this.load();
      },
    });
  };

  remove = category => {
    const inIt = category.total ? ` It will be taken off its ${category.total} product${category.total === 1 ? '' : 's'}, which stay.` : '';
    Dialog.confirm(`Delete the category "${category.name}"?${inIt}`, async confirmed => {
      if(!confirmed) return;
      const [error] = await deleteCategory(category.key);
      if(error){
        Toast.error(error.msg);
        return;
      }
      Toast.success('Category deleted');
      this.load();
    });
  };

  actOn = ({ action, record }) => {
    if(action === 'edit') this.edit(record);
    else if(action === 'delete') this.remove(record);
  };

  /* What other extensions put in each row: the template's elements, made once and kept. */
  extrasFor = () => {
    if(!this.extras){
      const template = this.querySelector(':scope > template');
      this.extras = template ? [...document.importNode(template.content, true).children] : [];
    }
    return this.extras;
  };

  /* Refills the table whenever the list changes. */
  updated(changed){
    if(!changed.has('categories')) return;
    this.renderRoot.querySelector('k-table')?.setData({ records: this.categories, fields });
  }

  /*
    View
  */
  render(){
    if(this.loading) return html`<k-spinner></k-spinner>`;
    if(this.error) return html`<p class="tc-danger">${this.error}</p>`;
    return html`<div>
      <div class="mb"><button type="button" class="btn primary" id="addCategory" @click=${this.add}><k-icon name="add"></k-icon> New category</button></div>
      <k-table placeholder="No categories yet. A category, like Model cars or Paint, groups products for browsing. Add some here, then put products in them on each product's page." @categoryAction=${event => this.actOn(event.detail)}>
        <k-products-category-action slot="before" action="edit" icon="edit" title="Edit"></k-products-category-action>
        <k-products-category-action slot="after" action="delete" icon="delete" title="Delete"></k-products-category-action>
        ${this.extrasFor()}
      </k-table>
    </div>`;
  }
}

customElements.define('k-products-categories', CategoriesManager);
