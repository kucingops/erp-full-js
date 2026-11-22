import { BadRequestException } from '@nestjs/common';

/**
 * Dilempar `InventoryService.issue/adjust` kalau stok tidak cukup.
 * Turunan BadRequestException (HTTP 400), jadi controller tidak perlu try/catch.
 * Pemanggil yang butuh detail bisa cek `err instanceof InsufficientStockException`.
 */
export class InsufficientStockException extends BadRequestException {
  constructor(
    readonly productId: string,
    readonly warehouseId: string,
    readonly requested: number,
    readonly available: number,
  ) {
    super({
      statusCode: 400,
      error: 'InsufficientStock',
      message: `Stok tidak cukup: diminta ${requested}, tersedia ${available}`,
      productId,
      warehouseId,
      requested,
      available,
    });
  }
}
