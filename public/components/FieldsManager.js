import ShadowComponent from '/kempo-ui/components/ShadowComponent.js';
import { html, render } from '/kempo-ui/lit-all.min.js';
import Toast from '/kempo-ui/components/Toast.js';
import Dialog from '/kempo-ui/components/Dialog.js';
import '/kempo-ui/components/Icon.js';
import '/kempo-ui/components/Spinner.js';
import { getConfig, getTypes, getFields, createField, updateField, deleteField } from '/products/sdk.js';

const LABELS = {
  text: 'Short text', longtext: 'Long text', number: 'Number', boolean: 'Yes / no', date: 'Date', color: 'Colour',
  rating: 'Rating', select: 'Choice list', media: 'Images and files',
};

/*
  The custom fields products have. A field applies to every product or to one type: a model car's
  "Scale" only appears on model cars. Fields are what a type is made of, so a site owner builds
  "Vehicle" or "Model car" here without writing any code.

    <k-prod-fields></k-prod-fields>
*/
export default class FieldsManager extends ShadowComponent {
  static properties = {
    fields: { state: true },
    types: { state: true },
    config: { state: true },
    loading: { state: true },
    error: { state: true },
  };

  constructor(){
    super();
    this.fields = [];
    this.types = [];
    this.config = null;
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
    const [[configError, config], [typesError, types], [fieldsError, fields]] = await Promise.all([getConfig(), getTypes(), getFields()]);
    this.loading = false;
    if(configError || typesError || fieldsError){
      this.error = (configError || typesError || fieldsError).msg;
      return;
    }
    this.config = config;
    this.types = types.types;
    this.fields = fields.fields;
  };

  /*
    A field is made once and its key and scope are fixed; editing offers only what can change. The
    choice list needs its options, one per line.
  */
  form = field => {
    const editing = Boolean(field);
    const owned = editing && Boolean(field.owner);
    const $root = document.createElement('div');
    $root.className = 'p';
    $root.style.cssText = 'max-height: calc(100vh - 14rem); overflow-y: auto;';
    const showOptions = () => {
      const type = $root.querySelector('#fieldType').value;
      $root.querySelector('#optionsRow').style.display = type === 'select' ? '' : 'none';
    };
    const conversions = this.config.conversions;
    const typeChoices = editing
      ? [field.type, ...(conversions[field.type] ?? [])]
      : this.config.fieldTypes;
    render(html`
      ${owned ? html`<p class="tc-muted">Managed by the ${field.owner} extension. You can rename it and choose how it is shown; the rest is its own.</p>` : ''}
      <div class="mb"><label class="d-b mbq" for="fieldLabel">Label *</label><input type="text" id="fieldLabel" class="full" .value=${field?.label ?? ''}></div>
      <div class="mb">
        <label class="d-b mbq" for="fieldType">Kind of value</label>
        <select id="fieldType" class="full" ?disabled=${owned || (editing && typeChoices.length < 2)} @change=${showOptions}>
          ${typeChoices.map(type => html`<option value=${type} ?selected=${type === field?.type}>${LABELS[type] ?? type}</option>`)}
        </select>
      </div>
      <div class="mb">
        <label class="d-b mbq" for="fieldScope">Applies to</label>
        <select id="fieldScope" class="full" ?disabled=${editing}>
          <option value="">Every product</option>
          ${this.types.map(type => html`<option value=${type.key} ?selected=${type.key === field?.productType}>${type.name}</option>`)}
        </select>
      </div>
      <div class="mb" id="optionsRow" style=${field?.type === 'select' ? '' : 'display: none;'}>
        <label class="d-b mbq" for="fieldOptions">Choices, one per line</label>
        <textarea id="fieldOptions" class="full" rows="4" ?disabled=${owned} .value=${(field?.options ?? []).join('\n')}></textarea>
      </div>
      <div class="mb"><label class="d-b mbq" for="fieldDescription">Help text</label><input type="text" id="fieldDescription" class="full" .value=${field?.description ?? ''}></div>
      <label class="checkbox"><input type="checkbox" id="fieldRequired" ?disabled=${owned} .checked=${field?.required ?? false}> Required</label>
      <label class="checkbox"><input type="checkbox" id="fieldListed" .checked=${field?.listed ?? true}> Show in the product list</label>
      <label class="checkbox"><input type="checkbox" id="fieldFilterable" .checked=${field?.filterable ?? false}> Visitors can filter by this</label>
    `, $root);
    return $root;
  };

  read = $form => ({
    label: $form.querySelector('#fieldLabel').value,
    type: $form.querySelector('#fieldType').value,
    productType: $form.querySelector('#fieldScope').value,
    options: $form.querySelector('#fieldOptions').value.split('\n').map(line => line.trim()).filter(Boolean),
    description: $form.querySelector('#fieldDescription').value,
    required: $form.querySelector('#fieldRequired').checked,
    listed: $form.querySelector('#fieldListed').checked,
    filterable: $form.querySelector('#fieldFilterable').checked,
  });

  /*
    Event handlers
  */
  add = () => {
    const $form = this.form(null);
    const $dialog = Dialog.create($form, {
      title: 'New field',
      confirmText: 'Create',
      cancelText: 'Cancel',
      overlayClose: false,
      confirmAction: async event => {
        event.keepDialogOpen = true;
        const [error] = await createField(this.read($form));
        if(error){
          Toast.error(error.msg);
          return;
        }
        $dialog.close();
        Toast.success('Field added');
        this.load();
      },
    });
  };

  edit = field => {
    const $form = this.form(field);
    const $dialog = Dialog.create($form, {
      title: `Edit ${field.label}`,
      confirmText: 'Save',
      cancelText: 'Cancel',
      overlayClose: false,
      confirmAction: async event => {
        event.keepDialogOpen = true;
        const { productType, ...values } = this.read($form);
        const changes = field.owner
          ? { label: values.label, description: values.description, listed: values.listed, filterable: values.filterable }
          : values;
        const [error] = await updateField(field.key, changes, { type: field.productType });
        if(error){
          Toast.error(error.msg);
          return;
        }
        $dialog.close();
        Toast.success('Field saved');
        this.load();
      },
    });
  };

  remove = field => {
    Dialog.confirm(`Delete "${field.label}" and the values products hold for it? This cannot be undone.`, async confirmed => {
      if(!confirmed) return;
      const [error] = await deleteField(field.key, { type: field.productType });
      if(error){
        Toast.error(error.msg);
        return;
      }
      Toast.success('Field deleted');
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
      <div class="mb"><button type="button" class="btn primary" id="addField" @click=${this.add}><k-icon name="add"></k-icon> New field</button></div>
      ${this.fields.length ? html`<div class="table-wrapper"><table>
        <thead><tr><th>Label</th><th>Key</th><th>Kind</th><th>Applies to</th><th>Required</th><th>Managed by</th><th></th></tr></thead>
        <tbody>${this.fields.map(field => html`<tr>
          <td>${field.label}</td>
          <td><code>${field.key}</code></td>
          <td>${LABELS[field.type] ?? field.type}</td>
          <td>${field.productTypeName || 'Every product'}</td>
          <td>${field.required ? 'Yes' : ''}</td>
          <td>${field.owner}</td>
          <td style="white-space: nowrap;">
            <button type="button" class="btn" title="Edit" aria-label=${`Edit ${field.label}`} @click=${() => this.edit(field)}><k-icon name="edit"></k-icon></button>
            <button type="button" class="btn" title="Delete" aria-label=${`Delete ${field.label}`} ?disabled=${Boolean(field.owner)} @click=${() => this.remove(field)}><k-icon name="delete"></k-icon></button>
          </td>
        </tr>`)}</tbody>
      </table></div>` : html`<p class="tc-muted">No fields yet. Add one to give your products details such as a scale, a make or a year.</p>`}
    </div>`;
  }
}

customElements.define('k-prod-fields', FieldsManager);
