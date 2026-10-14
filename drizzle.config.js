import { existsSync } from 'fs';
import { defineConfig } from 'drizzle-kit';

/*
  Local/CI test-database setup only: this extension has no migrations of its own in production. Its
  tables are created the real way, via createTablesFromSchema at install time. This file exists so
  `npx drizzle-kit push` can stand up a throwaway database holding kempo's core tables and this
  extension's own.

  kempo-credits is an optional peer. Its tables are included when it is installed, so the credits
  integration can be tested; without it that suite skips itself.

  No dotenv on purpose: DATABASE_URL must be a real environment variable.
*/
const credits = './node_modules/kempo-credits/server/db/schema.js';
export default defineConfig({
  schema: [
    './server/db/schema.js',
    './node_modules/kempo/server/db/schema.js',
    ...(existsSync(credits) ? [credits] : []),
  ],
  out: './server/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
