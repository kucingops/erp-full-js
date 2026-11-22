# Cetak PDF (invoice, tagihan supplier, PO, SO)

## Endpoint

| Dokumen | Endpoint | Role (= role baca dokumennya) |
| --- | --- | --- |
| Invoice penjualan (AR) | `GET /api/sales-invoices/:id/pdf` | SALES |
| Tagihan supplier (AP) | `GET /api/purchase-bills/:id/pdf` | PURCHASING |
| Purchase order | `GET /api/purchase-orders/:id/pdf` | PURCHASING, WAREHOUSE |
| Sales order | `GET /api/sales-orders/:id/pdf` | SALES, WAREHOUSE |

ADMIN selalu lolos. Response `application/pdf`, default `Content-Disposition: inline` (dibuka di viewer browser). Tambah `?download=1` (atau `true`) supaya jadi `attachment`. Nama file = nomor dokumen (`INV-20261123-0001.pdf`). Id tidak ada / tipe invoice salah (id AP dibuka lewat endpoint AR) → 404.

Isi dokumen: kop perusahaan (nama, alamat, telp/email, NPWP), judul + nomor + status, tanggal & referensi (no. SO/PO, gudang), blok partner, tabel item (produk + SKU, qty, satuan, harga satuan, subtotal), subtotal/PPN/total, kurs + setara IDR kalau mata uang asing, blok pembayaran untuk invoice/tagihan (status, sudah dibayar, sisa + sisa IDR, histori pembayaran), catatan, area tanda tangan, footer "Dicetak ... · Halaman x dari y". Watermark `DRAFT` / `DIBATALKAN` untuk PO/SO, `LUNAS` untuk invoice yang sudah lunas.

## Kop perusahaan (env)

Di `backend/.env` (lihat `.env.example`). Semua opsional, kosong = default contoh.

| Env | Default |
| --- | --- |
| `COMPANY_NAME` | PT Mini ERP Indonesia |
| `COMPANY_ADDRESS` | Jl. Contoh No. 1, Jakarta 10110 |
| `COMPANY_NPWP` | 00.000.000.0-000.000 |
| `COMPANY_PHONE`, `COMPANY_EMAIL` | (tidak ditampilkan) |
| `COMPANY_CITY` | Jakarta (dipakai di "Jakarta, 23 November 2026") |

## Keputusan desain

1. **Library: pdfmake (bukan headless Chrome, bukan pdfkit langsung).** pdfmake itu deklaratif: layout ditulis sebagai objek JSON (*document definition*), lalu dirender pakai PDFKit di belakangnya. Enaknya, builder layout bisa jadi **fungsi murni** yang gampang di-unit-test (cek struktur objek, tanpa parsing PDF). Headless Chrome (Puppeteer/Playwright) hasil HTML-nya lebih fleksibel tapi berat (download Chromium ratusan MB, proses terpisah, lambat start, ribet di Docker). pdfkit langsung = imperatif (`doc.text(x, y)`), harus hitung posisi & page break sendiri. Di Java analoginya: pdfmake ≈ JasperReports/iText dengan template, Chrome ≈ wkhtmltopdf/Flying Saucer.
2. **Font standar PDF (Helvetica), bukan file .ttf.** PDFKit punya 14 font standar bawaan, jadi tidak perlu bundling font ke repo/Docker image. Trade-off: hanya karakter WinAnsi (Latin). Cukup untuk Bahasa Indonesia; kalau nanti butuh aksara lain (misal nama customer pakai huruf Mandarin), ganti ke font TTF (Noto Sans) di `PdfRenderer`.
3. **Pipeline 4 langkah, tiap langkah terpisah:**
   `load (Prisma)` → `map ke PrintableDocument` → `buildDocDefinition()` (murni) → `PdfRenderer.render()`.
   - `PrintableDocument` = view model netral yang sama untuk 4 jenis dokumen (mirip DTO/bean report di Java). Builder tidak tahu apa-apa soal Prisma/entity, jadi satu builder dipakai untuk semua dokumen; perbedaan antar dokumen (judul, label tanggal, penanda tangan) diisi oleh mapper.
   - Uang di view model berupa **string** dari `Decimal.toString()` supaya presisi tidak hilang sebelum diformat.
   - `PdfRenderer` adapter tipis ke pdfmake, di-inject ke service, jadi di test bisa di-mock (mirip interface + implementasi di Spring).
4. **Satu modul `src/documents` dengan satu controller** yang meng-host route `/sales-invoices/:id/pdf`, `/purchase-orders/:id/pdf`, dst. Express membolehkan dua controller berbagi prefix, jadi controller invoicing/PO/SO **tidak diubah** (minim konflik dengan branch lain). `AppModule` cuma tambah satu import + satu baris.
5. **Baca langsung lewat Prisma (read-only), bukan lewat service modul lain.** Supaya modul ini tidak tergantung bentuk response API invoice/PO/SO (yang bisa berubah di branch lain) dan cukup ambil kolom yang dicetak. Yang di-reuse hanya fungsi murni `outstanding`, `outstandingBase`, `isOverdue` dari `invoicing/invoice-math.ts` supaya angka sisa & status overdue sama persis dengan layar detail.
6. **Role ditulis eksplisit per route** (`@Roles` di method), sama dengan role baca tiap dokumen di matriks CONTRIBUTING. Dites lewat metadata di `documents.service.spec.ts`.
7. **PPN = 0.** Schema belum punya kolom pajak (total dokumen = jumlah subtotal item), jadi baris PPN selalu 0 tapi sudah ada di layout. Kalau nanti ada kolom `tax_amount`, cukup isi `taxAmount` di mapper.
8. **Format id-ID + WIB.** Angka `1.234.567,50`, tanggal `23 November 2026` dengan `timeZone: 'Asia/Jakarta'` (sama aturan WIB di invoicing). Digit desimal ikut default Intl per mata uang (locale id-ID: IDR 0, USD 2) supaya konsisten dengan `formatMoney` di FE. Kurs ditampilkan sampai 6 desimal tanpa trailing zero.
9. **Waktu cetak dipassing dari luar** (`printedAt`) ke builder, jadi output deterministik dan bisa dites tanpa fake timer.
10. **Keamanan:** `setUrlAccessPolicy(() => false)` dan local access policy hanya mengizinkan nama font standar. Dokumen tidak pernah butuh gambar/URL eksternal, jadi kalau suatu saat ada input user yang nyasar jadi sumber gambar, tidak bisa dipakai untuk SSRF / baca file server.

## Frontend

- Komponen `features/documents/print-buttons.tsx` (`<PrintButtons resource id number />`) dipasang di header detail invoice/tagihan, PO, dan SO.
- PDF diambil lewat `apiBlob()` (Bearer token + auto refresh 401), lalu dibuka sebagai object URL. Link biasa `<a href="/api/.../pdf">` tidak bisa karena tidak membawa token (token ada di localStorage, bukan cookie).
- **Cetak**: tab kosong dibuka **sebelum** request (`window.open` setelah `await` diblokir popup blocker), lalu diarahkan ke object URL setelah PDF datang. Kalau popup tetap diblokir, PDF dibuka di tab yang sama. Object URL di-revoke setelah 60 detik.
- **Unduh PDF**: `?download=1`, nama file dibuat di FE (`<nomor>.pdf`) karena header `Content-Disposition` tidak terbaca lintas origin tanpa expose header CORS (sama seperti export laporan).

## Unit test

- `document-definition.spec.ts`: formatter id-ID/WIB, `companyFromEnv`, dan builder (kop, tabel item, IDR vs mata uang asing, blok pembayaran, blok opsional, watermark, footer). Assertion pakai helper `texts()` yang mengumpulkan semua teks di layout, jadi test tidak rapuh terhadap perubahan struktur kolom.
- `documents.service.spec.ts`: Prisma & renderer di-mock; mapping AR/AP/PO/SO, 404, kop dari config, satu test pakai renderer asli (output diawali `%PDF-`), role per route, dan header inline/attachment.
