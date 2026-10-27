import ShadowComponent from '/kempo-ui/components/ShadowComponent.js';
import '/kempo-ui/components/controls/TcSearch.js';
import '/kempo-ui/components/controls/TcFilters.js';
import '/kempo-ui/components/controls/TcFieldSortHide.js';
import { html } from '/kempo-ui/lit-all.min.js';
import Dialog from '/kempo-ui/components/Dialog.js';
import '/products/components/ProductPicker.js';
import Toast from '/kempo-ui/components/Toast.js';
import '/kempo-ui/components/Icon.js';
import '/kempo-ui/components/Spinner.js';
import '/kempo-ui/components/Table.js';
import { getLedger, addLedgerEntry } from '/products/sdk.js';

/*
  The ledger: every change to a product's quantity, newest first, and a form to add stock to a product
  or take it away (a delivery, a count, a sale made somewhere else).

    <k-products-ledger></k-products-ledger>
*/
export default class LedgerManager extends ShadowComponent {
  static properties = {
    products: { state: true },
    entries: { state: true },
    total: { state: true },
    loading: { state: true },
    saving: { state: true },
    error: { state: true },
  };

  constructor(){
    super();
    this.products = [];
    this.entries = [];
    this.total = 0;
    this.loading = true;
    this.saving = false;
    this.error = '';
  }

  /*
    Lifecycle callbacks
  */
  connectedCallback(){
    super.connectedCallback();
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
    const [ledgerError, ledger] = await getLedger({ limit: 100 });
    this.loading = false;
    if(ledgerError){
      this.error = ledgerError.msg;
      return;
    }
    this.entries = ledger.items;
    this.total = ledger.total;
  };

  quantityText = quantity => quantity === -1 ? 'Unlimited' : String(quantity);

  /*
    Event handlers
  */
  /* The dialog's Add button: the dialog stays open until the entry is stored, so a failure keeps what was typed. */
  addEntry = () => {
    const $dialog = Dialog.create(html`
      <div class="p">
        <p class="tc-muted">Add stock to a product, or take it away, for a delivery, a count or a sale made somewhere else. A product with unlimited quantity is not counted.</p>
        <div class="mb">
          <label class="d-b mbq" for="ledgerProduct">Product</label>
          <k-products-product-picker id="ledgerProduct" name="product" class="full"></k-products-product-picker>
        </div>
        <div class="mb">
          <label class="d-b mbq" for="ledgerChange">Change<small class="d-b tc-muted">Whole numbers. Use a minus sign to take stock away.</small></label>
          <input type="number" id="ledgerChange" step="1" class="full" placeholder="+5 or -2">
        </div>
        <div class="mb">
          <label class="d-b mbq" for="ledgerNote">Note</label>
          <input type="text" id="ledgerNote" class="full" placeholder="e.g. Delivery from the supplier, or an Etsy order number">
        </div>
      </div>`, {
      title: 'Add an entry',
      confirmText: 'Add entry',
      cancelText: 'Cancel',
      overlayClose: false,
      confirmAction: async event => {
        event.keepDialogOpen = true;
        await this.save($dialog);
      },
    });
  };

  save = async $dialog => {
    const productId = $dialog.querySelector('#ledgerProduct').value;
    const change = Number($dialog.querySelector('#ledgerChange').value);
    if(!productId){
      Toast.error('Choose a product');
      return;
    }
    if(!Number.isInteger(change) || change === 0){
      Toast.error('Enter how many to add, or a negative number to take away');
      return;
    }
    this.saving = true;
    const [error] = await addLedgerEntry({
      lines: [{ productId, change }],
      reason: change > 0 ? 'added' : 'removed',
      note: $dialog.querySelector('#ledgerNote').value.trim(),
    });
    this.saving = false;
    if(error){
      Toast.error(error.msg);
      return;
    }
    Toast.success('Added to the ledger');
    $dialog.close();
    this.load();
  };

  /*
    View
  */
  /* The ledger, as a table: every change to a product's stock, newest first. */
  ledgerFields(){
    return [
      { name: 'created', label: 'When', size: 230, editable: false, formatter: value => new Date(value).toLocaleString() },
      { name: 'name', label: 'Product', size: 200, editable: false },
      { name: 'change', label: 'Change', size: 100, editable: false, calculator: entry => `${entry.change > 0 ? '+' : ''}${entry.change}` },
      { name: 'quantity', label: 'Quantity after', size: 150, editable: false, calculator: entry => this.quantityText(entry.quantity) },
      { name: 'note', label: 'Note', editable: false, calculator: entry => `${entry.note || entry.reason || ''}${entry.ref ? ` ${entry.ref}` : ''}` },
      { name: 'actor', label: 'By', size: 150, editable: false, calculator: entry => entry.actor || (entry.userId ? 'A person' : '') },
    ];
  }

  fillLedger(){
    this.renderRoot.querySelector('#ledgerTable')?.setData({ records: this.entries, fields: this.ledgerFields() });
  }

  updated(changed){
    super.updated?.(changed);
    if(changed.has('entries')) this.fillLedger();
  }


  render(){
    if(this.loading) return html`<k-spinner></k-spinner>`;
    if(this.error) return html`<p class="tc-danger">${this.error}</p>`;
    return html`<div>
      <div class="d-f mb" style="align-items: center; gap: var(--spacer_h);">
        <p class="flex m0 tc-muted">Every change to the stock of these products, newest first.</p>
      </div>
      <h4>Stock changes</h4>
      <k-table id="ledgerTable" placeholder="Nothing has changed yet.">
        <div slot="top" class="d-f full" style="align-items: center;"><kc-tc-search style="width: 16rem"></kc-tc-search><kc-tc-filters></kc-tc-filters><kc-tc-field-sort-hide></kc-tc-field-sort-hide><div class="flex"></div><button type="button" class="btn success" id="addEntry" ?disabled=${this.saving} @click=${this.addEntry}>+ Add Stock Entry</button></div>
      </k-table>
      ${this.total > this.entries.length ? html`<p class="tc-muted">Showing the latest ${this.entries.length} of ${this.total}.</p>` : ''}
    </div>`;
  }
}

customElements.define('k-products-ledger', LedgerManager);
