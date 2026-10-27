import ShadowComponent from '/kempo-ui/components/ShadowComponent.js';
import { html } from '/kempo-ui/lit-all.min.js';
import Toast from '/kempo-ui/components/Toast.js';
import '/kempo-ui/components/Spinner.js';
import { getSettings, saveSettings } from '/products/sdk.js';

/*
  The catalog's settings with a form for each section, instead of the one flat table at
  /admin/settings (which stays, and edits the same values).

    <k-products-settings></k-products-settings>

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
    loading: { state: true },
    saving: { state: true },
    error: { state: true },
  };

  constructor(){
    super();
    this.saved = {};
    this.draft = {};
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
    const [error, data] = await getSettings();
    this.loading = false;
    if(error){
      this.error = error.code === 403 ? 'You do not have permission to change the catalog settings.' : error.msg;
      return;
    }
    this.saved = Object.fromEntries(data.settings.map(setting => [setting.name, setting.value]));
    this.draft = { ...this.saved };
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
    return html`<section class="mb">
      <h2 class="mbq">${title}</h2>
      <p class="tc-muted mb">${description}</p>
      ${body}
    </section>`;
  }

  render(){
    if(this.loading) return html`<k-spinner></k-spinner>`;
    if(this.error) return html`<p class="tc-danger mb">${this.error}</p>`;
    const { draft } = this;
    const code = String(draft.currency || '').toUpperCase();
    const known = CURRENCIES.some(([value]) => value === draft.currency);
    const dirty = Object.keys(this.changes).length > 0;

    return html`<form @submit=${this.save}>
      ${this.renderSection('Prices', 'The currency prices are written in, and whether visitors see them at all.', html`
        <div class="mb">
          <label class="d-b mbq" for="currency">Currency<small class="d-b tc-muted">Changing it does not convert existing prices: a price of 1999 is 19.99 in any currency.</small></label>
          <select id="currency" style="min-width: 16rem;" @change=${event => this.set('currency', event.target.value)}>
            ${known ? '' : html`<option value=${draft.currency} selected>${code}</option>`}
            ${CURRENCIES.map(([value, label]) => html`<option value=${value} ?selected=${draft.currency === value}>${value.toUpperCase()} — ${label}</option>`)}
          </select>
        </div>
        <div class="mb">
          <label class="checkbox"><input type="checkbox" id="prices_visible" .checked=${draft.prices_visible} @change=${event => this.set('prices_visible', event.target.checked)}> Show prices to visitors<small class="d-b tc-muted">Turn it off to run a catalog that never shows what things cost. The admin always sees them.</small></label>
        </div>
      `)}
      ${this.renderSection('The public list', 'How the public product list is laid out.', html`
        <div class="mb">
          <label class="d-b mbq" for="page_size">Products per page<small class="d-b tc-muted">From 1 to 100.</small></label>
          <input type="number" id="page_size" style="width: 8rem;" min="1" max="100" step="1" .value=${String(draft.page_size)} @input=${this.number('page_size')}>
        </div>
      `)}
      <div class="d-f mb" style="gap: var(--spacer_h);">
        <button type="submit" class="btn success" ?disabled=${this.saving || !dirty}>${this.saving ? 'Saving…' : 'Save settings'}</button>
        <button type="button" class="btn" ?disabled=${this.saving || !dirty} @click=${this.revert}>Discard changes</button>
      </div>
    </form>`;
  }
}

customElements.define('k-products-settings', SettingsManager);
