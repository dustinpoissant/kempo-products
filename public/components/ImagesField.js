import ShadowComponent from '/kempo-ui/components/ShadowComponent.js';
import { html } from '/kempo-ui/lit-all.min.js';
import Toast from '/kempo-ui/components/Toast.js';
import '/kempo-ui/components/Icon.js';
import '/kempo-ui/components/Spinner.js';

/*
  A product's pictures, uploaded to kempo-media. The first is the primary one shown in lists. Only
  used when kempo-media is installed; the form leaves it out otherwise.

    <k-prod-images .value=${product.images} .assets=${imagesMap}></k-prod-images>

  `value` is the list of media ids and `assets` a map of id -> { path, thumbnail, name } to show.
  Fires `change` with { value }.
*/
export default class ImagesField extends ShadowComponent {
  static properties = {
    value: { attribute: false },
    assets: { attribute: false },
    disabled: { type: Boolean, reflect: true },
    uploading: { state: true },
  };

  constructor(){
    super();
    this.value = [];
    this.assets = {};
    this.disabled = false;
    this.uploading = 0;
  }

  /*
    Utility functions
  */
  commit = value => {
    this.value = value;
    this.dispatchEvent(new CustomEvent('change', { detail: { value }, bubbles: true }));
  };

  /*
    Event handlers
  */
  handleFiles = async event => {
    const files = [...event.target.files];
    event.target.value = '';
    if(!files.length) return;
    const { uploadMedia } = await import('/kempo-media/sdk.js');
    const added = [];
    this.uploading += files.length;
    for(const file of files){
      const [error, data] = await uploadMedia(file);
      this.uploading -= 1;
      if(error){
        Toast.error(`${file.name}: ${error.msg}`);
        continue;
      }
      const { asset } = data;
      this.assets = {
        ...this.assets,
        [asset.id]: { id: asset.id, name: asset.originalName, alt: asset.altText ?? '', path: `/${asset.path}`, thumbnail: asset.thumbnailPath ? `/${asset.thumbnailPath}` : null },
      };
      added.push(asset.id);
    }
    if(added.length) this.commit([...this.value, ...added]);
  };

  makePrimary = id => this.commit([id, ...this.value.filter(other => other !== id)]);

  remove = id => this.commit(this.value.filter(other => other !== id));

  /*
    View
  */
  renderTile(id, index){
    const asset = this.assets[id];
    return html`<div style="position: relative; width: 6rem; aspect-ratio: 1; border: 1px solid var(--c_border); border-radius: var(--radius); overflow: hidden; display: flex; align-items: center; justify-content: center;" title=${asset?.name ?? 'Missing file'}>
      ${asset ? html`<img src=${asset.thumbnail ?? asset.path} alt=${asset.alt || asset.name} style="width: 100%; height: 100%; object-fit: cover;">` : html`<k-icon name="image"></k-icon>`}
      ${index === 0
        ? html`<span style="position: absolute; left: 0; bottom: 0; right: 0; background: var(--c_bg); font-size: 0.7rem; text-align: center; line-height: 1.4;"><k-icon name="star_filled"></k-icon> Primary</span>`
        : html`<button type="button" class="no-btn" style="position: absolute; left: 0; bottom: 0; right: 0; background: var(--c_bg); font-size: 0.7rem; line-height: 1.4; cursor: pointer;" ?disabled=${this.disabled} @click=${() => this.makePrimary(id)}><k-icon name="star"></k-icon> Make primary</button>`}
      <button type="button" class="no-btn" style="position: absolute; top: 0; right: 0; background: var(--c_bg); cursor: pointer; line-height: 1;" aria-label="Remove this image" ?disabled=${this.disabled} @click=${() => this.remove(id)}><k-icon name="close"></k-icon></button>
    </div>`;
  }

  render(){
    return html`<div class="d-f" style="gap: var(--spacer_h); align-items: flex-start;">
      ${this.value.map((id, index) => this.renderTile(id, index))}
      ${this.uploading ? html`<k-spinner></k-spinner>` : ''}
      <label class="btn" style="margin: 0; cursor: pointer;">
        <k-icon name="add"></k-icon> Add images
        <input type="file" accept="image/*" multiple hidden ?disabled=${this.disabled} @change=${this.handleFiles}>
      </label>
    </div>`;
  }
}

customElements.define('k-prod-images', ImagesField);
