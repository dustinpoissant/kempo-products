import ShadowComponent from '/kempo-ui/components/ShadowComponent.js';
import { html } from '/kempo-ui/lit-all.min.js';
import Toast from '/kempo-ui/components/Toast.js';
import '/kempo-ui/components/Icon.js';
import '/kempo-ui/components/Spinner.js';
import { getProducts, getLedger, addLedgerEntry } from '/products/sdk.js';

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
    this.load();
  }

  /*
    Utility functions
  */
  load = async () => {
    const [[productsError, products], [ledgerError, ledger]] = await Promise.all([
      getProducts({ limit: 200, sort: 'name' }), getLedger({ limit: 100 }),
    ]);
    this.loading = false;
    if(productsError || ledgerError){
      this.error = (productsError || ledgerError).msg;
      return;
    }
    this.products = products.items.filter(product => product.status !== 'archived');
    this.entries = ledger.items;
    this.total = ledger.total;
  };

  quantityText = quantity => quantity === -1 ? 'Unlimited' : String(quantity);

  /*
    Event handlers
  */
  save = async event => {
    event.preventDefault();
    const $form = event.target;
    const productId = $form.querySelector('#product').value;
    const change = Number($form.querySelector('#change').value);
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
      note: $form.querySelector('#note').value.trim(),
    });
    this.saving = false;
    if(error){
      Toast.error(error.msg);
      return;
    }
    Toast.success('Added to the ledger');
    $form.reset();
    this.load();
  };

  /*
    View
  */
  render(){
    if(this.loading) return html`<k-spinner></k-spinner>`;
    if(this.error) return html`<p class="tc-danger">${this.error}</p>`;
    return html`<div>
      <form @submit=${this.save} class="card mb" style="max-width: 48rem;">
        <h4>Add an entry</h4>
        <p class="tc-muted">Add stock to a product, or take it away, for a delivery, a count or a sale made somewhere else. A product with unlimited quantity is not counted.</p>
        <div class="d-f mbh" style="align-items: flex-start; gap: var(--spacer_h);">
          <select id="product" class="flex" style="width: auto; min-width: 12rem; margin: 0;" aria-label="Product">
            <option value="">Choose a product…</option>
            ${this.products.map(product => html`<option value=${product.id}>${product.name} (${this.quantityText(product.quantity)})</option>`)}
          </select>
          <input type="number" id="change" step="1" style="width: 8rem; margin: 0;" placeholder="+5 or -2" aria-label="Change">
        </div>
        <div class="mb"><label class="d-b mbq" for="note">Note</label><input type="text" id="note" class="full" placeholder="e.g. Delivery from the supplier, or an Etsy order number"></div>
        <button type="submit" class="btn success" id="addEntry" ?disabled=${this.saving}>${this.saving ? 'Adding…' : 'Add entry'}</button>
      </form>
      <h4>Ledger</h4>
      ${this.entries.length ? html`<div class="table-wrapper"><table>
        <thead><tr><th>When</th><th>Product</th><th>Change</th><th>Quantity after</th><th>Note</th><th>By</th></tr></thead>
        <tbody>${this.entries.map(entry => html`<tr>
          <td>${new Date(entry.created).toLocaleString()}</td>
          <td>${entry.name}</td>
          <td class=${entry.change > 0 ? 'tc-success' : entry.change < 0 ? 'tc-danger' : ''}>${entry.change > 0 ? '+' : ''}${entry.change}</td>
          <td>${this.quantityText(entry.quantity)}</td>
          <td>${entry.note || entry.reason}${entry.ref ? html` <span class="tc-muted">${entry.ref}</span>` : ''}</td>
          <td>${entry.actor || (entry.userId ? 'A person' : '')}</td>
        </tr>`)}</tbody>
      </table></div>
      ${this.total > this.entries.length ? html`<p class="tc-muted">Showing the latest ${this.entries.length} of ${this.total}.</p>` : ''}` : html`<p class="tc-muted">Nothing in the ledger yet.</p>`}
    </div>`;
  }
}

customElements.define('k-products-ledger', LedgerManager);
