# Transfer Stok & Stock Opname

Modul `StockOpsModule` (`backend/src/stock-ops`) isinya dua dokumen gudang yang dua-duanya **cuma numpang** di atas `InventoryService`. Modul ini nggak pernah nyentuh tabel `stocks` langsung: semua perubahan stok lewat `issue` / `receive` / `adjust` di dalam `$transaction`, jadi saldo + kartu stok selalu sinkron (lihat `docs/inventory.md`).

Schema ada di file sendiri `prisma/schema/stock-ops.prisma`. Perubahan ke file lain cuma **additive**: 2 nilai enum baru di `StockReferenceType` (`STOCK_TRANSFER`, `STOCK_OPNAME`) + back-relation di `User`, `Product`, `Warehouse`. Migrasi: `20261122214559_stock_transfer_opname`.

## Endpoint

Semua endpoint: role **WAREHOUSE** (baca & tulis). ADMIN selalu lolos.

| Method | Path | Keterangan |
| --- | --- | --- |
| GET | `/api/stock-transfers` | List. Filter `status`, `warehouseId` (asal **atau** tujuan), `search` (nomor). |
| GET | `/api/stock-transfers/:id` | Detail + item. |
| POST | `/api/stock-transfers` | Buat DRAFT `{ fromWarehouseId, toWarehouseId, transferDate?, notes?, items: [{ productId, quantity }] }` |
| PATCH | `/api/stock-transfers/:id` | Edit DRAFT (kalau `items` dikirim, semua item diganti). |
| DELETE | `/api/stock-transfers/:id` | Hapus DRAFT. |
| POST | `/api/stock-transfers/:id/send` | DRAFT → SENT, stok keluar dari gudang asal. |
| POST | `/api/stock-transfers/:id/receive` | SENT → RECEIVED, stok masuk gudang tujuan. Body opsional `{ items: [{ productId, receivedQuantity }] }`. |
| POST | `/api/stock-transfers/:id/cancel` | DRAFT/SENT → CANCELLED. |
| GET | `/api/stock-opnames` | List. Filter `status`, `warehouseId`, `search`. |
| GET | `/api/stock-opnames/:id` | Detail + lembar hitung. Selama DRAFT tiap baris punya `currentQty` (saldo sekarang). |
| POST | `/api/stock-opnames` | Buat + snapshot `{ warehouseId, productIds?, categoryId?, notes? }` |
| PATCH | `/api/stock-opnames/:id` | Isi hitungan `{ notes?, lines: [{ productId, countedQty \| null }] }` (DRAFT). |
| POST | `/api/stock-opnames/:id/post` | DRAFT → POSTED, selisih dibukukan. |
| POST | `/api/stock-opnames/:id/cancel` | DRAFT → CANCELLED. |

Nomor dokumen: `TRF-YYYYMMDD-XXXX` dan `OPN-YYYYMMDD-XXXX` (helper `createWithDocNumber` di `stock-ops.utils.ts`, retry kalau nomor bentrok, sama kayak PO/SO).

## Transfer stok

```
DRAFT ──send──▶ SENT ──receive──▶ RECEIVED
  │               │
  └──cancel──▶ CANCELLED ◀──cancel──┘
```

Keputusan desain:

1. **Dua langkah (send lalu receive), bukan satu langkah "pindah".** Di dunia nyata barang butuh waktu di jalan. Selama SENT barang sudah keluar dari gudang asal tapi belum masuk gudang tujuan, jadi nggak bisa kejual dobel dari dua gudang. Trade-off: total stok semua gudang "turun" sementara selama SENT. Kalau perlu laporan barang di jalan, tinggal query transfer berstatus SENT.
2. **Movement IN/OUT biasa, referensi `STOCK_TRANSFER`.** Nggak bikin tipe movement baru (`TRANSFER_IN/OUT`), cukup `referenceType = STOCK_TRANSFER` + `referenceId = id transfer`. Jadi laporan/kartu stok yang sudah ada tetap jalan, dan modul lain (mis. accounting) bisa bedain sumbernya dari `referenceType`.
3. **Stok kurang saat send ⇒ ditolak.** `InventoryService.issue` lempar `InsufficientStockException` (400). Karena satu `$transaction`, status balik ke DRAFT dan item yang sudah sempat dikurangi ikut rollback.
4. **Receive sebagian (opsional).** `receivedQuantity` per item boleh 0..qty kirim, default = qty kirim. Kekurangannya dianggap **hilang/rusak di jalan**: nggak dikembalikan ke gudang asal, cukup kelihatan di dokumen (kolom selisih) dan di catatan movement (`kurang n dari kiriman`). Kenapa nggak otomatis balik ke asal? Karena barangnya memang nggak ada di asal; kalau ternyata ketemu, bikin transfer/adjustment baru biar jejaknya jujur. Qty diterima > qty kirim ditolak (kelebihan = salah kirim, harus dokumen lain).
5. **Cancel dari SENT = stok balik ke gudang asal.** Ini yang dipilih karena paling masuk akal buat kasus "truk batal berangkat / barang dikembalikan". Implementasinya movement **IN** di gudang asal dengan referensi transfer yang sama, jadi kartu stok asal terbaca `-n (kirim)` lalu `+n (batal)`. Kartu stok tetap append-only, nggak ada movement yang dihapus. RECEIVED **nggak bisa** di-cancel: koreksinya bikin transfer balik (B → A).
6. **Cancel pakai status yang barusan dibaca sebagai syarat transisi.** `cancel` baca status (DRAFT/SENT), lalu `updateMany where status = <yang dibaca>`. Kalau di sela itu transfer keburu di-receive, update dapat 0 baris ⇒ 400, jadi nggak mungkin "cancel + balikin stok" untuk transfer yang sudah diterima.
7. **Siapa yang kirim/terima nggak disimpan di header.** Sudah tercatat di `created_by` tiap stock movement. Header cuma simpan `sentAt` / `receivedAt` / `cancelledAt`. Lebih sedikit relasi ke `User` = lebih sedikit konflik schema dengan modul lain.
8. Gudang asal ≠ tujuan, dua-duanya harus aktif (dicek lagi saat send). Produk harus aktif dan nggak boleh dobel (`@@unique([stockTransferId, productId])`).

## Stock opname

```
DRAFT ──post──▶ POSTED
  └──cancel──▶ CANCELLED
```

Alur: buat opname (snapshot) → cetak/isi lembar hitung → simpan hitungan (boleh berkali-kali) → post.

Keputusan desain:

1. **Snapshot saat create.** `systemQty` tiap baris = saldo saat dokumen dibuat (`snapshotAt`). Cakupan: semua produk aktif, atau `categoryId`, atau `productIds` (irisan kalau dua-duanya dikirim). Produk yang belum punya baris `stocks` di gudang itu ikut dengan `systemQty = 0`, supaya barang "nyasar" yang ketemu pas hitung bisa dicatat.
2. **Transaksi setelah snapshot: yang dibukukan adalah DELTA, bukan "set ke angka hitungan".**
   Aturan cut-off: hitung fisik dianggap terjadi **tepat saat snapshot**. Saat post:
   - `variance = countedQty − systemQty (snapshot)`
   - movement `ADJUSTMENT` sebesar `variance` diterapkan ke **saldo saat ini**.

   Contoh: snapshot 10, hitung 8 (variance −2). Setelah snapshot ada PO receive +5 ⇒ saldo 15. Saat post saldo jadi **13**, bukan 8. Kalau pakai "set ke 8", PO receive +5 tadi jadi hilang dua kali (sudah tidak terhitung di lembar, lalu tertimpa). Alternatif lain yang sering dipakai ERP: **freeze gudang** selama opname (blok semua transaksi). Lebih akurat tapi bikin operasional berhenti, kebesaran buat MVP.
   - FE kasih peringatan kalau `currentQty ≠ systemQty` (ada transaksi setelah snapshot), biar staf sadar. Saat post, saldo tepat sebelum adjustment disimpan di `qtyAtPost` untuk audit.
   - **Re-check saat post:** kalau variance negatif lebih besar dari saldo sekarang (mis. barang keburu dijual setelah snapshot), `InventoryService.adjust` menolak (stok nggak boleh negatif) dan seluruh post rollback. Solusinya: cancel opname lalu bikin ulang (snapshot baru).
3. **Semua baris wajib dihitung sebelum post.** Baris kosong (`countedQty = null`) bikin post ditolak. Sengaja ketat: "lupa hitung" beda dengan "hitungannya 0". Biar nggak capek, FE punya tombol **"Isi kosong = sistem"**.
4. **Satu opname DRAFT per gudang.** Dua lembar hitung paralel di gudang yang sama bisa membukukan selisih yang sama dua kali. Dicek di service (409). Belum pakai partial unique index karena Prisma belum bisa mendefinisikannya di schema (bakal dianggap drift).
5. **Adjustment dengan referensi dokumen.** Supaya kartu stok bisa nunjuk ke opname, `InventoryService.adjust` sekarang menerima `referenceType` / `referenceId` opsional (default tetap `ADJUSTMENT`, perilaku lama tidak berubah). Ini satu-satunya perubahan di file inventory (`inventory.types.ts` + satu baris di `inventory.service.ts`). Tipe movement tetap `ADJUSTMENT`.
6. **Variance 0 nggak bikin movement**, tapi tetap disimpan di baris (`variance = 0`) sebagai bukti sudah dihitung.
7. **Nggak ada DELETE.** Opname yang nggak jadi di-cancel aja, jejaknya tetap ada. POSTED nggak bisa di-cancel (stok sudah berubah); koreksinya opname baru atau adjustment manual.

## OOP / pola yang dipakai (buat bahan interview)

- **State machine + optimistic check** (`updateMany where status in [...]`), sama kayak PO/SO. Mirip `@Version`/optimistic locking di JPA tapi per status.
- **Composition over inheritance**: `StockTransfersService` & `StockOpnamesService` nggak extend apa-apa, mereka **inject** `InventoryService` (DI constructor, mirip `@Autowired` constructor injection di Spring). Aturan stok ada di satu kelas saja (single responsibility).
- **Transaksi dipegang pemanggil** (propagation `REQUIRED` versi manual): `tx` dioper ke `InventoryService`, jadi update status dokumen + semua movement commit/rollback bareng.
- Helper murni `createWithDocNumber` (higher-order function, terima callback `findLast` & `create`), gampang dites dan dipakai dua service tanpa base class.

## Tes

`stock-transfers.service.spec.ts` & `stock-opnames.service.spec.ts` (Prisma + InventoryService di-mock). Mock `updateMany` mensimulasikan status di DB, jadi transisi ilegal (send dua kali, receive dari DRAFT, cancel RECEIVED, post dua kali) benar-benar dites. Ada juga kasus stok kurang saat send, receive sebagian, cancel dari SENT balikin stok ke asal, variance cuma untuk selisih ≠ 0, dan delta tetap diterapkan walau saldo sudah bergerak setelah snapshot.

## Frontend

- `/stock-transfers` (list, filter gudang & status), `/stock-transfers/new` (form draft), `/stock-transfers/[id]` (detail + tombol Kirim / Terima / Batalkan / Hapus; saat SENT ada input qty diterima per item).
- `/stock-opnames` (list + dialog "Buat opname": gudang + semua produk / per kategori), `/stock-opnames/[id]` (lembar hitung: input hitung fisik, selisih live, peringatan transaksi setelah snapshot, tombol Isi kosong = sistem / Simpan / Posting / Batalkan).
- Kode di `frontend/src/features/stock-ops/`. Label referensi kartu stok ditambah di `features/inventory/types.ts`.
- Belum ada: halaman edit draft transfer (draft bisa dihapus lalu dibuat ulang; API `PATCH` sudah ada), pilih produk satu-satu di dialog opname (API `productIds` sudah ada), cetak lembar hitung.
