# Modul Inventory

## InventoryService: kontrak untuk modul lain

Stok **hanya** berubah lewat `InventoryService` (`backend/src/inventory`). Import dari `src/inventory/index.js`:

```ts
import { InventoryModule, InventoryService, InsufficientStockException } from '../inventory/index.js';
```

| Method | Dipakai oleh | Efek |
| --- | --- | --- |
| `receive(tx, { productId, warehouseId, quantity, referenceType, referenceId?, note?, createdById? })` | PO receive | +qty, movement `IN` |
| `issue(tx, { ...sama })` | SO ship | -qty, movement `OUT`, lempar `InsufficientStockException` (HTTP 400) kalau kurang |
| `adjust(tx, { productId, warehouseId, quantity: ±n, note, createdById? })` | adjustment manual | ±qty, movement `ADJUSTMENT` |
| `getQuantity(productId, warehouseId, tx?)` | cek awal (read-only) | saldo saat ini, 0 kalau belum ada |

- `tx` = `Prisma.TransactionClient` dari `prisma.$transaction(async (tx) => ...)`. Pemanggil yang pegang transaksi, jadi update status dokumen + perubahan stok semua item **commit/rollback bareng**. Satu item gagal ⇒ seluruh SO ship batal.
- `quantity` di `receive`/`issue` selalu positif; arah ditentukan method. Di kartu stok, `quantity` disimpan bertanda (+ masuk, − keluar).
- Baris `stocks` dibuat otomatis saat barang pertama kali masuk.

## Keputusan desain

1. **Pemanggil yang memegang transaksi (bukan service).** Mirip propagation `REQUIRED` di Spring `@Transactional`: service ikut transaksi yang sudah ada. Alternatifnya service bikin transaksi sendiri, tapi itu tidak bisa digabung dengan update status PO/SO secara atomik.
2. **Anti race condition tanpa lock manual.** Pengurangan stok pakai satu statement bersyarat `UPDATE stocks SET quantity = quantity - n WHERE ... AND quantity >= n RETURNING quantity` (`updateManyAndReturn`). Kalau 0 baris ter-update ⇒ stok kurang. Penambahan pakai `upsert` + `increment` atomik. Tidak perlu `SELECT ... FOR UPDATE`.
3. **Stok tidak boleh negatif**, termasuk lewat adjustment.
4. **`balanceAfter` disimpan di tiap movement** supaya kartu stok bisa ditampilkan tanpa menghitung running total.
5. **Adjustment pakai selisih (delta), bukan "set ke angka X".** FE bisa menghitung delta dari hasil hitung fisik (stock opname), tapi backend tetap simpan selisihnya sehingga histori jelas.
