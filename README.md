# Mini ERP (Full JavaScript)

Mini ERP untuk portfolio: **auth + RBAC, master data, inventory, purchase order, sales order, dashboard**.
Monorepo full TypeScript: backend NestJS + Prisma + PostgreSQL, frontend Next.js + TanStack + shadcn/ui.

| Layer | Stack |
| --- | --- |
| Backend | NestJS 12 (ESM), Prisma 7 (driver adapter `pg`), PostgreSQL 17, JWT (access + refresh rotation), class-validator, Swagger, Vitest |
| Frontend | Next.js 16 (App Router), React 19, TanStack Query 5, TanStack Table 9, shadcn/ui (Base UI) + Tailwind 4, react-hook-form + zod, zustand |
| Tooling | Bun (package manager), Node via mise, oxlint, ESLint |

## Struktur

```
erp-full-js/
├── backend/          NestJS API  → http://localhost:3001/api  (Swagger: /api/docs)
│   ├── prisma/
│   │   ├── schema/       schema dipecah per domain (auth, master-data, inventory, purchasing, sales)
│   │   ├── migrations/   migrasi SQL
│   │   └── seed/         seed data demo, satu file per modul
│   └── src/
│       ├── common/       guard, decorator, DTO pagination, filter error Prisma
│       ├── prisma/       PrismaService (global)
│       ├── auth/         login, refresh, logout, me
│       └── users/        CRUD user (ADMIN) → contoh modul referensi
├── frontend/         Next.js → http://localhost:3000
│   └── src/
│       ├── app/login/            halaman login
│       ├── app/(dashboard)/      semua halaman yang butuh login (sidebar + header)
│       ├── components/           ui/ (shadcn), data-table/, layout/
│       ├── features/<modul>/     hooks API + form per modul
│       ├── hooks/                useListQuery, useDebounce
│       └── lib/                  api client, auth store, navigasi + RBAC menu, types
├── CONTRIBUTING.md   konvensi kode (wajib dibaca sebelum nambah modul)
└── docs/decisions.md catatan keputusan desain
```

## Cara menjalankan (lokal, Windows)

Prasyarat: mise (node lts + bun), PostgreSQL 17 jalan sebagai service.

```powershell
# 1. Buat database (sekali saja)
psql -U postgres -c "CREATE DATABASE erp_db;"

# 2. Backend
cd backend
bun install
copy .env.example .env      # lalu isi password postgres + JWT_ACCESS_SECRET di .env
bun run db:deploy           # jalankan migrasi
bun run db:seed             # isi akun demo + gudang
bun run start:dev           # http://localhost:3001/api/docs

# 3. Frontend (terminal lain)
cd frontend
bun install
copy .env.example .env.local
bun run dev                 # http://localhost:3000
```

## Akun demo

| Role | Email | Password |
| --- | --- | --- |
| Admin | admin@erp.local | Admin123! |
| Staff Gudang | gudang@erp.local | Gudang123! |
| Sales | sales@erp.local | Sales123! |
| Purchasing | purchasing@erp.local | Purchasing123! |

## Test

```powershell
cd backend
bun run test        # unit test (tanpa database, Prisma di-mock)
bun run test:e2e    # e2e ringan
bun run lint
```

## Status modul

- [x] Fondasi: monorepo, schema semua entitas, migrasi awal, auth + RBAC, layout dashboard, halaman User
- [ ] Master data (produk, kategori, customer, supplier, gudang)
- [ ] Inventory (stok, kartu stok, adjustment)
- [ ] Purchase order
- [ ] Sales order
- [ ] Dashboard
