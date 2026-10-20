import { defineConfig } from 'drizzle-kit';

// Generates SQL migrations into ./drizzle from src/server/db/schema.ts. Applying them is done only by
// scripts/migrate.ts, which verifies the target database belongs to RedSky first.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/server/db/schema.ts',
  out: './drizzle',
  schemaFilter: ['redsky'],
  migrations: { schema: 'redsky', table: '__migrations' },
  dbCredentials: { url: process.env.REDSKY_DATABASE_URL ?? 'postgres://localhost:5432/redsky' },
  strict: true,
  verbose: true,
});
