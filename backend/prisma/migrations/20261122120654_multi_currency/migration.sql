-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "currency_code" VARCHAR(3);

-- AlterTable
ALTER TABLE "purchase_orders" ADD COLUMN     "currency_code" VARCHAR(3) NOT NULL DEFAULT 'IDR',
ADD COLUMN     "exchange_rate" DECIMAL(18,6) NOT NULL DEFAULT 1,
ADD COLUMN     "total_amount_base" DECIMAL(15,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "sales_orders" ADD COLUMN     "currency_code" VARCHAR(3) NOT NULL DEFAULT 'IDR',
ADD COLUMN     "exchange_rate" DECIMAL(18,6) NOT NULL DEFAULT 1,
ADD COLUMN     "total_amount_base" DECIMAL(15,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "suppliers" ADD COLUMN     "currency_code" VARCHAR(3);

-- CreateTable
CREATE TABLE "currencies" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(3) NOT NULL,
    "name" TEXT NOT NULL,
    "symbol" TEXT NOT NULL DEFAULT '',
    "decimals" INTEGER NOT NULL DEFAULT 2,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "currencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exchange_rates" (
    "id" TEXT NOT NULL,
    "currency_code" VARCHAR(3) NOT NULL,
    "effective_date" DATE NOT NULL,
    "rate" DECIMAL(18,6) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exchange_rates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "currencies_code_key" ON "currencies"("code");

-- CreateIndex
CREATE UNIQUE INDEX "exchange_rates_currency_code_effective_date_key" ON "exchange_rates"("currency_code", "effective_date");

-- Data: base currency IDR wajib ada sebelum FK dipasang (PO/SO lama default 'IDR').
INSERT INTO "currencies" ("id", "code", "name", "symbol", "decimals", "updated_at")
VALUES (gen_random_uuid()::text, 'IDR', 'Rupiah', 'Rp', 0, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

-- Data: dokumen lama semuanya IDR dengan kurs 1, jadi total base = total.
UPDATE "purchase_orders" SET "total_amount_base" = "total_amount";
UPDATE "sales_orders" SET "total_amount_base" = "total_amount";

-- AddForeignKey
ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_currency_code_fkey" FOREIGN KEY ("currency_code") REFERENCES "currencies"("code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_currency_code_fkey" FOREIGN KEY ("currency_code") REFERENCES "currencies"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_currency_code_fkey" FOREIGN KEY ("currency_code") REFERENCES "currencies"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_currency_code_fkey" FOREIGN KEY ("currency_code") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_currency_code_fkey" FOREIGN KEY ("currency_code") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
