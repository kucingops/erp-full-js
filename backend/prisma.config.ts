import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// Schema dipecah per domain di folder prisma/schema (multi-file schema),
// supaya tiap modul bisa dikerjakan paralel tanpa banyak konflik.
export default defineConfig({
  schema: 'prisma/schema',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed/index.ts',
  },
  datasource: {
    url: process.env['DATABASE_URL'],
  },
});
