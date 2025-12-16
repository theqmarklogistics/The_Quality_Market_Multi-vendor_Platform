import 'dotenv/config'
import { defineConfig } from 'prisma/config'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  // Use process.env to avoid throwing when DATABASE_URL isn't set (e.g. for `prisma generate` in CI)
  datasource: {
    url: process.env.DATABASE_URL ?? '',
  },
})
