import type { Prisma } from '../generated/prisma/client.js';
import type { StockReferenceType } from '../generated/prisma/enums.js';

/**
 * Client transaksi Prisma (`tx` di dalam `prisma.$transaction(async (tx) => ...)`).
 * Semua method yang mengubah stok WAJIB menerima ini, supaya pemanggil
 * (PO receive, SO ship) bisa menggabungkan perubahan stok dengan update dokumennya
 * dalam satu transaksi atomik. Mirip `@Transactional` + propagation REQUIRED di Spring.
 */
export type TxClient = Prisma.TransactionClient;

/** Input untuk barang masuk (`receive`) dan keluar (`issue`). */
export interface StockChangeInput {
  productId: string;
  warehouseId: string;
  /** Jumlah positif (> 0). Arah ditentukan oleh method-nya. */
  quantity: number;
  /** Sumber perubahan, mis. PURCHASE_ORDER untuk receive PO. */
  referenceType: StockReferenceType;
  /** Id dokumen sumber (PO/SO id). */
  referenceId?: string;
  note?: string;
  /** User yang melakukan aksi (dicatat di kartu stok). */
  createdById?: string;
}

/** Input penyesuaian manual (stock opname / barang rusak / koreksi). */
export interface StockAdjustInput {
  productId: string;
  warehouseId: string;
  /** Selisih, boleh positif (tambah) atau negatif (kurangi), tidak boleh 0. */
  quantity: number;
  /** Alasan penyesuaian, wajib supaya kartu stok bisa diaudit. */
  note: string;
  createdById?: string;
}
