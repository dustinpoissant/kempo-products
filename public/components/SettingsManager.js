import ShadowComponent from '/kempo-ui/components/ShadowComponent.js';
import { html } from '/kempo-ui/lit-all.min.js';
import Toast from '/kempo-ui/components/Toast.js';
import '/kempo-ui/components/Spinner.js';
import { getSettings, saveSettings } from '/products/sdk.js';

/*
  The catalog's settings with a form for each section, instead of the one flat table at
  /admin/settings (which stays, and edits the same values).

    <k-prod-settings></k-prod-settings>

  Needs products:settings:manage. Only what changed is saved, and nothing is saved unless every
  value is acceptable.
*/

const CURRENCIES = [
  ['usd', 'US dollar'], ['eur', 'Euro'], ['gbp', 'British pound'], ['cad', 'Canadian dollar'], ['aud', 'Australian dollar'],
  ['nzd', 'New Zealand dollar'], ['chf', 'Swiss franc'], ['sek', 'Swedish krona'], ['nok', 'Norwegian krone'],
  ['dkk', 'Danish krone'], ['jpy', 'Japanese yen'], ['mxn', 'Mexican peso'], ['inr', 'Indian rupee'],
];

export default class SettingsManager extends ShadowComponent {
  static properties = {
    saved: { state: true },
    draft: { state: true },
    credits: { state: true },
    loading: { state: true },
    saving: { state: true },
    error: { state: true },
  };

  constructor(){
    super();
    this.saved = {};
    this.draft = {};
    this.credits = false;
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
    const [error, data] = await getSettings();
    this.loading = false;
    if(error){
      this.error = error.code === 403 ? 'You do not have permission to change the catalog settings.' : error.msg;
      return;
    }
    this.saved = Object.fromEntries(data.settings.map(setting => [setting.name, setting.value]));
    this.draft = { ...this.saved };
    this.credits = data.credits;
  };

  get changes(){
    return Object.fromEntries(Object.entries(this.draft).filter(([name, value]) => value !== this.saved[name]));
  }

  set = (name, value) => {
    this.draft = { ...this.draft, [name]: value };
  };

  number = name => event => {
    const value = event.target.value;
    this.set(name, value === '' ? '' : Number(value));
  };

  /*
    Event handlers
  */
  save = async event => {
    event.preventDefault();
    if(this.saving || !Object.keys(this.changes).length) return;
    this.saving = true;
    const [error, data] = await saveSettings(this.changes);
    this.saving = false;
    if(error){
      Toast.error(error.msg);
      return;
    }
    this.saved = Object.fromEntries(data.settings.map(setting => [setting.name, setting.value]));
    this.draft = { ...this.saved };
    Toast.success('Settings saved');
  };

  revert = () => {
    this.draft = { ...this.saved };
  };

  /*
    View
  */
  renderSection(title, description, body){
    return html`<section class="card mb" style="max-width: 44rem; padding-bottom: var(--spacer);">
      <h2 class="mbq">${title}</h2>
      <p class="tc-muted">${description}</p>
      ${body}
    </section>`;
  }

  render(){
    if(this.loading) return html`<k-spinner></k-spinner>`;
    if(this.error) return html`<p class="tc-danger">${this.error}</p>`;
    const { draft } = this;
    const code = String(draft.currency || '').toUpperCase();
    const known = CURRENCIES.some(([value]) => value === draft.currency);
    const dirty = Object.keys(this.changes).length > 0;

    return html`<form @submit=${this.save}>
      ${this.renderSection('Prices', 'The currency prices are written in, and whether visitors see them at all.', html`
        <div class="mb">
          <label class="d-b mbq" for="currency">Currency</label>
          <select id="currency" style="min-width: 16rem;" @change=${event => this.set('currency', event.target.value)}>
            ${known ? '' : html`<option value=${draft.currency} selected>${code}</option>`}
            ${CURRENCIES.map(([value, label]) => html`<option value=${value} ?selected=${draft.currency === value}>${value.toUpperCase()} — ${label}</option>`)}
          </select>
          <p class="tc-muted mbq">Changing it does not convert existing prices: a price of 1999 is 19.99 in any currency.</p>
        </div>
        <div class="mb">
          <label class="checkbox"><input type="checkbox" id="prices_visible" .checked=${draft.prices_visible} @change=${event => this.set('prices_visible', event.target.checked)}> Show prices to visitors</label>
          <p class="tc-muted mbq">Turn it off to run a catalog that never shows what things cost. The admin always sees them.</p>
        </div>
      `)}
      ${this.renderSection('The public list', 'How the public product list is laid out.', html`
        <div class="mb">
          <label class="d-b mbq" for="page_size">Products per page</label>
          <input type="number" id="page_size" style="width: 8rem;" min="1" max="100" step="1" .value=${String(draft.page_size)} @input=${this.number('page_size')}>
          <p class="tc-muted mbq">From 1 to 100.</p>
        </div>
      `)}
      ${this.credits ? this.renderSection('Credits', 'Products can give credits when they are bought, and take credits as payment for part of their price. This is what a credit is worth when spent.', html`
        <div class="mb">
          <label class="d-b mbq" for="credits_per_unit">Credits that equal 1.00 ${code}</label>
          <input type="number" id="credits_per_unit" style="width: 10rem;" min="1" max="1000000" step="1" .value=${String(draft.credits_per_unit)} @input=${this.number('credits_per_unit')}>
          <p class="tc-muted mbq">
            ${Number.isInteger(draft.credits_per_unit) && draft.credits_per_unit > 0
              ? `At ${new Intl.NumberFormat().format(draft.credits_per_unit)}, a ${code} 10.00 product that accepts 100% credits costs ${new Intl.NumberFormat().format(draft.credits_per_unit * 10)} credits.`
              : 'A whole number, 1 or more.'}
            This only sets what spending credits on a product costs. How many credits a pack of them sells for is up to that product.
          </p>
        </div>
      `) : html`<p class="tc-muted">Install the kempo-credits extension to let products give credits and accept them as payment.</p>`}
      <div class="d-f" style="gap: var(--spacer_h);">
        <button type="submit" class="btn success" ?disabled=${this.saving || !dirty}>${this.saving ? 'Saving…' : 'Save settings'}</button>
        <button type="button" class="btn" ?disabled=${this.saving || !dirty} @click=${this.revert}>Discard changes</button>
      </div>
    </form>`;
  }
}

customElements.define('k-prod-settings', SettingsManager);
