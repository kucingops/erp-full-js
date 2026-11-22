import { Module } from '@nestjs/common';
import { DocumentsController } from './documents.controller.js';
import { DocumentsService } from './documents.service.js';
import { PdfRenderer } from './pdf-renderer.js';

/** Cetak PDF invoice, tagihan supplier, PO, dan SO. Lihat docs/pdf-printing.md. */
@Module({
  controllers: [DocumentsController],
  providers: [DocumentsService, PdfRenderer],
})
export class DocumentsModule {}
