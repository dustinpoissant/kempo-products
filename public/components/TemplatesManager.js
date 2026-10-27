import ShadowComponent from '/kempo-ui/components/ShadowComponent.js';
import '/kempo-ui/components/controls/TcSearch.js';
import '/kempo-ui/components/controls/TcFilters.js';
import '/kempo-ui/components/controls/TcFieldSortHide.js';
import { html } from '/kempo-ui/lit-all.min.js';
import Toast from '/kempo-ui/components/Toast.js';
import Dialog from '/kempo-ui/components/Dialog.js';
import '/kempo-ui/components/Icon.js';
import '/kempo-ui/components/Spinner.js';
import '/kempo-ui/components/Table.js';
import '/kempo-ui/components/controls/TcOpen.js';
import './ListRowAction.js';
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
    const pane = this.closest('k-tab-content');
    // Loads when its tab is first opened, so a tab nobody opens makes no requests.
    if(!pane || pane.active) this.load();
    else this.closest('k-tabs')?.addEventListener('tabfirstshown', ({ detail }) => {
      if(detail.tab === pane.name) this.load();
    });
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
  /* The templates, as a table. A row opens the template; delete is not offered for one another extension manages. */
  templateRecords(){
    return this.templates.map(template => ({
      ...template,
      _url: `${PAGE}?key=${encodeURIComponent(template.key)}`,
      actions: template.owner ? [] : ['delete'],
    }));
  }

  templateFields(){
    return [
      { name: 'name', label: 'Name', editable: false, calculator: template => `${template.name}${template.description ? ` · ${template.description}` : ''}` },
      { name: 'attributes', label: 'Attributes', size: 240, editable: false, calculator: template => template.attributes.map(attribute => attribute.label).join(', ') || 'None' },
      { name: 'options', label: 'Options', size: 200, editable: false, calculator: template => template.options.map(option => option.label).join(', ') || 'None' },
      { name: 'count', label: 'Products', size: 110, editable: false },
      { name: 'owner', label: 'Managed by', size: 150, editable: false },
    ];
  }

  fillTemplates(){
    this.renderRoot.querySelector('#templatesTable')?.setData({ records: this.templateRecords(), fields: this.templateFields() });
  }

  actOnTemplate = ({ action, record }) => {
    if(action === 'delete') this.remove(record);
  };

  updated(changed){
    super.updated?.(changed);
    if(changed.has('templates')) this.fillTemplates();
  }


  render(){
    if(this.loading) return html`<k-spinner></k-spinner>`;
    if(this.error) return html`<p class="tc-danger">${this.error}</p>`;
    return html`<div>
      <p class="tc-muted">A template is what products are made from. It holds attributes, options and default values (every model car has the same size and weight) that its products inherit, and each product can add its own attributes, options and extra choices on top.</p>
      <k-table id="templatesTable" open-on-click placeholder='No templates yet. Make one, like "Model car", then make products from it.' @listAction=${event => this.actOnTemplate(event.detail)}><div slot="top" class="d-f full" style="align-items: center;"><kc-tc-search style="width: 16rem"></kc-tc-search><kc-tc-filters></kc-tc-filters><kc-tc-field-sort-hide></kc-tc-field-sort-hide><div class="flex"></div><a class="btn primary" id="addTemplate" href=${PAGE}><k-icon name="add"></k-icon> New Product Template</a></div><kc-tc-open slot="before" title="Edit"><k-icon name="edit"></k-icon></kc-tc-open><k-products-list-action slot="after" action="delete" icon="delete" title="Delete"></k-products-list-action></k-table>
    </div>`;
  }
}

customElements.define('k-products-templates', TemplatesManager);
