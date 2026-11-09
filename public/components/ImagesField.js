import ShadowComponent from '/kempo-ui/components/ShadowComponent.js';
import { html, css, repeat } from '/kempo-ui/lit-all.min.js';
import '/kempo-ui/components/Icon.js';
import '/kempo-ui/components/Sortable.js';

/*
  A product's pictures and videos, kept in kempo-media, in the order they are dragged into. The first is the primary one
  shown in lists, so there is nothing else to choose. Only used when kempo-media is installed; the form leaves it out otherwise.

    <k-products-images .value=${product.images} .assets=${imagesMap}>
      <k-media-upload slot="upload"></k-media-upload>
    </k-products-images>

  `value` is the list of media ids and `assets` a map of id -> { kind, path, thumbnail, name } to show.
  Fires `change` with { value, assets }: the new list of ids, and every description it knows, so the
  parent can keep showing pictures just uploaded.

  It does not upload anything itself. Whatever puts files in is placed in the `upload` slot (kempo-media puts its
  `<k-media-upload>` there) and tells this field about each one with a bubbling `media-uploaded` event whose detail is
  `{ asset }`, the media asset it made (`id`, `kind`, `originalName`, `altText`, `path`, `thumbnailPath`).
*/
export default class ImagesField extends ShadowComponent {
  static properties = {
    value: { attribute: false },
    assets: { attribute: false },
    disabled: { type: Boolean, reflect: true },
  };

  constructor(){
    super();
    this.value = [];
    this.assets = {};
    this.disabled = false;
  }

  /*
    Lifecycle callbacks
  */
  connectedCallback(){
    super.connectedCallback();
    this.addEventListener('media-uploaded', this.handleUploaded);
  }

  disconnectedCallback(){
    this.removeEventListener('media-uploaded', this.handleUploaded);
    super.disconnectedCallback();
  }

  static styles = css`
    .tiles {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-start;
      gap: var(--spacer_h);
    }
  `;

  /*
    Utility functions
  */
  commit = value => {
    this.value = value;
    this.dispatchEvent(new CustomEvent('change', { detail: { value, assets: this.assets }, bubbles: true }));
  };

  /*
    Event handlers
  */
  handleUploaded = event => {
    const { asset } = event.detail;
    this.assets = {
      ...this.assets,
      [asset.id]: { id: asset.id, name: asset.originalName, alt: asset.altText ?? '', kind: asset.kind, path: `/${asset.path}`, thumbnail: asset.thumbnailPath ? `/${asset.thumbnailPath}` : null },
    };
    if(!this.value.includes(asset.id)) this.commit([...this.value, asset.id]);
  };

  /* The list is ours to render (`controlled`), so the new order is made here from where the tile was dropped. */
  handleSort = ({ detail: { from, to } }) => {
    if(from === to) return;
    const list = [...this.value];
    const [moved] = list.splice(from, 1);
    list.splice(to, 0, moved);
    this.commit(list);
  };

  remove = id => this.commit(this.value.filter(other => other !== id));

  /*
    View
  */
  renderTile(id, index){
    const asset = this.assets[id];
    return html`<k-sortable-item bare title=${index === 0 ? 'The primary picture. Drag to reorder.' : 'Drag to reorder.'}>
      <div style="position: relative; width: 6rem; aspect-ratio: 1; border: 1px solid var(--c_border); border-radius: var(--radius); overflow: hidden; display: flex; align-items: center; justify-content: center;">
        ${asset && (asset.thumbnail || asset.kind === 'image') ? html`<img src=${asset.thumbnail ?? asset.path} alt=${asset.alt || asset.name} draggable="false" style="width: 100%; height: 100%; object-fit: cover;">` : html`<k-icon name=${asset?.kind === 'video' ? 'video' : 'image'}></k-icon>`}
        ${index === 0 ? html`<span style="position: absolute; left: 0; bottom: 0; right: 0; background: var(--c_bg); font-size: 0.7rem; text-align: center; line-height: 1.4;"><k-icon name="star_filled"></k-icon> Primary</span>` : ''}
        <button type="button" class="no-btn" style="position: absolute; top: 0; right: 0; background: var(--c_bg); cursor: pointer; line-height: 1;" aria-label="Remove ${asset?.name ?? 'this file'}" ?disabled=${this.disabled} @click=${() => this.remove(id)}><k-icon name="close"></k-icon></button>
      </div>
    </k-sortable-item>`;
  }

  render(){
    return html`
      <k-sortable class="tiles" grid controlled @sort=${this.handleSort}>
        ${repeat(this.value, id => id, (id, index) => this.renderTile(id, index))}
      </k-sortable>
      <div class="mt"><slot name="upload"></slot></div>
    `;
  }
}

customElements.define('k-products-images', ImagesField);
