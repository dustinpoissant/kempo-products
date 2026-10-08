import ShadowComponent from '/kempo-ui/components/ShadowComponent.js';
import { html } from '/kempo-ui/lit-all.min.js';
import Toast from '/kempo-ui/components/Toast.js';
import Dialog from '/kempo-ui/components/Dialog.js';
import '/kempo-ui/components/Icon.js';
import '/kempo-ui/components/Spinner.js';
import { getConfig, getProducts, getPurchases, recordPurchase, reversePurchase, displayMoney, parseMoney } from '/products/sdk.js';

/*
  Records a purchase made somewhere else (Etsy, in person, over the phone) so stock and anything
  reacting to purchases stay right, and lists the purchases recorded so far. A recorded purchase can
  be reversed (a cancelled or refunded order), which puts the stock back.

    <k-prod-purchases></k-prod-purchases>
*/
export default class PurchasesManager extends ShadowComponent {
  static properties = {
    config: { state: true },
    products: { state: true },
    purchases: { state: true },
    lines: { state: true },
    loading: { state: true },
    saving: { state: true },
    error: { state: true },
  };

  constructor(){
    super();
    this.config = null;
    this.products = [];
    this.purchases = [];
    this.lines = [{ productId: '', quantity: 1, options: {}, unitPrice: '' }];
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
    const [[configError, config], [productsError, products], [purchasesError, purchases]] = await Promise.all([
      getConfig(), getProducts({ limit: 200, sort: 'name' }), getPurchases({ limit: 50 }),
    ]);
    this.loading = false;
    if(configError || productsError || purchasesError){
      this.error = (configError || productsError || purchasesError).msg;
      return;
    }
    this.config = config;
    this.products = products.items.filter(product => product.status !== 'archived');
    this.purchases = purchases.items;
  };

  product = id => this.products.find(product => product.id === id);

  patchLine = (index, changes) => {
    this.lines = this.lines.map((line, i) => i === index ? { ...line, ...changes } : line);
  };

  money = minor => displayMoney(minor, this.config.currency, this.config.decimals);

  /*
    Event handlers
  */
  addLine = () => {
    this.lines = [...this.lines, { productId: '', quantity: 1, options: {}, unitPrice: '' }];
  };

  removeLine = index => {
    this.lines = this.lines.filter((_, i) => i !== index);
  };

  save = async event => {
    event.preventDefault();
    const $ref = this.shadowRoot.getElementById('ref');
    const lines = [];
    for(const line of this.lines){
      if(!line.productId){
        Toast.error('Choose a product for every line');
        return;
      }
      const data = { productId: line.productId, quantity: Number(line.quantity) || 1, options: line.options };
      if(line.unitPrice !== ''){
        const price = parseMoney(line.unitPrice, this.config.decimals);
        if(price === null || price < 0){
          Toast.error('Enter the price as an amount such as 49.99');
          return;
        }
        data.unitPrice = price;
      }
      lines.push(data);
    }
    this.saving = true;
    const [error] = await recordPurchase({ ref: $ref.value.trim() || `manual-${Date.now()}`, lines });
    this.saving = false;
    if(error){
      Toast.error(error.msg);
      return;
    }
    Toast.success('Purchase recorded');
    $ref.value = '';
    this.lines = [{ productId: '', quantity: 1, options: {}, unitPrice: '' }];
    this.load();
  };

  reverse = purchase => {
    Dialog.confirm(`Reverse "${purchase.ref}"? Its stock goes back and anything that reacted to the purchase is told.`, async confirmed => {
      if(!confirmed) return;
      const [error] = await reversePurchase(purchase.ref);
      if(error){
        Toast.error(error.msg);
        return;
      }
      Toast.success('Purchase reversed');
      this.load();
    });
  };

  /*
    View
  */
  renderLine(line, index){
    const product = this.product(line.productId);
    return html`<div class="d-f mbh" style="align-items: flex-start; gap: var(--spacer_h);">
      <select class="flex" style="width: auto; min-width: 12rem; margin: 0;" aria-label="Product" @change=${event => this.patchLine(index, { productId: event.target.value, options: {}, unitPrice: '' })}>
        <option value="">Choose a product…</option>
        ${this.products.map(candidate => html`<option value=${candidate.id} ?selected=${candidate.id === line.productId}>${candidate.name}</option>`)}
      </select>
      <input type="number" min="1" step="1" style="width: 5rem; margin: 0;" aria-label="Quantity" .value=${String(line.quantity)} @input=${event => this.patchLine(index, { quantity: event.target.value })}>
      ${product?.options.map(option => html`<select style="width: auto; margin: 0;" aria-label=${option.label} @change=${event => this.patchLine(index, { options: { ...line.options, [option.key]: event.target.value } })}>
        <option value="">${option.label}…</option>
        ${option.choices.map(choice => html`<option value=${choice.key} ?disabled=${!choice.available} ?selected=${line.options[option.key] === choice.key}>${choice.label}${choice.available ? '' : ' (out)'}</option>`)}
      </select>`)}
      ${product && product.price === null ? html`<input type="text" style="width: 7rem; margin: 0;" placeholder="Unit price" aria-label="Unit price" .value=${line.unitPrice} @input=${event => this.patchLine(index, { unitPrice: event.target.value })}>` : ''}
      <button type="button" class="no-btn tc-danger" style="cursor: pointer;" aria-label="Remove this line" ?disabled=${this.lines.length < 2} @click=${() => this.removeLine(index)}><k-icon name="delete"></k-icon></button>
    </div>`;
  }

  render(){
    if(this.loading) return html`<k-spinner></k-spinner>`;
    if(this.error) return html`<p class="tc-danger">${this.error}</p>`;
    return html`<div>
      <form @submit=${this.save} class="card mb" style="max-width: 56rem;">
        <h4>Record a purchase</h4>
        <p class="tc-muted">For a sale made somewhere else. It takes the stock, and anything listening for purchases (like the inventory connector) is told.</p>
        <div class="mb"><label class="d-b mbq" for="ref">Reference</label><input type="text" id="ref" class="full" placeholder="e.g. Etsy order number (made for you if left blank)"></div>
        ${this.lines.map((line, index) => this.renderLine(line, index))}
        <div class="d-f mbh" style="gap: var(--spacer_h);">
          <button type="button" class="btn" @click=${this.addLine}><k-icon name="add"></k-icon> Add line</button>
          <button type="submit" class="btn success" id="recordPurchase" ?disabled=${this.saving}>${this.saving ? 'Recording…' : 'Record purchase'}</button>
        </div>
      </form>
      <h4>Recorded purchases</h4>
      ${this.purchases.length ? html`<div class="table-wrapper"><table>
        <thead><tr><th>Reference</th><th>When</th><th>Items</th><th>Total</th><th>Status</th><th></th></tr></thead>
        <tbody>${this.purchases.map(purchase => html`<tr>
          <td>${purchase.ref}</td>
          <td>${new Date(purchase.created).toLocaleString()}</td>
          <td>${purchase.lines.map(line => `${line.quantity} × ${line.name}`).join(', ')}</td>
          <td>${this.money(purchase.total)}</td>
          <td>${purchase.status === 'reversed' ? 'Reversed' : 'Recorded'}</td>
          <td>${purchase.status === 'recorded' ? html`<button type="button" class="btn" @click=${() => this.reverse(purchase)}>Reverse</button>` : ''}</td>
        </tr>`)}</tbody>
      </table></div>` : html`<p class="tc-muted">Nothing recorded yet.</p>`}
    </div>`;
  }
}

customElements.define('k-prod-purchases', PurchasesManager);
