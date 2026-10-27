import ProductTab from '/products/components/ProductTab.js';
import { html } from '/kempo-ui/lit-all.min.js';
import '/kempo-ui/components/Spinner.js';

/*
  The Credits tab of the product form: how many credits buying the product gives, whether it is nothing but credits, and how much of
  its price may be paid in credits. It is placed in the page by kempo-credits, so it appears only while that extension is installed.
  Its own Save button saves these.
*/
export default class ProductCreditsTab extends ProductTab {
  changePercent = event => this.form.set({ creditPercent: Math.min(100, Math.max(0, Math.trunc(Number(event.target.value)) || 0)) });

  changeGranted = event => this.form.set({ creditsGranted: Math.max(0, Math.trunc(Number(event.target.value)) || 0) });

  render(){
    if(!this.ready) return html`<k-spinner></k-spinner>`;
    const { draft, config, form } = this;
    const code = config.currency.toUpperCase();
    const quote = draft.price && draft.creditPercent > 0 && !draft.creditsOnly
      ? Math.ceil(Math.floor(draft.price * draft.creditPercent / 100) * config.credits.perUnit / 10 ** config.decimals)
      : 0;
    const say = draft.creditsOnly ? 'A credit-only product cannot be paid for with credits.'
      : draft.creditPercent === 0 ? '0% means this cannot be paid for with credits at all. 100% means it can be bought entirely with credits.'
      : draft.creditPercent === 100 ? 'It can be bought entirely with credits.'
      : `Up to ${draft.creditPercent}% of the price can be paid in credits, the rest in money.`;
    return html`<div style="max-width: 36rem;">
      <p class="tc-muted mb">Credits are the site's in-app currency, kept by the kempo-credits extension. Buying this product can give the buyer some, and selling credits is just a product that gives them.</p>
      <div class="mb">
        <label class="d-b mbq" for="creditsGranted">Credits the buyer gets<small class="d-b tc-muted">For each one bought. 0 gives none.</small></label>
        <input type="number" id="creditsGranted" style="width: 12rem;" min="0" step="1" .value=${String(draft.creditsGranted)} @input=${this.changeGranted}>
      </div>
      ${draft.creditsOnly && draft.creditsGranted < 1 ? html`<p class="tc-danger mb">Give at least 1 credit, or this is not a credit-only item.</p>` : ''}
      ${draft.creditsOnly && draft.price && draft.creditsGranted > 0
        ? html`<p class="tc-muted mb">That is ${new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(draft.creditsGranted / (draft.price / 10 ** config.decimals))} credits for each ${code} 1.00 spent.</p>`
        : ''}
      <div class="mb" style="max-width: 28rem;">
        <label class="d-b mbq" for="creditPercent">Percentage that can be paid in credits<small class="d-b tc-muted">${say}${quote ? ` At the current rate that is up to ${new Intl.NumberFormat().format(quote)} credits.` : ''}</small></label>
        <div class="d-f" style="gap: var(--spacer_h); align-items: center;">
          <input type="number" id="creditPercent" style="width: 7rem;" min="0" max="100" step="1" .value=${String(draft.creditsOnly ? 0 : draft.creditPercent)} ?disabled=${draft.creditsOnly} @input=${this.changePercent}>
          <span>%</span>
        </div>
      </div>
    </div>`;
  }
}

customElements.define('k-products-credits-tab', ProductCreditsTab);
