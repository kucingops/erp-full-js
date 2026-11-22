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

Saran untuk thread invoicing:

- Tambahkan kolom yang sama ke `invoices` (dan `payments`): `currency_code VARCHAR(3) DEFAULT 'IDR'` FK ke `currencies(code)`, `exchange_rate DECIMAL(18,6) DEFAULT 1`, `amount_base`/`total_amount_base DECIMAL(15,2)`.
- Invoice **mewarisi mata uang PO/SO** asal (jangan beda mata uang antara order dan invoice-nya). Kurs boleh pakai kurs tanggal invoice (`snapshot({ requested: so.currencyCode, date: invoiceDate })`) atau copy `so.exchangeRate` — pilih satu dan dokumentasikan. Selisih kurs (realized FX gain/loss) di luar scope MVP.
- Payment dicatat dalam mata uang invoice; sisa tagihan dibandingkan dalam mata uang invoice, bukan IDR.
- Laporan/aging: jumlahkan kolom `*_base`.
- Unit test: pakai `new CurrenciesService(prismaMock)` asli di atas Prisma mock (lihat `purchase-orders.service.spec.ts`), cukup mock `currency.findUnique` dan `exchangeRate.findFirst`.

## Frontend

- Halaman `/currencies`: master mata uang + histori kurs (semua role lihat, ADMIN tulis).
- `features/currencies/components.tsx`: `CurrencySelect`, `DocCurrencyFields` (mata uang + kurs + preview kurs otomatis), `MoneyWithBase`, `useEffectiveRate`. Pakai komponen ini di form invoice supaya seragam.
- `formatMoney(value, code)` di `features/currencies/format.ts` menggantikan `formatIDR` untuk nominal dokumen.
