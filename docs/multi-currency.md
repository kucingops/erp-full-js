# Multi-currency

Ringkasnya: setiap dokumen (PO/SO, nanti invoice) boleh pakai mata uang apa saja, tapi **semua laporan & dashboard dihitung di base currency IDR**. Caranya: kurs di-*snapshot* ke dokumen, lalu total dikonversi ke IDR dan disimpan di kolom terpisah.

## Data model

| Tabel / kolom | Isi |
| --- | --- |
| `currencies` | Master mata uang (kode ISO 4217 3 huruf, nama, simbol, digit desimal, aktif). IDR wajib ada (dibuat oleh migrasi). |
| `exchange_rates` | Kurs harian: `1 unit currency_code = rate IDR`, unik per `(currency_code, effective_date)`. |
| `suppliers.currency_code`, `customers.currency_code` | Mata uang default saat bikin PO/SO. `null` = IDR. |
| `purchase_orders` / `sales_orders` `.currency_code` | Mata uang dokumen, default `'IDR'`. |
| `... .exchange_rate` | Snapshot kurs dokumen (`Decimal(18,6)`), default `1`. |
| `... .total_amount_base` | `total_amount * exchange_rate`, dibulatkan 2 desimal HALF_UP. Ini yang dijumlah dashboard/laporan. |

Semua perubahan ke PO/SO **additive** (kolom baru ber-default + migrasi `*_multi_currency` yang mengisi `total_amount_base = total_amount` untuk data lama). Item PO/SO (`unit_price`, `subtotal`) tetap dalam mata uang dokumen.

## Aturan

1. **Pilih mata uang**: `currencyCode` di request → default customer/supplier → `IDR`.
2. **Pilih kurs**: `exchangeRate` di request (kurs manual, misal kurs bank yang disepakati) → kurs dari tabel dengan `effective_date <= tanggal order` (tanggal WIB) yang paling baru → kalau tidak ada: **400** "Belum ada kurs ...".
3. IDR selalu kurs `1` (override diabaikan, tidak ada baris di `exchange_rates`).
4. **Kurs terkunci setelah DRAFT.** Selama DRAFT, edit yang mengganti mata uang/tanggal/kurs menghitung ulang snapshot; edit item saja tetap pakai kurs lama. Approve/confirm/receive/ship tidak menyentuh kurs.
5. Mengubah/menghapus kurs di master **tidak** mengubah dokumen lama (karena snapshot).
6. Mata uang yang sudah dipakai dokumen tidak bisa dihapus (FK Restrict → 409); nonaktifkan saja. IDR tidak bisa dihapus/dinonaktifkan.

## API

- `GET/POST/PATCH/DELETE /api/currencies` — baca semua role, tulis ADMIN. List menyertakan `isBase` dan `latestRate`.
- `GET /api/exchange-rates?currencyCode=USD` — histori kurs.
- `POST /api/exchange-rates` — upsert per `(currencyCode, effectiveDate)`. ADMIN.
- `GET /api/exchange-rates/convert?amount=100&from=USD&to=SGD&date=2026-11-22` — konversi silang lewat IDR.
- PO/SO create/update menerima `currencyCode?` dan `exchangeRate?`; response menyertakan `currencyCode`, `exchangeRate`, `totalAmountBase`.

## Pakai dari modul lain (invoicing, laporan)

Import dari public API modul: `import { CurrenciesModule, CurrenciesService, toBase } from '../currencies/index.js'`.

```ts
// di service invoice, dalam transaksi yang sama
const currency = await this.currencies.snapshot(
  { requested: so.currencyCode, date: invoiceDate /*, override: dto.exchangeRate */ },
  tx,
);
await tx.invoice.create({
  data: {
    ...,
    totalAmount: total,
    ...currency,                                   // currencyCode + exchangeRate
    totalAmountBase: toBase(total, currency.exchangeRate),
  },
});
```

## Invoicing (AR/AP)

Migrasi `*_invoice_multi_currency` (additive + backfill dari order asal):

| Kolom | Isi |
| --- | --- |
| `invoices.currency_code` | Selalu = mata uang SO/PO asal. FK ke `currencies(code)`. |
| `invoices.exchange_rate` | **Default = kurs SO/PO asal** (copy, bukan kurs tanggal invoice). Bisa di-override `exchangeRate` saat buat invoice. IDR selalu 1. |
| `invoices.total_amount_base` | `toBase(total_amount, exchange_rate)` |
| `payments.exchange_rate` | Kurs saat bayar, default = kurs invoice, bisa di-override. |
| `payments.amount_base` | `toBase(amount, exchange_rate)` |

Kenapa copy kurs order, bukan `snapshot()` per tanggal invoice? Invoice adalah realisasi order yang nilainya sudah disepakati; menagih order lama tidak boleh gagal hanya karena kurs tanggal invoice belum diinput atau mata uangnya sudah dinonaktifkan (`snapshot()` melempar 400 di dua kasus itu). Kalau perlu kurs hari ini, isi `exchangeRate` manual.

Aturan hitung:

- `amount`, `paidAmount`, sisa tagihan, dan validasi "tidak melebihi sisa" tetap dalam **mata uang invoice**.
- Sisa dalam IDR (`outstandingAmountBase`, summary, aging, top partner) = sisa x **kurs invoice** (nilai buku). Kurs pembayaran hanya dicatat di `payments.amount_base`; selisihnya (realized FX gain/loss) belum dibukukan, jadi invoice lunas selalu sisa IDR 0.
- `GET /summary` semua angka IDR + `byCurrency` (sisa per mata uang asli + IDR-nya). List bisa difilter `?currencyCode=USD`.

## Laporan penjualan/pembelian

- Kolom `total` = **IDR**, dihitung dari `total_amount_base` header. Untuk grouping per produk, subtotal item dibagi proporsional: `subtotal / total_amount x total_amount_base`, jadi jumlah semua item satu dokumen persis = `total_amount_base` (angka sama dengan dashboard, tanpa selisih pembulatan per item).
- `totalDoc` = jumlah dalam mata uang dokumen. Hanya ditampilkan/diekspor kalau `docCurrency` tidak null: semua dokumen di hasil laporan satu mata uang asing, atau difilter `?currencyCode=USD`.
- `currencies` = rincian per mata uang (jumlah dokumen, total asli, total IDR). Di export, rinciannya ditulis di subtitle (judul XLSX).

## Unit test

Pakai `new CurrenciesService(prismaMock)` asli di atas Prisma mock (lihat `purchase-orders.service.spec.ts`), cukup mock `currency.findUnique` dan `exchangeRate.findFirst`. Invoicing tidak butuh `CurrenciesService` (kurs di-copy dari order), cukup `toBase`.

## Frontend

- Halaman `/currencies`: master mata uang + histori kurs (semua role lihat, ADMIN tulis).
- `features/currencies/components.tsx`: `CurrencySelect`, `DocCurrencyFields` (mata uang + kurs + preview kurs otomatis), `MoneyWithBase`, `useEffectiveRate`. Dipakai juga di list/detail invoice, dialog buat invoice & catat pembayaran (input kurs opsional hanya muncul untuk mata uang asing).
- `formatMoney(value, code)` di `features/currencies/format.ts` menggantikan `formatIDR` untuk nominal dokumen.
