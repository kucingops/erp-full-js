# Konvensi Kode

Dokumen ini jadi patokan semua modul supaya konsisten walau dikerjakan paralel.
**Contoh referensi lengkap:** modul `users` (backend `src/users/`, frontend `app/(dashboard)/users/` + `features/users/`).

## Git

- Branch per modul dari `main`: `feat/master-data`, `feat/inventory`, `feat/purchase-order`, `feat/sales-order`, `feat/dashboard`.
- Commit pakai Conventional Commits: `feat(inventory): add stock adjustment`, `fix(auth): ...`, `test(...)`, `docs(...)`.
- Satu PR per modul ke `main`. Sebelum PR: `bun run lint`, `bun run test`, `bun run build` di backend & frontend.

## Backend (NestJS)

### Struktur modul

```
src/<modul>/
├── <modul>.module.ts
├── <modul>.controller.ts     tipis: validasi + panggil service
├── <modul>.service.ts        logika bisnis + akses Prisma
├── <modul>.service.spec.ts   unit test (Prisma di-mock)
└── dto/<modul>.dto.ts        Create/Update/Query DTO (class-validator + @nestjs/swagger)
```

Daftarkan modul di `src/app.module.ts` (satu baris di bagian bawah `imports`).

- Project ini **ESM**: import relatif wajib pakai akhiran `.js` (`'./products.service.js'`).
- Tipe & enum Prisma diimport dari `src/generated/prisma/client.js` / `enums.js` (hasil `prisma generate`, tidak di-commit).
- Tes pakai **Vitest** (`vi.fn()`, bukan `jest.fn()`).

### API

- Prefix global `/api`. Resource plural kebab-case: `/api/products`, `/api/purchase-orders`.
- CRUD standar: `GET /` (list), `GET /:id`, `POST /`, `PATCH /:id`, `DELETE /:id`. Aksi status pakai sub-route: `POST /purchase-orders/:id/approve`, `/receive`, `/cancel`.
- Param id selalu `ParseUUIDPipe`.
- **List** menerima `PaginationQueryDto` (`page, limit, search, sortBy, sortOrder`); extend kalau butuh filter lain. Response **selalu** `{ data, meta: { page, limit, total, totalPages } }` lewat helper `paginate()`. Kolom sort di-whitelist dengan `toOrderBy()`.
- Response detail/create/update = objek entity langsung (tanpa wrapper).
- Error: lempar exception Nest (`NotFoundException`, `BadRequestException`, `ConflictException`). Error unik/relasi Prisma otomatis dipetakan oleh `PrismaExceptionFilter` (P2002→409, P2003→409, P2025→404).
- `ValidationPipe` global pakai `whitelist + forbidNonWhitelisted`: field yang tidak ada di DTO akan ditolak.
- Semua DTO & controller diberi dekorator Swagger (`@ApiTags`, `@ApiBearerAuth`, `@ApiProperty`).
- Uang pakai `Decimal(15,2)` di DB. Prisma mengembalikan `Decimal` yang di-serialize jadi string di JSON. FE parse dengan `Number()`.

### Auth & RBAC

- `JwtAuthGuard` + `RolesGuard` terpasang **global**. Semua endpoint wajib login kecuali diberi `@Public()`.
- Batasi role dengan `@Roles(Role.PURCHASING, ...)` di controller atau method. `ADMIN` selalu lolos.
- User login: `@CurrentUser() user: AuthUser` (`{ id, email, role }`).
- Matriks role (samakan dengan `frontend/src/lib/navigation.ts`):

| Resource | Baca | Tulis |
| --- | --- | --- |
| products, categories | semua role | ADMIN, WAREHOUSE |
| customers | SALES | SALES |
| suppliers | PURCHASING | PURCHASING |
| warehouses | semua role | ADMIN |
| inventory (stok, kartu stok) | WAREHOUSE, SALES, PURCHASING | WAREHOUSE (adjustment) |
| purchase-orders | PURCHASING, WAREHOUSE | PURCHASING (create/approve), WAREHOUSE (receive) |
| sales-orders | SALES, WAREHOUSE | SALES (create/confirm), WAREHOUSE (ship) |
| stock-transfers, stock-opnames | WAREHOUSE | WAREHOUSE |
| reports (penjualan / pembelian / stok) | SALES / PURCHASING / WAREHOUSE+SALES+PURCHASING | - (read-only) |
| sales-invoices (AR) | SALES | SALES |
| purchase-bills (AP) | PURCHASING | PURCHASING |
| users | ADMIN | ADMIN |
| currencies, exchange-rates | semua role | ADMIN |

### Database (Prisma)

- Schema dipecah per domain di `prisma/schema/*.prisma`. Edit hanya file domain modulmu.
- Semua entity MVP **sudah ada** di migrasi `0_init`. Kalau perlu ubah schema: `bun run db:migrate -- --name <nama>` dan commit folder migrasinya.
- Kolom DB snake_case lewat `@map`, nama tabel plural lewat `@@map`.
- **Stok hanya boleh berubah lewat `InventoryService`** (modul inventory) yang mencatat `StockMovement` dalam satu `$transaction`. PO receive dan SO ship memanggil service ini, bukan update tabel `stocks` langsung.
- Nomor dokumen: `PO-YYYYMMDD-XXXX` / `SO-YYYYMMDD-XXXX` / `INV-YYYYMMDD-XXXX` / `BILL-YYYYMMDD-XXXX` / `TRF-YYYYMMDD-XXXX` / `OPN-YYYYMMDD-XXXX`.
- Seed: buat `prisma/seed/<modul>.ts` (idempotent, pakai `upsert`) lalu panggil di `prisma/seed/index.ts`.

## Frontend (Next.js)

- Halaman yang butuh login taruh di `src/app/(dashboard)/<resource>/page.tsx` (otomatis dapat sidebar, header, AuthGuard).
- Halaman dashboard adalah **client component** (`"use client"`) karena data diambil via TanStack Query dengan token di browser.
- Tambah menu di `src/lib/navigation.ts` dengan `roles` yang sama dengan backend. AuthGuard otomatis menolak halaman kalau role tidak cocok.
- Semua request lewat `api()` dari `@/lib/api` (otomatis Bearer token + auto refresh saat 401). Jangan pakai `fetch` langsung.
- Per modul, buat `src/features/<modul>/`:
  - `api.ts`: konstanta query key + hook mutation (`useSaveX`, `useDeleteX`) dengan `invalidateQueries` + toast.
  - `<x>-form-dialog.tsx`: form react-hook-form + zod di dalam `Dialog`.
- List pakai `useListQuery<T>(resource, params)` + `<DataTable columns result onPageChange ... />`. Search di-debounce dengan `useDebounce`.
- Tipe response taruh di `src/lib/types.ts` (atau `features/<modul>/types.ts` kalau spesifik modul).
- UI pakai komponen shadcn di `components/ui` (style **base-nova** = Base UI, bukan Radix: komposisi pakai prop `render`, bukan `asChild`). Tambah komponen: `bunx --bun shadcn@latest add <nama>`.
- Teks UI berbahasa Indonesia.
- Format angka/uang: `Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" })`.
