# User Management & Audit Log

Catatan desain fitur kelola user (ADMIN) dan audit log. Kode: backend `src/users/`, `src/audit/`, frontend `app/(dashboard)/users/`, `app/(dashboard)/audit-logs/`, `features/users/`, `features/audit/`.

## User management

| Endpoint | Fungsi |
| --- | --- |
| `GET /api/users?search=&role=&isActive=&sortBy=&sortOrder=` | list + filter |
| `POST /api/users` | buat user (email, name, role, password) |
| `PATCH /api/users/:id` | edit profil: `name`, `email`, `role` saja |
| `POST /api/users/:id/deactivate` | nonaktifkan + cabut semua refresh token |
| `POST /api/users/:id/activate` | aktifkan lagi |
| `POST /api/users/:id/reset-password` | admin set password baru + cabut semua sesi |

Semua endpoint `@Roles(ADMIN)`.

Kenapa begini:

- **Password & status keluar dari PATCH.** Dulu `PATCH` bisa kirim `password`/`isActive`. Sekarang dipisah jadi sub-route aksi (sesuai konvensi `POST /:id/<aksi>`), jadi niatnya eksplisit, gampang dikasih efek samping (cabut token), dan di audit log kebaca jelas sebagai `deactivate` / `reset-password`, bukan "UPDATE isActive". Mirip command method di DDD (`user.deactivate()`) vs setter biasa.
- **Nonaktif = login ditolak + refresh token dicabut** dalam satu `$transaction`. `AuthService` sudah menolak user `isActive=false` di login & refresh, jadi tidak perlu ubah modul auth.
  - Catatan: access token JWT yang sudah terbit tetap valid sampai kedaluwarsa (maks. 15 menit) karena JWT stateless. Kalau butuh instan, opsinya: cek `isActive` di `JwtAuthGuard` (1 query per request, bisa di-cache) atau token version di payload. Belum dikerjakan karena trade-off performa dan bukan scope MVP.
- **Guard diri sendiri** di service (bukan di FE saja): admin tidak bisa menonaktifkan akunnya sendiri dan tidak bisa menurunkan role-nya sendiri dari ADMIN → `400`. Efeknya, selalu ada minimal satu admin aktif (yang sedang login), jadi sistem tidak bisa "terkunci". FE juga menyembunyikan/mematikan kontrolnya, tapi sumber kebenaran tetap backend.
- Reset password juga mencabut semua sesi, supaya kalau akun bocor, reset langsung menendang penyusup.
- Email dinormalisasi (`trim` + lowercase) di DTO; email duplikat → P2002 → 409 lewat `PrismaExceptionFilter`.

## Audit log

### Tabel

`prisma/schema/audit.prisma` → tabel `audit_logs`:

| Kolom | Isi |
| --- | --- |
| `user_id` | pelaku (nullable, FK `SetNull`) |
| `action` | enum `CREATE`, `UPDATE`, `DELETE`, `STATUS` |
| `entity` | nama model Prisma: `product`, `purchaseOrder`, `invoice`, `payment`, `user`, ... |
| `entity_id` | id baris yang berubah |
| `operation` | nama aksi status (`approve`, `ship`, `deactivate`, `reset-password`, ...) |
| `before` / `after` | snapshot JSONB baris (tanpa relasi) |
| `ip` | IP request |

Disimpan **snapshot before/after utuh**, bukan diff. Diff dihitung di FE (field yang beda di-highlight). Alasannya: snapshot gampang di-query ulang dan tidak kehilangan konteks (misal mau lihat nilai field lain saat itu), sedangkan diff bisa diturunkan kapan saja. Trade-off: storage lebih besar. Kalau tabel membengkak, bisa diganti simpan diff saja atau partisi per bulan + retensi.

`STATUS` dipisah dari `UPDATE` karena aksi status (approve/ship/cancel) punya makna bisnis sendiri; filter "Aksi status" di viewer langsung menampilkan semua aksi workflow.

### Mekanisme: interceptor global + registry route

Pilihan yang ditimbang:

1. **Panggil `auditService.log()` manual di tiap service** → paling eksplisit, tapi harus edit semua modul (bentrok dengan branch lain yang lagi ngerjain inventory/invoicing/PO/SO) dan gampang lupa.
2. **Dekorator `@Audit('product')` di tiap controller** → rapi, tapi tetap harus sentuh semua controller.
3. **Prisma client extension** (`$extends` query hook) → menangkap semua write di level DB, tapi `PrismaService` di sini `extends PrismaClient` (extension mengembalikan client baru, jadi harus refactor `PrismaService`), tidak tahu siapa user-nya tanpa AsyncLocalStorage, dan ikut mencatat write internal (stok, refresh token) yang bikin noise.
4. **Interceptor global (`APP_INTERCEPTOR`) + registry** ✅ dipilih.

Cara kerjanya (`src/audit/audit.interceptor.ts`), mirip AOP `@Around` di Spring:

1. Hanya `POST/PUT/PATCH/DELETE`. Pola route dibaca dari metadata Nest (`@Controller` + `@Post(':id/approve')`), bukan URL asli, jadi `:id` tetap terbaca sebagai param.
2. `resolveAuditTarget()` (fungsi murni, gampang dites) memetakan pola route → aksi:
   - `POST /res` → CREATE
   - `PATCH|PUT /res/:id` → UPDATE, `DELETE /res/:id` → DELETE
   - `POST /res/:id/<aksi>` → STATUS (operation = aksi)
   - `POST /res/:id/payments` → CREATE payment, `DELETE /res/:id/payments/:paymentId` → DELETE payment
3. Resource → entity diambil dari `AUDITED_RESOURCES` (`src/audit/audit-targets.ts`), **atau** dari dekorator `@Audit(...)` kalau ada (dekorator menang). `UsersController` pakai `@Audit('user')` sebagai contoh; modul lain cukup lewat registry, jadi **file modul lain tidak disentuh sama sekali**.
4. Sebelum handler: ambil snapshot `before` via `prisma[model].findUnique({ id })`.
5. Handler sukses: ambil ulang `after` dari DB (bentuknya sama dengan `before` sehingga diff bersih; response body kadang berisi relasi/field turunan). Untuk CREATE payment, `after` = payment terbaru milik invoice tsb. Kalau handler error → tidak dicatat (data tidak berubah).
6. Tulis log **fire-and-forget** (tidak menunda response). Error saat tulis audit hanya di-log, request tetap sukses.

Trade-off yang disadari:

- Audit **tidak satu transaksi** dengan perubahan datanya. Kalau proses mati tepat setelah commit, log bisa hilang. Untuk ERP beneran yang butuh audit wajib (compliance), pakai pola outbox / tulis audit di dalam `$transaction` yang sama. Untuk MVP, best-effort + tidak menambah latensi lebih penting.
- Snapshot `before` = 1 query ekstra per mutasi, `after` = 1 query lagi. Murah untuk skala ini.
- Aksi yang tidak mengikuti konvensi route (mis. `POST /inventory/adjustments`) tidak tercatat otomatis. Tinggal tambah `@Audit(...)` atau entry registry kalau dibutuhkan. `@SkipAudit()` untuk mematikan per method.
- Mutasi yang terjadi sebagai efek samping (stok berubah saat PO receive, status invoice saat payment) tidak dicatat terpisah; yang tercatat aksi user-nya (`receive`, payment CREATE). Kartu stok sendiri sudah jadi audit trail untuk stok.

### Data rahasia

`sanitizeForAudit()` membuang key yang cocok `/password|token|secret|hash/i` secara rekursif sebelum disimpan (jadi `passwordHash`, `tokenHash`, `refreshToken` tidak pernah masuk DB audit). Request body juga **tidak** disimpan; yang disimpan snapshot baris DB yang sudah disanitasi. Reset password tercatat sebagai `STATUS reset-password` tanpa isi password.

### API & viewer

- `GET /api/audit-logs?entity=&entityId=&userId=&action=&from=YYYY-MM-DD&to=YYYY-MM-DD&search=&page=&limit=` (ADMIN). Tanggal = hari kalender WIB, inklusif (sama seperti laporan). `search` cari di nama/email user, entity id, operation.
- `GET /api/audit-logs/entities` → daftar entity untuk dropdown.
- `GET /api/audit-logs/:id`.
- Tidak ada endpoint ubah/hapus: audit log append-only.
- Halaman `/audit-logs` (menu Pengaturan → Audit Log): filter entity/user/aksi/tanggal, pagination server-side, klik baris untuk expand tabel sebelum/sesudah ("Hanya yang berubah" default aktif). Dari halaman User ada tombol riwayat yang membuka `/audit-logs?entity=user&entityId=...`. Tabelnya komponen sendiri (bukan `DataTable`) karena butuh baris detail yang bisa di-expand; `DataTable` sengaja tidak diubah supaya tidak bentrok dengan modul lain.

### Nambah entity baru ke audit

- Route ikut konvensi CONTRIBUTING → tambah satu baris di `AUDITED_RESOURCES`, **atau** pasang `@Audit('namaModel')` di controller.
- Tambah label di `frontend/src/features/audit/types.ts` (`ENTITY_LABEL`, `OPERATION_LABEL`). Tanpa label tetap tampil pakai nama mentahnya.
