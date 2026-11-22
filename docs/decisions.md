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
## 12. Dashboard: satu endpoint `summary`, isi disaring per role
`GET /api/dashboard/summary` dan `/trend` boleh diakses semua role, tapi bagian yang tidak boleh dilihat role itu dikembalikan `null` (atau field-nya dihilangkan di trend). Aturannya ada di satu fungsi murni `dashboardScope(role)` yang mengikuti matriks role di CONTRIBUTING, jadi gampang dites dan query yang tidak perlu tidak dijalankan sama sekali. Alternatifnya endpoint terpisah per bagian dengan `@Roles()`, tapi FE jadi harus tahu role mana boleh panggil apa dan ada banyak request kecil.
- Omzet/belanja hanya menghitung dokumen yang sudah jalan: SO `CONFIRMED`/`SHIPPED`, PO `APPROVED`/`RECEIVED`.
- Bulan dihitung di WIB (`Asia/Jakarta`, tanpa DST) baik di SQL maupun JS, supaya transaksi jam 01:00 WIB tanggal 1 tidak masuk bulan sebelumnya.
- Group by bulan dan "stok menipis" (`SUM(stok) <= min_stock`) pakai `$queryRaw` karena Prisma Client tidak bisa `date_trunc`/`HAVING` terhadap kolom. Status enum ditulis literal di SQL karena parameter dikirim sebagai text dan Postgres menolak `enum = text`.
- Chart pakai shadcn `chart` (Recharts). Warna seri tetap per entitas (penjualan biru, pembelian oranye) supaya tidak berubah walau role cuma lihat satu seri. Ada toggle tabel sebagai alternatif chart.
