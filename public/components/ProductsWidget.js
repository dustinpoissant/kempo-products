import DashboardWidget from '/kempo/components/DashboardWidget.js';
import { html, nothing } from '/kempo-ui/lit-all.min.js';
import { getProducts, getPurchases } from '/products/sdk.js';
const stat = (value, label, classes = '') => html`<div class="flex"><div class="h2 m0 ${classes}">${value}</div><div class="small tc-muted">${label}</div></div>`;

/*
  The catalog size, recorded purchases and the latest products.
*/
export default class ProductsWidget extends DashboardWidget {
  static properties = {
    ...DashboardWidget.properties,
    total: { state: true },
    purchases: { state: true },
    recent: { state: true }
  };

  constructor(){
    super();
    this.total = 0;
    this.purchases = 0;
    this.recent = [];
    this.cta = { label: 'New product', icon: 'add', href: '/admin/extension/kempo-products/new', permission: 'products:create' };
  }

  /*
    Public Methods
  */

  load = async () => {
    const [products, purchases] = await Promise.all([
      this.unwrap(getProducts({ limit: 9 })),
      this.unwrap(getPurchases({ limit: 1 }))
    ]);
    this.total = products.total;
    this.recent = products.items;
    this.purchases = purchases.total;
  };

  /*
    Rendering
  */

  renderContent(){
    if(!this.total && !this.purchases) return html`<p class="tc-muted">No products yet.</p>`;
    return html`
      <div class="d-f mb">${stat(this.total, 'Products')}${stat(this.purchases, 'Purchases')}</div>
      ${this.recent.length ? html`<div class="small tc-muted mbq">Latest</div>` : nothing}
      ${this.recent.slice(0, this.height * 2).map(product => html`
        <div class="d-f pyq bb"><span class="flex">${product.name}</span><span class="small tc-muted">${product.status}</span></div>
      `)}
    `;
  }
}

customElements.define('k-prod-widget', ProductsWidget);
