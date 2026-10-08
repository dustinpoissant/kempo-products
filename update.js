import install from './install.js';

/*
  kempo creates tables that are new in an update but never alters ones that already exist, so a
  column added to an existing table has to be added here with an idempotent statement. Indexes are
  re-asserted the same way.
*/
export default async () => {
  await install();
};
