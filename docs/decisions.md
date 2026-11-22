# Catatan Keputusan Desain

## 1. Stack: NestJS + Prisma + Next.js
Dipilih karena paling sering muncul di lowongan kerja full-stack JS/TS. NestJS mirip Spring Boot (module, DI, decorator, guard), jadi gampang dijelaskan saat interview.

## 2. Prisma 7 dengan driver adapter `@prisma/adapter-pg`
Prisma 7 sudah tidak pakai query engine Rust secara default; koneksi lewat driver `pg`. Client di-generate ke `src/generated/prisma` (bukan `node_modules`) dan **tidak di-commit** (dibuat ulang lewat `postinstall`). CLI Prisma dipin ke 7.x karena tag `latest` di npm saat ini menunjuk ke 8.0 RC.

## 3. Schema multi-file per domain
`prisma/schema/` dipecah per domain supaya modul bisa dikerjakan paralel tanpa konflik di satu file besar. Semua entitas MVP sudah didefinisikan di migrasi awal `0_init`, jadi thread modul jarang perlu migrasi baru.

## 4. RBAC berbasis enum role
4 role tetap (ADMIN, WAREHOUSE, SALES, PURCHASING) sebagai enum, dicek oleh `RolesGuard` lewat `@Roles()`. Lebih simpel daripada tabel permission dinamis dan cukup untuk MVP. Kalau nanti butuh permission granular, bisa naik ke tabel `roles` + `permissions`.

## 5. Token: JWT access pendek + refresh token opaque dengan rotation
- Access token JWT 15 menit, stateless.
- Refresh token = string acak, disimpan di DB sebagai SHA-256 hash, di-rotate tiap refresh.
- Reuse detection: token yang sudah di-revoke dipakai lagi → semua sesi user dicabut.
- Di FE disimpan di localStorage (zustand persist). Trade-off: rentan XSS; alternatif yang lebih aman adalah httpOnly cookie, bisa jadi upgrade berikutnya.

## 6. Guard global + `@Public()`
Default aman: endpoint baru otomatis butuh login. Lupa pasang guard tidak membuka celah.

## 7. Stok = saldo (`stocks`) + kartu stok append-only (`stock_movements`)
Saldo dibaca cepat dari `stocks`; histori lengkap dari `stock_movements` (dengan `balance_after`). Semua perubahan lewat `InventoryService` dalam transaksi supaya saldo dan histori selalu sinkron.

## 8. Frontend: client-side data fetching
Halaman dashboard adalah client component dengan TanStack Query, karena token ada di browser dan halaman ERP sifatnya interaktif (bukan SEO). Server-side pagination: tabel hanya menampilkan satu halaman dari API.

## 9. Package manager Bun, runtime Node
Bun untuk install cepat; NestJS tetap dijalankan di Node (`nest start`) karena paling kompatibel dengan ekosistem Nest.

## 10. Telemetry bawaan Nest CLI dihapus
Nest CLI 12 otomatis memasang `@nestjs/observe` (layanan telemetry SaaS). Dihapus karena tidak dibutuhkan untuk project lokal/portfolio.

## 11. Master data: satu `MasterDataModule`, hapus = hard delete + FK Restrict
- Lima modul (categories, products, customers, suppliers, warehouses) dikumpulkan di `MasterDataModule`, jadi `AppModule` cukup tambah satu baris (minim konflik merge).
- `DELETE` benar-benar menghapus, tapi relasi `onDelete: Restrict` membuat data yang sudah dipakai stok/PO/SO ditolak 409 oleh `PrismaExceptionFilter`. Untuk data yang sudah dipakai, pakai `isActive=false` (soft-disable). Kategori pengecualian: dihapus → produk jadi tanpa kategori (`SetNull`).
- Kode/SKU dinormalisasi di DTO (`trim` + uppercase). Field opsional yang dikirim string kosong disimpan sebagai `null` supaya bisa dikosongkan lewat PATCH.
- Customer & Supplier bentuknya sama: di FE dipakai satu `PartnerListPage` + `PartnerFormDialog` yang dikonfigurasi lewat props (komposisi, bukan copy-paste).
- Sort server-side di FE lewat `SortableHeader` + `useSort` (file baru, `DataTable` tidak diubah). Kolom yang bisa di-sort harus ada di whitelist `SORTABLE` service.
