# Invoicing & Pembayaran (AR / AP)

## Alur

```
SO SHIPPED  ──buat invoice──▶ INV-YYYYMMDD-XXXX (piutang / AR)
PO RECEIVED ──buat tagihan──▶ BILL-YYYYMMDD-XXXX (hutang / AP)

UNPAID ──bayar sebagian──▶ PARTIAL ──bayar sisa──▶ PAID
   ▲                          │
   └──── hapus pembayaran ────┘   (status dihitung ulang dari paidAmount)
```

| Aksi | Endpoint (`/api/sales-invoices` atau `/api/purchase-bills`) | Role |
| --- | --- | --- |
| list (`?status=`, `?outstanding=true`, `?overdue=true`, `?partnerId=`, `?search=`) | `GET /` | SALES (AR) / PURCHASING (AP) |
| ringkasan outstanding + aging + top partner | `GET /summary` | sama |
| order yang siap ditagih (belum punya invoice) | `GET /candidates` | sama |
| detail (+ pembayaran + item order) | `GET /:id` | sama |
| buat dari order (`orderId`, `issueDate?`, `dueDate?`, `termDays?` default 30) | `POST /` | sama |
| hapus (hanya kalau belum ada pembayaran) | `DELETE /:id` | sama |
| catat pembayaran (`amount`, `paidAt?`, `method`, `reference?`) | `POST /:id/payments` | sama |
| hapus pembayaran (koreksi salah input) | `DELETE /:id/payments/:paymentId` | sama |

ADMIN selalu lolos. Id invoice AP yang dibuka lewat endpoint AR (atau sebaliknya) → 404.

## Keputusan desain

1. **Satu tabel `invoices` untuk AR dan AP** (kolom `type`), satu tabel `payments`. Bentuk datanya sama persis; bedanya cuma relasi (SO+customer vs PO+supplier). CHECK constraint di SQL migrasi memastikan kombinasi kolomnya valid, karena Prisma belum bisa deklarasi CHECK. Alternatifnya dua tabel terpisah (`sales_invoices`, `purchase_bills`) + dua tabel payment: lebih "bersih" FK-nya, tapi kode jadi dobel.
2. **Strategy pattern (`InvoiceKind`)**: perbedaan AR/AP (prefix nomor, status order yang siap ditagih, kolom partner) dikumpulkan di `invoice-kind.ts`. `InvoicesService` cuma satu dan tidak penuh `if (type === ...)`. Di Java mirip `interface InvoiceKind` + dua implementasi.
3. **Controller pakai inheritance**: `InvoicesControllerBase` (abstract) berisi semua route; `SalesInvoicesController` / `PurchaseBillsController` cuma isi `type`, path, dan `@Roles` di level class. `RolesGuard` membaca metadata class milik subclass, jadi aman.
4. **Satu order = satu invoice, nilai = total order.** Unique index di `sales_order_id` / `purchase_order_id`. Tidak ada partial invoicing / item invoice sendiri (MVP); item ditampilkan dari order.
5. **Role tidak ditambah**: belum ada role FINANCE. AR dipegang SALES, AP dipegang PURCHASING. Kalau nanti ada role keuangan, cukup ganti `@Roles` di dua controller + `navigation.ts`.
6. **Pembayaran mengunci baris invoice** (`SELECT ... FOR UPDATE` di dalam `$transaction`), lalu cek `amount <= sisa` di JS pakai `Prisma.Decimal`. Dua pembayaran paralel yang totalnya melebihi sisa: yang kedua ditolak 400 (sudah dites ke Postgres). CHECK `paid_amount <= total_amount` jadi pengaman terakhir di DB.
7. **`status` disimpan, overdue dihitung.** `status` (UNPAID/PARTIAL/PAID) diturunkan dari `paidAmount` oleh fungsi murni `deriveStatus` setiap kali pembayaran berubah. "Lewat jatuh tempo" tidak disimpan (berubah tiap hari), dihitung dari `dueDate < hari ini (WIB)` dan dikirim sebagai field `isOverdue` + `outstandingAmount`.
8. **Tanggal**: `issueDate` / `dueDate` dari input `YYYY-MM-DD` disimpan sebagai UTC tengah malam; "hari ini" dihitung di WIB (`todayWib`). Jatuh tempo hari ini belum dihitung overdue.
9. **Hapus invoice hanya kalau belum ada pembayaran.** Kalau sudah, hapus pembayarannya dulu. Setelah invoice dihapus, order bisa ditagih ulang.
10. **Aging & summary dihitung di JS** dari invoice yang masih terbuka (cukup untuk skala mini ERP). Kalau datanya besar, pindah ke `$queryRaw` + `GROUP BY` seperti dashboard.

## Frontend

- Menu **Keuangan**: `/sales-invoices` (SALES) dan `/purchase-bills` (PURCHASING).
- Satu set komponen di `features/invoicing/` dipakai dua halaman lewat `InvoiceConfig` (`SALES_INVOICE` / `PURCHASE_BILL`). Server page detail mengirim `resource` (string), karena config berisi fungsi yang tidak bisa dikirim ke Client Component.
- List default filter "Belum lunas", urut jatuh tempo terdekat; di atasnya kartu total outstanding, aging, dan partner dengan sisa terbesar.
- Detail: progress terbayar, tabel pembayaran (bisa dihapus), item order, dialog "Catat pembayaran" (default = sisa tagihan, max divalidasi zod + backend).
