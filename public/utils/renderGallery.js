import { html, nothing } from '/kempo-ui/lit-all.min.js';
import '/kempo-ui/components/MediaGallery.js';
import '/kempo-ui/components/Icon.js';
import { mediaOf } from '/products/utils/productMedia.js';

/*
  A product's pictures and videos as kempo-ui's media gallery: a large stage, a strip of thumbnails, arrows, swipe and a
  fullscreen viewer. Used by the product page and the Product gallery widget, so they look and behave the same.
  `options` are the gallery's own settings (`thumbsPosition`, `ratio`, `noFullscreen`).
*/
export default (product, assets, { thumbsPosition = 'bottom', ratio = '1/1', noFullscreen = false } = {}) => {
  const media = mediaOf(product, assets);
  if(!media.length) return html`<div class="tc-muted" style="display: flex; align-items: center; justify-content: center; aspect-ratio: ${ratio}; border: 1px solid var(--c_border); border-radius: var(--radius); font-size: 3rem;"><k-icon name="image"></k-icon></div>`;
  return html`<k-media-gallery thumbs-position=${thumbsPosition} ratio=${ratio} ?no-fullscreen=${noFullscreen}>
    ${media.map(asset => html`<k-media-gallery-item
      type=${asset.kind ?? 'image'}
      src=${asset.path}
      alt=${asset.alt || product.name}
      thumb=${asset.thumbnail ?? nothing}
      poster=${asset.kind === 'video' ? asset.thumbnail ?? nothing : nothing}
    ></k-media-gallery-item>`)}
  </k-media-gallery>`;
};
