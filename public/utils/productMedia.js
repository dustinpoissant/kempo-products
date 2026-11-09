/*
  A product's media, served at /products/utils/productMedia.js. `assets` is the map of media id -> description the API
  sends with a product (`kind` is image, video, audio and so on). The kinds a gallery can play are the only ones shown.
*/
const PLAYABLE = ['image', 'video', 'audio'];

const kindOf = asset => asset.kind ?? 'image';

/* The media of a product the gallery can show, in the order the product keeps them. */
export const mediaOf = (product, assets) => (product.images ?? []).map(id => assets?.[id]).filter(asset => asset && PLAYABLE.includes(kindOf(asset)));

/*
  The picture a product has in a list or a search result: its first image, or failing that a video with a thumbnail.
  A video with no thumbnail is not a picture, so it is never used (a card would draw a broken image).
*/
export const primaryPicture = (product, assets) => {
  const media = (product.images ?? []).map(id => assets?.[id]).filter(Boolean);
  return media.find(asset => kindOf(asset) === 'image') ?? media.find(asset => asset.thumbnail) ?? null;
};
