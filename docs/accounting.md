# Akuntansi: COA, Jurnal Otomatis, Buku Besar, Neraca Saldo

## Ringkas

```
Invoice / Payment / StockMovement  ──(JournalPostingService.sync, idempotent)──▶ journal_entries + journal_lines
                                                                                     │
Jurnal umum manual (ADMIN) ──────────────────────────────────────────────────────────┘
                                                                                     ▼
                                                              Buku besar (per akun) & Neraca saldo
```

| Endpoint | Fungsi |
| --- | --- |
| `GET/POST/PATCH/DELETE /api/accounts` | Bagan akun (COA). List tidak dipaginasi (puluhan baris, ditampilkan sebagai pohon). |
| `GET /api/journal-entries` | List jurnal (`sourceType`, `from`, `to`, `accountId`, `search`), paginasi standar. |
| `GET /api/journal-entries/:id` | Detail + baris. |
| `POST /api/journal-entries` | Jurnal umum manual (harus seimbang, akun postable & aktif). |
| `POST /api/journal-entries/:id/reverse` | Batalkan jurnal manual lewat jurnal pembalik. |
| `POST /api/journal-entries/sync` | Paksa posting jurnal otomatis sekarang. |
| `GET /api/general-ledger?accountId&from&to` | Buku besar satu akun: saldo awal, baris + saldo berjalan, saldo akhir. |
| `GET /api/trial-balance?from&to` | Neraca saldo: saldo awal, mutasi D/K, saldo akhir D/K per akun + flag `balanced`. |

Role: **ADMIN saja** (belum ada role FINANCE). FE: menu Keuangan → Akuntansi (`/accounting/*`, 4 tab).

## Aturan posting (semua dalam IDR)

Kode akun sistem ada di `src/accounting/chart-of-accounts.ts` (`ACC`). Aturannya fungsi murni di `posting-rules.ts`, dites satu per satu di `posting-rules.spec.ts`.

| Dokumen | Debit | Kredit |
| --- | --- | --- |
| Invoice penjualan | 1200 Piutang Usaha | 4100 Penjualan |
| Tagihan supplier | 2110 Hutang Barang Belum Ditagih | 2100 Hutang Usaha |
| Terima pembayaran AR | 1101 Kas (CASH) / 1102 Bank (lainnya), nilai nyata | 1200 Piutang, nilai buku; selisih → 7100 |
| Bayar AP | 2100 Hutang, nilai buku | Kas/Bank, nilai nyata; selisih → 7100 |
| PO diterima (stok IN) | 1300 Persediaan @ harga standar | 2110 @ harga PO x kurs PO; selisih → 5300 |
| SO dikirim (stok OUT) | 5100 HPP @ harga standar | 1300 Persediaan |
| Adjustment / opname (+) | 1300 Persediaan | 5200 Selisih Persediaan |
| Adjustment / opname (-) | 5200 | 1300 |
| Transfer antar gudang | - (tidak dijurnal) | - |

"Nilai buku" = amount x kurs invoice, "nilai nyata" = `amountBase` (amount x kurs bayar).

## Keputusan desain

1. **Jurnal otomatis pakai pola sync idempotent, bukan dipanggil dari modul lain.**
   `JournalPostingService.sync()` mencari dokumen yang belum punya jurnal (anti-join lewat `source_key` unik, mis. `PAYMENT:<id>`) lalu memposting; jurnal yang dokumennya sudah dihapus (invoice/payment boleh dihapus di modul invoicing) dibalik dengan jurnal pembalik (`<key>:REV`).
   - Alasan: modul invoicing/inventory/PO/SO **tidak diubah sama sekali**, jadi aman dikerjakan paralel dengan branch lain (transfer/opname, audit, PDF) dan modul operasional tidak perlu tahu akuntansi. Di Java ini mirip pola *transactional outbox / poller*, bedanya "outbox"-nya adalah tabel dokumen itu sendiri.
   - Trade-off: jurnal tidak satu transaksi DB dengan dokumennya, jadi ada jeda. Jeda ditutup dengan: sync otomatis sebelum list jurnal / GL / neraca saldo dibaca, interval berkala (`JOURNAL_SYNC_INTERVAL_MS`, default 60 detik, `0` = mati), dan tombol **Sinkronkan**.
   - Alternatif yang lebih "ERP beneran": panggil `postingService.post(tx, ...)` di dalam `$transaction` invoice/payment/InventoryService, atau event (`@nestjs/event-emitter`). Kalau nanti mau pindah ke situ, posting rules-nya tetap sama; cuma pemanggilnya yang pindah.
2. **Idempotensi di DB, bukan di kode.** `source_key` UNIQUE: walau dua sync jalan bersamaan, satu dokumen tidak mungkin dijurnal dua kali. Ditambah `pg_try_advisory_xact_lock`: sync kedua langsung lewat (tidak antre) supaya laporan tetap bisa dibaca. Jurnal manual pakai `pg_advisory_xact_lock` (blocking) supaya nomor `JV-YYYYMMDD-XXXX` berurutan tanpa bentrok.
3. **Jurnal append-only.** Tidak ada edit/hapus jurnal. Jurnal manual dibatalkan dengan jurnal pembalik; jurnal otomatis dikoreksi lewat dokumen sumbernya (hapus payment → sistem membuat pembalik). Sama seperti kartu stok.
4. **Double-entry dijaga di 3 lapis:** validasi DTO/FE (live total), `insertEntry` menolak jurnal timpang (satu-satunya tempat INSERT jurnal), dan CHECK di SQL migrasi: tiap baris cuma boleh salah satu sisi (`(debit = 0) <> (credit = 0)`, tidak negatif). Neraca saldo menampilkan flag `balanced` sebagai cek akhir.
5. **Persediaan dinilai harga standar (`product.costPrice`).** PO receive masuk persediaan @standar, selisih dengan harga PO ke 5300 Selisih Harga Beli (standard costing). Alasan: tidak perlu menghitung moving average/FIFO per gudang (itu butuh layer biaya di tabel stok). Catatan: costPrice dibaca **saat posting** (sync), bukan saat movement terjadi; karena sync jalan tiap menit, efeknya kecil. Movement non-PO dengan costPrice 0 dilewati dulu dan ikut terposting begitu costPrice diisi.
6. **GR/IR (2110 Hutang Barang Belum Ditagih).** Barang diterima sebelum tagihan datang; 2110 dikredit saat terima dan didebit saat tagihan dibuat. Saldo 2110 = barang yang sudah diterima tapi belum ditagih. Selisih pembulatan per item vs total bisa menyisakan beberapa sen di 2110.
7. **Laba/rugi selisih kurs akhirnya dibukukan.** Sebelumnya (docs/multi-currency.md) selisih kurs pembayaran belum dibukukan; sekarang piutang/hutang dinolkan dengan nilai buku dan selisih dengan kas nyata masuk 7100.
8. **Tanggal jurnal = tanggal kalender WIB** dari dokumen sumber (disimpan 00:00 UTC, sama seperti `issueDate`), bukan tanggal posting. Dalam satu hari urutan posting: stok → invoice → pembayaran, supaya buku besar terbaca logis. Filter `from/to` = tanggal WIB inklusif.
9. **Akun sistem dibuat otomatis** (`ensureSystemAccounts`) oleh seed *dan* sebelum sync, jadi posting tetap jalan walau seed belum dijalankan. Akun sistem dikunci: tidak bisa dihapus, diganti tipe, dinonaktifkan, atau dijadikan header. Nama boleh diganti.
10. **Tanpa relasi Prisma ke tabel modul lain.** `source_id`, `created_by_id` cuma kolom UUID, karena relasi Prisma wajib dua arah dan akan memaksa edit `auth.prisma`/`finance.prisma` (rawan konflik). Integritas dijaga oleh `source_key` + deteksi orphan.
11. **ADMIN saja.** Belum ada role FINANCE; menambah enum role akan bentrok dengan branch user management. Kalau nanti ada, cukup ganti `@Roles` di `accounting.controller.ts` + `navigation.ts`.

## Batasan / next step

- Transfer antar gudang tidak dijurnal (persediaan satu akun). Barang hilang di jalan (receive < send) belum dibebankan ke 5200: perlu aturan per dokumen transfer.
- Belum ada laporan laba rugi & neraca (balance sheet), tutup buku periode, dan pajak (PPN).
- Satu akun Bank; belum ada master rekening bank per metode bayar.
