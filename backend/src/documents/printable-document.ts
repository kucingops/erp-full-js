/**
 * View model dokumen cetak: bentuk netral yang sama untuk invoice, tagihan, PO, dan SO.
 * Service memetakan entity Prisma → `PrintableDocument`, lalu builder murni mengubahnya
 * jadi layout pdfmake. Mirip DTO "report model" di Java (JasperReports bean) yang dipisah
 * dari entity JPA.
 *
 * Uang disimpan sebagai string (hasil `Prisma.Decimal.toString()`) supaya builder tidak
 * tergantung Prisma dan presisi tidak hilang sebelum diformat.
 */

export const DOCUMENT_KINDS = [
  'SALES_INVOICE',
  'PURCHASE_BILL',
  'PURCHASE_ORDER',
  'SALES_ORDER',
] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export interface LabelValue {
  label: string;
  value: string;
}

export interface PrintableParty {
  /** Judul blok, misal "Ditagihkan kepada" / "Supplier" */
  heading: string;
  code: string;
  name: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
}

export interface PrintableItem {
  sku: string;
  name: string;
  unit: string;
  quantity: number;
  unitPrice: string;
  subtotal: string;
}

export interface PrintablePayment {
  paidAt: Date;
  method: string;
  reference?: string | null;
  amount: string;
}

/** Hanya untuk invoice/tagihan. */
export interface PrintablePaymentInfo {
  statusLabel: string;
  isOverdue: boolean;
  paidAmount: string;
  outstandingAmount: string;
  /** Sisa dalam IDR (kurs invoice). Ditampilkan kalau mata uang asing. */
  outstandingAmountBase: string;
  payments: PrintablePayment[];
}

export interface PrintableDocument {
  kind: DocumentKind;
  /** Judul besar, misal "INVOICE" */
  title: string;
  number: string;
  /** Label status dokumen (Bahasa Indonesia) */
  statusLabel: string;
  /** Watermark untuk dokumen yang belum final / batal, misal "DRAFT" */
  watermark?: string;
  /** Tanggal + referensi (No. SO, gudang, ...) di kanan atas */
  meta: LabelValue[];
  party: PrintableParty;
  items: PrintableItem[];
  currencyCode: string;
  exchangeRate: string;
  subtotal: string;
  taxAmount: string;
  total: string;
  /** Total dalam IDR (`total_amount_base`) */
  totalBase: string;
  payment?: PrintablePaymentInfo;
  notes?: string | null;
  /** Label kolom tanda tangan, kiri → kanan. `name` opsional (diisi kalau diketahui). */
  signatures: { label: string; name?: string | null }[];
}

/** Identitas perusahaan di kop dokumen (dari env, lihat `company-profile.ts`). */
export interface CompanyProfile {
  name: string;
  address: string;
  npwp: string;
  phone?: string;
  email?: string;
  /** Kota untuk baris tanda tangan: "Jakarta, 22 November 2026" */
  city: string;
}
