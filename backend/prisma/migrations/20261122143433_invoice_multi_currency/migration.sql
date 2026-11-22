-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "currency_code" VARCHAR(3) NOT NULL DEFAULT 'IDR',
ADD COLUMN     "exchange_rate" DECIMAL(18,6) NOT NULL DEFAULT 1,
ADD COLUMN     "total_amount_base" DECIMAL(15,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "amount_base" DECIMAL(15,2) NOT NULL DEFAULT 0,
ADD COLUMN     "exchange_rate" DECIMAL(18,6) NOT NULL DEFAULT 1;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_currency_code_fkey" FOREIGN KEY ("currency_code") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Data: invoice lama mewarisi mata uang + kurs order asal (SO/PO sudah multi-currency
-- sejak migrasi *_multi_currency). total invoice = total order, jadi base = total * kurs.
UPDATE "invoices" i
SET "currency_code" = so."currency_code", "exchange_rate" = so."exchange_rate"
FROM "sales_orders" so
WHERE i."sales_order_id" = so."id";

UPDATE "invoices" i
SET "currency_code" = po."currency_code", "exchange_rate" = po."exchange_rate"
FROM "purchase_orders" po
WHERE i."purchase_order_id" = po."id";

-- ROUND numeric Postgres = HALF_UP (menjauhi nol), sama dengan toBase().
UPDATE "invoices" SET "total_amount_base" = ROUND("total_amount" * "exchange_rate", 2);

-- Pembayaran lama: pakai kurs invoice-nya.
UPDATE "payments" p
SET "exchange_rate" = i."exchange_rate", "amount_base" = ROUND(p."amount" * i."exchange_rate", 2)
FROM "invoices" i
WHERE p."invoice_id" = i."id";
