# Purchase Order (PO)

## Alur status

```
DRAFT ──approve──▶ APPROVED ──receive──▶ RECEIVED   (stok masuk ke gudang PO)
  └────────cancel─────┴──▶ CANCELLED
```

| Aksi | Endpoint | Role |
| --- | --- | --- |
| list / detail | `GET /api/purchase-orders`, `GET /api/purchase-orders/:id` | PURCHASING, WAREHOUSE |
| buat / edit / hapus (DRAFT saja) | `POST /`, `PATCH /:id`, `DELETE /:id` | PURCHASING |
| setujui | `POST /:id/approve` | PURCHASING |
| terima barang | `POST /:id/receive` | WAREHOUSE |
| batalkan (DRAFT/APPROVED) | `POST /:id/cancel` | PURCHASING |

List bisa difilter `?status=DRAFT&supplierId=...&search=PO-2026`.

## Keputusan desain

1. **Transisi status atomik.** Pakai `updateMany({ where: { id, status: { in: [asal] } } })` lalu cek `count`. Dua request `receive` barengan tidak bisa sama-sama lolos (mirip optimistic locking / `@Version` di JPA, tapi tanpa kolom versi).
2. **Receive = satu transaksi.** Update status + `InventoryService.receive(tx, ...)` per item jalan di `prisma.$transaction` yang sama. Kalau satu item gagal, status PO ikut rollback.
3. **Uang pakai `Prisma.Decimal`.** Subtotal & total dihitung di backend (FE hanya preview), supaya tidak kena error floating point (`0.1 + 0.2`).
4. **Nomor `PO-YYYYMMDD-XXXX`.** Ambil nomor terakhir hari itu lalu +1 (`common/utils/doc-number.ts`). Kalau bentrok karena request bersamaan (unique violation P2002), create di-retry maksimal 3 kali.
5. **Edit item = ganti semua.** `PATCH` dengan `items` menghapus item lama dan membuat ulang. Lebih simpel daripada diff per baris, aman karena hanya boleh saat DRAFT.
6. **Hapus hanya DRAFT.** Dokumen yang sudah diproses dibatalkan (cancel), bukan dihapus, supaya jejak audit tetap ada.
7. **Penerimaan parsial belum didukung (MVP).** `receive` menerima semua item sekaligus. Upgrade berikutnya: tabel `goods_receipts` + kolom `receivedQty` per item.

## Frontend

- `/purchase-orders` list + filter status, `/purchase-orders/new`, `/purchase-orders/[id]` (detail + tombol aksi sesuai status & role), `/purchase-orders/[id]/edit`.
- Harga beli default diisi dari `costPrice` produk saat produk dipilih.
- Dengan `cacheComponents`, route dinamik `[id]` butuh shell dashboard di dalam `<Suspense>` (lihat `app/(dashboard)/layout.tsx`).
