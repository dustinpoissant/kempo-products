import ShadowComponent from '/kempo-ui/components/ShadowComponent.js';
import { html, render } from '/kempo-ui/lit-all.min.js';
import Toast from '/kempo-ui/components/Toast.js';
import Dialog from '/kempo-ui/components/Dialog.js';
import '/kempo-ui/components/Icon.js';
import '/kempo-ui/components/Spinner.js';
import { getTypes, createType, updateType, deleteType } from '/products/sdk.js';

/*
  Lists the product types ("Vehicle", "Model car") and lets them be added, renamed and deleted.
  A type groups products and decides which custom fields they show.

    <k-prod-types></k-prod-types>
*/
export default class TypesManager extends ShadowComponent {
  static properties = {
    types: { state: true },
    loading: { state: true },
    error: { state: true },
  };

  constructor(){
    super();
    this.types = [];
    this.loading = true;
    this.error = '';
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
    const [error, data] = await getTypes();
    this.loading = false;
    if(error){
      this.error = error.msg;
      return;
    }
    this.types = data.types;
  };

  form = (type = {}) => {
    const $root = document.createElement('div');
    $root.className = 'p';
    render(html`
      <div class="mb"><label class="d-b mbq" for="typeName">Name *</label><input type="text" id="typeName" class="full" .value=${type.name ?? ''}></div>
      <div class="mb"><label class="d-b mbq" for="typeDescription">Description</label><textarea id="typeDescription" class="full" rows="2" .value=${type.description ?? ''}></textarea></div>
    `, $root);
    return $root;
  };

  /*
    Event handlers
  */
  add = () => {
    const $form = this.form();
    const $dialog = Dialog.create($form, {
      title: 'New type',
      confirmText: 'Create',
      cancelText: 'Cancel',
      overlayClose: false,
      confirmAction: async event => {
        event.keepDialogOpen = true;
        const [error] = await createType({ name: $form.querySelector('#typeName').value, description: $form.querySelector('#typeDescription').value });
        if(error){
          Toast.error(error.msg);
          return;
        }
        $dialog.close();
        Toast.success('Type added');
        this.load();
      },
    });
  };

  edit = type => {
    const $form = this.form(type);
    const $dialog = Dialog.create($form, {
      title: `Edit ${type.name}`,
      confirmText: 'Save',
      cancelText: 'Cancel',
      overlayClose: false,
      confirmAction: async event => {
        event.keepDialogOpen = true;
        const [error] = await updateType(type.key, { name: $form.querySelector('#typeName').value, description: $form.querySelector('#typeDescription').value });
        if(error){
          Toast.error(error.msg);
          return;
        }
        $dialog.close();
        Toast.success('Type saved');
        this.load();
      },
    });
  };

  remove = type => {
    Dialog.confirm(`Delete the type "${type.name}"?`, async confirmed => {
      if(!confirmed) return;
      const [error] = await deleteType(type.key);
      if(error){
        Toast.error(error.msg);
        return;
      }
      Toast.success('Type deleted');
      this.load();
    });
  };

  /*
    View
  */
  render(){
    if(this.loading) return html`<k-spinner></k-spinner>`;
    if(this.error) return html`<p class="tc-danger">${this.error}</p>`;
    return html`<div>
      <div class="mb"><button type="button" class="btn primary" id="addType" @click=${this.add}><k-icon name="add"></k-icon> New type</button></div>
      ${this.types.length ? html`<div class="table-wrapper"><table>
        <thead><tr><th>Name</th><th>Key</th><th>Description</th><th>Products</th><th>Managed by</th><th></th></tr></thead>
        <tbody>${this.types.map(type => html`<tr>
          <td>${type.name}</td>
          <td><code>${type.key}</code></td>
          <td>${type.description}</td>
          <td>${type.count}</td>
          <td>${type.owner}</td>
          <td style="white-space: nowrap;">
            <button type="button" class="btn" title="Edit" aria-label=${`Edit ${type.name}`} @click=${() => this.edit(type)}><k-icon name="edit"></k-icon></button>
            <button type="button" class="btn" title="Delete" aria-label=${`Delete ${type.name}`} ?disabled=${Boolean(type.owner)} @click=${() => this.remove(type)}><k-icon name="delete"></k-icon></button>
          </td>
        </tr>`)}</tbody>
      </table></div>` : html`<p class="tc-muted">No types yet. A type, like "Vehicle" or "Model car", groups products and gives them their own fields.</p>`}
    </div>`;
  }
}

customElements.define('k-prod-types', TypesManager);
