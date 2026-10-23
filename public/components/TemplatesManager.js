import ShadowComponent from '/kempo-ui/components/ShadowComponent.js';
import { html } from '/kempo-ui/lit-all.min.js';
import Toast from '/kempo-ui/components/Toast.js';
import Dialog from '/kempo-ui/components/Dialog.js';
import '/kempo-ui/components/Icon.js';
import '/kempo-ui/components/Spinner.js';
import { showFlash } from '/products/components/ProductForm.js';
import { getTemplates, deleteTemplate } from '/products/sdk.js';

const PAGE = '/admin/extension/kempo-products/template';

/*
  Lists the product templates ("Model car", "Book"). A template is what products are made from: it holds attributes,
  options and default values that every product made from it inherits, and a product can add to them. All of that is
  edited on the template's own page (see TemplateForm), which is where the New template and edit buttons go.

    <k-products-templates></k-products-templates>
*/
export default class TemplatesManager extends ShadowComponent {
  static properties = {
    templates: { state: true },
    loading: { state: true },
    error: { state: true },
  };

  constructor(){
    super();
    this.templates = [];
    this.loading = true;
    this.error = '';
  }

  /*
    Lifecycle callbacks
  */
  connectedCallback(){
    super.connectedCallback();
    showFlash();
    this.load();
  }

  /*
    Utility functions
  */
  load = async () => {
    const [error, data] = await getTemplates();
    this.loading = false;
    if(error){
      this.error = error.msg;
      return;
    }
    this.templates = data.templates;
  };

  /*
    Event handlers
  */
  remove = template => {
    Dialog.confirm(`Delete the template "${template.name}"?`, async confirmed => {
      if(!confirmed) return;
      const [error] = await deleteTemplate(template.key);
      if(error){
        Toast.error(error.msg);
        return;
      }
      Toast.success('Template deleted');
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
      <p class="tc-muted">A template is what products are made from. It holds attributes, options and default values (every model car has the same size and weight) that its products inherit, and each product can add its own attributes, options and extra choices on top.</p>
      <div class="mb"><a class="btn primary" id="addTemplate" href=${PAGE}><k-icon name="add"></k-icon> New template</a></div>
      ${this.templates.length ? html`<div class="table-wrapper"><table>
        <thead><tr><th>Name</th><th>Attributes</th><th>Options</th><th>Products</th><th>Managed by</th><th></th></tr></thead>
        <tbody>${this.templates.map(template => html`<tr>
          <td><a href=${`${PAGE}?key=${encodeURIComponent(template.key)}`}>${template.name}</a>${template.description ? html`<small class="d-b tc-muted">${template.description}</small>` : ''}</td>
          <td>${template.attributes.map(attribute => attribute.label).join(', ') || html`<span class="tc-muted">None</span>`}</td>
          <td>${template.options.map(option => option.label).join(', ') || html`<span class="tc-muted">None</span>`}</td>
          <td>${template.count}</td>
          <td>${template.owner}</td>
          <td style="white-space: nowrap;">
            <a class="btn" title="Edit" aria-label=${`Edit ${template.name}`} href=${`${PAGE}?key=${encodeURIComponent(template.key)}`}><k-icon name="edit"></k-icon></a>
            <button type="button" class="btn" title="Delete" aria-label=${`Delete ${template.name}`} ?disabled=${Boolean(template.owner)} @click=${() => this.remove(template)}><k-icon name="delete"></k-icon></button>
          </td>
        </tr>`)}</tbody>
      </table></div>` : html`<p class="tc-muted">No templates yet. Make one, like "Model car", then make products from it.</p>`}
    </div>`;
  }
}

customElements.define('k-products-templates', TemplatesManager);
