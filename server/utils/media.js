import { getExtension } from 'kempo/server/sdk.js';

/*
  Product images come from kempo-media, an optional integration: nothing here imports it up front.
  It only counts as available when it is both installed as a package and enabled in kempo, and
  without it the images field is hidden, `images` stays empty and public pages show no picture.
*/
let sdk;

const load = async () => sdk ??= await import('kempo-media/sdk').catch(() => null);

export const mediaAvailable = async () => {
  const [error, extension] = await getExtension({ name: 'kempo-media' });
  if(error || !extension?.enabled) return false;
  return Boolean(await load());
};

const describe = asset => ({
  id: asset.id,
  kind: asset.kind,
  name: asset.originalName,
  alt: asset.altText ?? '',
  path: `/${asset.path}`,
  thumbnail: asset.thumbnailPath ? `/${asset.thumbnailPath}` : null,
  width: asset.width,
  height: asset.height,
});

/* A map of media id -> a small description of each image. An id with no entry was deleted, or kempo-media is off. */
export const getAssets = async ids => {
  const wanted = [...new Set(ids)];
  if(!wanted.length || !(await mediaAvailable())) return {};
  const { getMediaAsset } = await load();
  const lookups = await Promise.all(wanted.map(async id => [id, await getMediaAsset(id)]));
  const result = {};
  for(const [id, [error, asset]] of lookups) if(!error) result[id] = describe(asset);
  return result;
};

/* Returns an { code, msg } for the first id that cannot be used, or null when all can. */
export const checkAssets = async (ids, label = 'Images') => {
  if(!(await mediaAvailable())) return { code: 409, msg: `${label}: kempo-media is not installed` };
  const assets = await getAssets(ids);
  const missing = ids.find(id => !assets[id]);
  return missing ? { code: 400, msg: `${label}: a selected file no longer exists in the media library` } : null;
};
