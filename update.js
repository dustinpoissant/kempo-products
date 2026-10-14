import install from './install.js';

/*
  kempo creates tables that are new in an update but never alters ones that already exist, so a
  column added to an existing table has to be added with an idempotent statement (see COLUMNS in
  install.js, which this runs). Indexes are re-asserted the same way.
*/
export default async () => {
  await install();
};
