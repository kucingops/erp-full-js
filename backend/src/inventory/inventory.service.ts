import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { StockMovementType, StockReferenceType } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { InsufficientStockException } from './insufficient-stock.exception.js';
import type { StockAdjustInput, StockChangeInput, TxClient } from './inventory.types.js';

/**
 * Satu-satunya pintu untuk MENGUBAH stok.
 *
 * Aturan:
 * - Saldo di `stocks` dan histori di `stock_movements` selalu ditulis bersama
 *   di transaksi yang sama (parameter `tx`).
 * - Stok tidak pernah boleh negatif.
 *
 * Contoh pemakaian dari modul lain (PO receive):
 * ```ts
 * await this.prisma.$transaction(async (tx) => {
 *   for (const item of po.items) {
 *     await this.inventory.receive(tx, {
 *       productId: item.productId,
 *       warehouseId: po.warehouseId,
 *       quantity: item.quantity,
 *       referenceType: StockReferenceType.PURCHASE_ORDER,
 *       referenceId: po.id,
 *       createdById: user.id,
 *     });
 *   }
 *   await tx.purchaseOrder.update({ where: { id: po.id }, data: { status: 'RECEIVED' } });
 * });
 * ```
 * Kalau salah satu item gagal (mis. stok kurang saat SO ship), seluruh transaksi di-rollback.
 */
@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  /** Barang masuk (+quantity). Baris `stocks` dibuat otomatis kalau belum ada. */
  async receive(tx: TxClient, input: StockChangeInput) {
    assertPositiveInt(input.quantity);
    const balance = await this.increment(tx, input.productId, input.warehouseId, input.quantity);
    return this.record(tx, {
      ...input,
      type: StockMovementType.IN,
      quantity: input.quantity,
      balanceAfter: balance,
    });
  }

  /** Barang keluar (-quantity). Lempar `InsufficientStockException` kalau stok kurang. */
  async issue(tx: TxClient, input: StockChangeInput) {
    assertPositiveInt(input.quantity);
    const balance = await this.decrement(tx, input.productId, input.warehouseId, input.quantity);
    return this.record(tx, {
      ...input,
      type: StockMovementType.OUT,
      quantity: -input.quantity,
      balanceAfter: balance,
    });
  }

  /** Penyesuaian manual (+/-). Tidak boleh membuat stok negatif. */
  async adjust(tx: TxClient, input: StockAdjustInput) {
    if (!Number.isInteger(input.quantity) || input.quantity === 0) {
      throw new BadRequestException('Jumlah penyesuaian harus bilangan bulat dan tidak boleh 0');
    }
    const balance =
      input.quantity > 0
        ? await this.increment(tx, input.productId, input.warehouseId, input.quantity)
        : await this.decrement(tx, input.productId, input.warehouseId, -input.quantity);
    return this.record(tx, {
      ...input,
      type: StockMovementType.ADJUSTMENT,
      referenceType: StockReferenceType.ADJUSTMENT,
      balanceAfter: balance,
    });
  }

  /**
   * Endpoint adjustment manual (POST /inventory/adjustments).
   * Beda dengan `adjust`, method ini membuka transaksinya sendiri karena dipanggil langsung
   * dari controller, dan memvalidasi produk/gudang masih aktif.
   */
  async createAdjustment(input: StockAdjustInput) {
    const [product, warehouse] = await Promise.all([
      this.prisma.product.findUnique({ where: { id: input.productId }, select: { isActive: true } }),
      this.prisma.warehouse.findUnique({ where: { id: input.warehouseId }, select: { isActive: true } }),
    ]);
    if (!product) throw new NotFoundException('Produk tidak ditemukan');
    if (!warehouse) throw new NotFoundException('Gudang tidak ditemukan');
    if (!product.isActive || !warehouse.isActive) {
      throw new BadRequestException('Produk atau gudang sudah nonaktif');
    }
    return this.prisma.$transaction((tx) => this.adjust(tx, input));
  }

  /**
   * Saldo stok saat ini (0 kalau belum pernah ada). Read-only.
   * Berguna untuk validasi awal (mis. saat SO confirm); validasi final tetap di `issue`.
   */
  async getQuantity(productId: string, warehouseId: string, tx: TxClient = this.prisma) {
    const stock = await tx.stock.findUnique({
      where: { productId_warehouseId: { productId, warehouseId } },
      select: { quantity: true },
    });
    return stock?.quantity ?? 0;
  }

  // ---------- internal ----------

  /** Upsert + increment atomik di DB (aman dari race condition). */
  private async increment(tx: TxClient, productId: string, warehouseId: string, qty: number) {
    const stock = await tx.stock.upsert({
      where: { productId_warehouseId: { productId, warehouseId } },
      create: { productId, warehouseId, quantity: qty },
      update: { quantity: { increment: qty } },
      select: { quantity: true },
    });
    return stock.quantity;
  }

  /**
   * Decrement bersyarat: `UPDATE stocks SET quantity = quantity - n WHERE ... AND quantity >= n`.
   * Cek dan kurangi terjadi dalam satu statement, jadi dua request bersamaan
   * tidak bisa sama-sama lolos (tidak ada race "baca dulu baru tulis").
   */
  private async decrement(tx: TxClient, productId: string, warehouseId: string, qty: number) {
    const rows = await tx.stock.updateManyAndReturn({
      where: { productId, warehouseId, quantity: { gte: qty } },
      data: { quantity: { decrement: qty } },
      select: { quantity: true },
    });
    if (rows.length === 0) {
      const available = await this.getQuantity(productId, warehouseId, tx);
      throw new InsufficientStockException(productId, warehouseId, qty, available);
    }
    return rows[0].quantity;
  }

  private record(
    tx: TxClient,
    m: Omit<StockChangeInput, 'quantity'> & {
      type: StockMovementType;
      quantity: number;
      balanceAfter: number;
    },
  ) {
    return tx.stockMovement.create({
      data: {
        productId: m.productId,
        warehouseId: m.warehouseId,
        type: m.type,
        quantity: m.quantity,
        balanceAfter: m.balanceAfter,
        referenceType: m.referenceType,
        referenceId: m.referenceId,
        note: m.note,
        createdById: m.createdById,
      },
    });
  }
}

function assertPositiveInt(qty: number) {
  if (!Number.isInteger(qty) || qty <= 0) {
    throw new BadRequestException('Jumlah harus bilangan bulat lebih dari 0');
  }
}
