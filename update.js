import install from './install.js';
import { deleteSetting, getExtension } from 'kempo/server/sdk.js';

/*
  kempo creates tables that are new in an update but never alters ones that already exist, so a
  column added to an existing table has to be added with an idempotent statement (see COLUMNS in
  install.js, which this runs). Indexes are re-asserted the same way.

  The credits rate moved to kempo-credits, whose update takes a value still held here. Without
  kempo-credits nothing takes it, so it is removed here rather than left on /admin/settings.
*/
export default async () => {
  await install();
  const [, credits] = await getExtension({ name: 'kempo-credits' });
  if(!credits) await deleteSetting('kempo-products', 'credits_per_unit');
};
