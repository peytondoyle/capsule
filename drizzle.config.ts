import { defineConfig } from 'drizzle-kit'

// drizzle-kit does not read .env.local — run it through dotenv-cli:
//   npm run db:generate / db:migrate / db:studio
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/server/db/schema.ts',
  out: './drizzle',
  dbCredentials: { url: process.env.DATABASE_URL! },
  strict: true,
  verbose: true,
})
