# Modul Reports

Read-only. Bergantung pada PR #1–#6 (inventory, dashboard, master data, PO, SO).

## Endpoint
| Laporan | JSON | Export | Role |
| --- | --- | --- | --- |
| Penjualan | `GET /api/reports/sales` | `/sales/export?format=csv\|xlsx` | SALES |
| Pembelian | `GET /api/reports/purchases` | `/purchases/export` | PURCHASING |
| Nilai stok | `GET /api/reports/stock-valuation` | `/stock-valuation/export` | WAREHOUSE, SALES, PURCHASING |
| Mutasi stok | `GET /api/reports/stock-movements` | `/stock-movements/export` | WAREHOUSE, SALES, PURCHASING |

Filter: `from`, `to` (YYYY-MM-DD, WIB, inklusif; default awal bulan s/d hari ini, maks 3 tahun), `groupBy=day|month|partner|product`, `customerId`/`supplierId`, `productId`, `warehouseId`, `status`, `categoryId`, `search`.

## Keputusan
- **Role per pemilik data**: angka uang per customer/supplier hanya untuk departemennya (beda dengan dashboard yang menampilkan agregat ke WAREHOUSE juga). ADMIN selalu lolos.
- **Agregasi di DB** pakai `$queryRaw` (group by tanggal WIB, `FILTER`). Input user selalu jadi parameter; identifier tabel dari konstanta `order-report-source.ts`.
- **Penjualan & pembelian satu query builder** dikonfigurasi `OrderReportSource` (mirip Strategy/Template Method di Java).
- Status default: SO `CONFIRMED`/`SHIPPED`, PO `APPROVED`/`RECEIVED` (sama dengan dashboard). Total dihitung dari item (`SUM(subtotal)`) supaya filter produk konsisten; total keseluruhan query terpisah karena `COUNT(DISTINCT order)` tidak bisa dijumlah per produk.
- **Nilai stok = qty x `cost_price` produk** (standard cost), saat ini saja (belum "as of" tanggal).
- **Mutasi stok** dari kartu stok append-only: saldo awal = SUM movement sebelum periode.
- **Export**: tabel netral `ReportTable` → `ReportExporter` (CSV dengan BOM + anti formula-injection, XLSX via `exceljs`). Tambah format/laporan tidak saling menyentuh (Open/Closed).

## Frontend
- Menu "Laporan" (`/reports`) memakai gabungan role semua laporan; tiap tab dicek lagi per role (`ReportGate`, `canSeeReport`) karena AuthGuard hanya cek per menu.
- Penjualan & pembelian satu komponen `OrderReportView` yang dikonfigurasi props (komposisi), stok punya `useStockFilters` bersama.
- Laporan sudah teragregasi, jadi tidak dipaginasi: tabel biasa + baris total, bukan `DataTable` server-side.
- Download lewat `apiBlob()` (baru di `lib/api.ts`, berbagi logika token/refresh dengan `api()`); nama file dibuat di FE karena `Content-Disposition` tidak terbaca lintas origin.
