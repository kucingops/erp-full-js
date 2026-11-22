# Backend NestJS. Bun hanya dipakai untuk install (sesuai lockfile), runtime tetap Node.
FROM oven/bun:1.4 AS deps
WORKDIR /app
COPY package.json bun.lock ./
COPY prisma ./prisma
# tsconfig wajib ada: Prisma membaca setting module dari sini untuk memilih ekstensi import (.js vs .ts).
COPY prisma.config.ts tsconfig.json ./
# `postinstall` menjalankan `prisma generate`; generate tidak butuh koneksi DB.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
RUN bun install --frozen-lockfile

FROM node:24-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
COPY --from=deps /app/src/generated ./src/generated
RUN npx nest build

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production
# node_modules lengkap dipertahankan supaya `prisma migrate deploy` dan seed (tsx) bisa jalan di container.
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/src/generated ./src/generated
COPY package.json prisma.config.ts tsconfig.json ./
COPY prisma ./prisma
COPY docker-entrypoint.sh ./
EXPOSE 3001
ENTRYPOINT ["sh", "./docker-entrypoint.sh"]
