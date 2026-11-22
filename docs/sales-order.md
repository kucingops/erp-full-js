# Sales Order (SO)

## Alur status

```
DRAFT ──confirm──▶ CONFIRMED ──ship──▶ SHIPPED   (stok keluar dari gudang SO)
  └────────cancel─────┴──▶ CANCELLED
```

| Aksi | Endpoint | Role |
| --- | --- | --- |
| list / detail | `GET /api/sales-orders`, `GET /api/sales-orders/:id` | SALES, WAREHOUSE |
| buat / edit / hapus (DRAFT saja) | `POST /`, `PATCH /:id`, `DELETE /:id` | SALES |
| konfirmasi | `POST /:id/confirm` | SALES |
| kirim barang | `POST /:id/ship` | WAREHOUSE |
| batalkan (DRAFT/CONFIRMED) | `POST /:id/cancel` | SALES |

List bisa difilter `?status=CONFIRMED&customerId=...&search=SO-2026`.

## Keputusan desain

1. **Cek stok dua lapis.**
   - Saat `confirm`: cek awal pakai `InventoryService.getQuantity`. Kalau kurang, ditolak 400 dengan daftar SEMUA produk yang kurang (`KOPI-01 (diminta 5, tersedia 1); ...`), jadi sales langsung tahu.
   - Saat `ship`: cek final di `InventoryService.issue` (decrement bersyarat di DB). Kalau stok sudah habis duluan dipakai SO lain, lempar `InsufficientStockException` dan seluruh transaksi rollback (status tetap CONFIRMED).
2. **Confirm tidak me-reserve stok (MVP).** Dua SO bisa sama-sama confirmed untuk stok yang sama; yang ship duluan menang. Upgrade berikutnya: kolom `reserved` di `stocks` atau tabel reservasi.
3. **Transisi status atomik** pakai `updateMany` + cek `count` (sama dengan PO).
4. **Ship = satu transaksi**: update status + `issue` per item di `$transaction` yang sama.
5. **Uang pakai `Prisma.Decimal`**, nomor `SO-YYYYMMDD-XXXX` dengan retry kalau bentrok, edit item = ganti semua, hapus hanya DRAFT (sama dengan PO, lihat `docs/purchase-order.md`).

## Frontend

- `/sales-orders` list + filter status, `/sales-orders/new`, `/sales-orders/[id]` (detail + tombol aksi sesuai status & role), `/sales-orders/[id]/edit`.
- Harga jual default diisi dari `salePrice` produk saat produk dipilih.
