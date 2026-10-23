import ShadowComponent from '/kempo-ui/components/ShadowComponent.js';
import { html, render } from '/kempo-ui/lit-all.min.js';
import Toast from '/kempo-ui/components/Toast.js';
import Dialog from '/kempo-ui/components/Dialog.js';
import '/kempo-ui/components/Icon.js';
import '/kempo-ui/components/Spinner.js';
import { getConfig, getAttributes, createAttribute, updateAttribute, deleteAttribute } from '/products/sdk.js';

const LABELS = {
  text: 'Short text', longtext: 'Long text', number: 'Number', currency: 'Money', boolean: 'Yes / no', date: 'Date', color: 'Colour',
  rating: 'Rating', select: 'Choice list', media: 'Images and files',
};

/*
  The custom attributes every product has: a model car's "Scale", a book's "Author". A site owner adds them here
  without writing any code.

    <k-products-attributes></k-products-attributes>
*/
export default class AttributesManager extends ShadowComponent {
  static properties = {
    attributes: { state: true },
    config: { state: true },
    loading: { state: true },
    error: { state: true },
  };

  constructor(){
    super();
    this.attributes = [];
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
    const [[configError, config], [fieldsError, attributes]] = await Promise.all([getConfig(), getAttributes()]);
    this.loading = false;
    if(configError || fieldsError){
      this.error = (configError || fieldsError).msg;
      return;
    }
    this.config = config;
    this.attributes = attributes.attributes;
  };

  /*
    An attribute is made once and its key and scope are fixed; editing offers only what can change. The
    choice list needs its options, one per line.
  */
  form = attribute => {
    const editing = Boolean(attribute);
    const owned = editing && Boolean(attribute.owner);
    const $root = document.createElement('div');
    $root.className = 'p';
    $root.style.cssText = 'max-height: calc(100vh - 14rem); overflow-y: auto;';
    const showOptions = () => {
      const type = $root.querySelector('#attributeType').value;
      $root.querySelector('#optionsRow').style.display = type === 'select' ? '' : 'none';
    };
    const conversions = this.config.conversions;
    const typeChoices = editing
      ? [attribute.type, ...(conversions[attribute.type] ?? [])]
      : this.config.attributeTypes;
    render(html`
      ${owned ? html`<p class="tc-muted">Managed by the ${attribute.owner} extension. You can rename it and choose how it is shown; the rest is its own.</p>` : ''}
      <div class="mb"><label class="d-b mbq" for="attributeLabel">Label *</label><input type="text" id="attributeLabel" class="full" .value=${attribute?.label ?? ''}></div>
      <div class="mb">
        <label class="d-b mbq" for="attributeType">Kind of value</label>
        <select id="attributeType" class="full" ?disabled=${owned || (editing && typeChoices.length < 2)} @change=${showOptions}>
          ${typeChoices.map(type => html`<option value=${type} ?selected=${type === attribute?.type}>${LABELS[type] ?? type}</option>`)}
        </select>
      </div>
      <div class="mb" id="optionsRow" style=${attribute?.type === 'select' ? '' : 'display: none;'}>
        <label class="d-b mbq" for="attributeOptions">Choices, one per line</label>
        <textarea id="attributeOptions" class="full" rows="4" ?disabled=${owned} .value=${(attribute?.options ?? []).join('\n')}></textarea>
      </div>
      <div class="mb"><label class="d-b mbq" for="attributeDescription">Help text</label><input type="text" id="attributeDescription" class="full" .value=${attribute?.description ?? ''}></div>
      <label class="checkbox"><input type="checkbox" id="attributeRequired" ?disabled=${owned} .checked=${attribute?.required ?? false}> Required</label>
      <label class="checkbox"><input type="checkbox" id="attributeListed" .checked=${attribute?.listed ?? true}> Show in the product list</label>
      <label class="checkbox"><input type="checkbox" id="attributeFilterable" .checked=${attribute?.filterable ?? false}> Visitors can filter by this</label>
    `, $root);
    return $root;
  };

  read = $form => ({
    label: $form.querySelector('#attributeLabel').value,
    type: $form.querySelector('#attributeType').value,
    options: $form.querySelector('#attributeOptions').value.split('\n').map(line => line.trim()).filter(Boolean),
    description: $form.querySelector('#attributeDescription').value,
    required: $form.querySelector('#attributeRequired').checked,
    listed: $form.querySelector('#attributeListed').checked,
    filterable: $form.querySelector('#attributeFilterable').checked,
  });

  /*
    Event handlers
  */
  add = () => {
    const $form = this.form(null);
    const $dialog = Dialog.create($form, {
      title: 'New attribute',
      confirmText: 'Create',
      cancelText: 'Cancel',
      overlayClose: false,
      confirmAction: async event => {
        event.keepDialogOpen = true;
        const [error] = await createAttribute(this.read($form));
        if(error){
          Toast.error(error.msg);
          return;
        }
        $dialog.close();
        Toast.success('Attribute added');
        this.load();
      },
    });
  };

  edit = attribute => {
    const $form = this.form(attribute);
    const $dialog = Dialog.create($form, {
      title: `Edit ${attribute.label}`,
      confirmText: 'Save',
      cancelText: 'Cancel',
      overlayClose: false,
      confirmAction: async event => {
        event.keepDialogOpen = true;
        const values = this.read($form);
        const changes = attribute.owner
          ? { label: values.label, description: values.description, listed: values.listed, filterable: values.filterable }
          : values;
        const [error] = await updateAttribute(attribute.key, changes);
        if(error){
          Toast.error(error.msg);
          return;
        }
        $dialog.close();
        Toast.success('Attribute saved');
        this.load();
      },
    });
  };

  remove = attribute => {
    Dialog.confirm(`Delete "${attribute.label}" and the values products hold for it? This cannot be undone.`, async confirmed => {
      if(!confirmed) return;
      const [error] = await deleteAttribute(attribute.key);
      if(error){
        Toast.error(error.msg);
        return;
      }
      Toast.success('Attribute deleted');
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
      <div class="mb"><button type="button" class="btn primary" id="addAttribute" @click=${this.add}><k-icon name="add"></k-icon> New attribute</button></div>
      ${this.attributes.length ? html`<div class="table-wrapper"><table>
        <thead><tr><th>Label</th><th>Key</th><th>Kind</th><th>Required</th><th>Managed by</th><th></th></tr></thead>
        <tbody>${this.attributes.map(attribute => html`<tr>
          <td>${attribute.label}</td>
          <td><code>${attribute.key}</code></td>
          <td>${LABELS[attribute.type] ?? attribute.type}</td>
          <td>${attribute.required ? 'Yes' : ''}</td>
          <td>${attribute.owner}</td>
          <td style="white-space: nowrap;">
            <button type="button" class="btn" title="Edit" aria-label=${`Edit ${attribute.label}`} @click=${() => this.edit(attribute)}><k-icon name="edit"></k-icon></button>
            <button type="button" class="btn" title="Delete" aria-label=${`Delete ${attribute.label}`} ?disabled=${Boolean(attribute.owner)} @click=${() => this.remove(attribute)}><k-icon name="delete"></k-icon></button>
          </td>
        </tr>`)}</tbody>
      </table></div>` : html`<p class="tc-muted">No attributes yet. Add one to give your products details such as a scale, a make or a year.</p>`}
    </div>`;
  }
}

customElements.define('k-products-attributes', AttributesManager);
