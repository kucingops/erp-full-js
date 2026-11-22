import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  StreamableFile,
} from '@nestjs/common';
import { ApiBearerAuth, ApiProduces, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator.js';
import { Role } from '../generated/prisma/enums.js';
import { PdfQueryDto } from './dto/pdf-query.dto.js';
import { DocumentsService, type RenderedPdf } from './documents.service.js';

/**
 * Cetak PDF. Route-nya "nempel" di resource masing-masing (`/sales-invoices/:id/pdf`, dst.)
 * tapi di-host satu controller ini, jadi controller invoicing/PO/SO tidak perlu diubah.
 * Role = role BACA dokumen tsb (matriks di CONTRIBUTING.md). ADMIN selalu lolos.
 */
@ApiTags('documents')
@ApiBearerAuth()
@Controller()
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get('sales-invoices/:id/pdf')
  @Roles(Role.SALES)
  @ApiProduces('application/pdf')
  async salesInvoice(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: PdfQueryDto,
  ) {
    return toPdf(await this.documents.render('SALES_INVOICE', id), q.download);
  }

  @Get('purchase-bills/:id/pdf')
  @Roles(Role.PURCHASING)
  @ApiProduces('application/pdf')
  async purchaseBill(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: PdfQueryDto,
  ) {
    return toPdf(await this.documents.render('PURCHASE_BILL', id), q.download);
  }

  @Get('purchase-orders/:id/pdf')
  @Roles(Role.PURCHASING, Role.WAREHOUSE)
  @ApiProduces('application/pdf')
  async purchaseOrder(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: PdfQueryDto,
  ) {
    return toPdf(await this.documents.render('PURCHASE_ORDER', id), q.download);
  }

  @Get('sales-orders/:id/pdf')
  @Roles(Role.SALES, Role.WAREHOUSE)
  @ApiProduces('application/pdf')
  async salesOrder(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: PdfQueryDto,
  ) {
    return toPdf(await this.documents.render('SALES_ORDER', id), q.download);
  }
}

/** inline = dibuka di viewer browser; attachment = langsung diunduh. */
export function toPdf({ buffer, filename }: RenderedPdf, download?: boolean) {
  return new StreamableFile(buffer, {
    type: 'application/pdf',
    disposition: `${download ? 'attachment' : 'inline'}; filename="${filename}"`,
    length: buffer.length,
  });
}
