import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InvoiceType } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { companyFromEnv } from './company-profile.js';
import { buildDocDefinition } from './document-definition.js';
import {
  INVOICE_INCLUDE,
  invoiceToPrintable,
  PURCHASE_ORDER_INCLUDE,
  purchaseOrderToPrintable,
  SALES_ORDER_INCLUDE,
  salesOrderToPrintable,
} from './document-mappers.js';
import { PdfRenderer } from './pdf-renderer.js';
import type {
  CompanyProfile,
  DocumentKind,
  PrintableDocument,
} from './printable-document.js';

export interface RenderedPdf {
  buffer: Buffer;
  /** Nama file saran, misal `INV-20261122-0001.pdf` */
  filename: string;
}

const NOT_FOUND: Record<DocumentKind, string> = {
  SALES_INVOICE: 'Invoice penjualan tidak ditemukan',
  PURCHASE_BILL: 'Tagihan pembelian tidak ditemukan',
  PURCHASE_ORDER: 'Purchase order tidak ditemukan',
  SALES_ORDER: 'Sales order tidak ditemukan',
};

/**
 * Pipeline cetak: load (Prisma) → map (`PrintableDocument`) → layout (builder murni) → render.
 * Tiap langkah fungsi/kelas terpisah, jadi service ini cuma "lem" (mirip Facade di Java).
 * Data dibaca langsung lewat Prisma (read-only), bukan lewat service modul lain, supaya
 * modul ini tidak bergantung ke bentuk response API invoice/PO/SO.
 */
@Injectable()
export class DocumentsService {
  private readonly company: CompanyProfile;

  constructor(
    private readonly prisma: PrismaService,
    private readonly renderer: PdfRenderer,
    config: ConfigService,
  ) {
    const keys = ['NAME', 'ADDRESS', 'NPWP', 'PHONE', 'EMAIL', 'CITY'].map(
      (k) => `COMPANY_${k}`,
    );
    this.company = companyFromEnv(
      Object.fromEntries(keys.map((k) => [k, config.get<string>(k)])),
    );
  }

  async render(
    kind: DocumentKind,
    id: string,
    now: Date = new Date(),
  ): Promise<RenderedPdf> {
    const doc = await this.load(kind, id, now);
    const buffer = await this.renderer.render(
      buildDocDefinition(doc, this.company, { printedAt: now }),
    );
    return { buffer, filename: `${doc.number}.pdf` };
  }

  /** Ambil data & petakan ke view model. 404 kalau tidak ada (atau tipe invoice tidak cocok). */
  async load(
    kind: DocumentKind,
    id: string,
    now: Date = new Date(),
  ): Promise<PrintableDocument> {
    switch (kind) {
      case 'SALES_INVOICE':
      case 'PURCHASE_BILL': {
        const type =
          kind === 'SALES_INVOICE' ? InvoiceType.SALES : InvoiceType.PURCHASE;
        const inv = await this.prisma.invoice.findFirst({
          where: { id, type },
          include: INVOICE_INCLUDE,
        });
        if (!inv) throw new NotFoundException(NOT_FOUND[kind]);
        return invoiceToPrintable(inv, now);
      }
      case 'PURCHASE_ORDER': {
        const po = await this.prisma.purchaseOrder.findUnique({
          where: { id },
          include: PURCHASE_ORDER_INCLUDE,
        });
        if (!po) throw new NotFoundException(NOT_FOUND[kind]);
        return purchaseOrderToPrintable(po);
      }
      case 'SALES_ORDER': {
        const so = await this.prisma.salesOrder.findUnique({
          where: { id },
          include: SALES_ORDER_INCLUDE,
        });
        if (!so) throw new NotFoundException(NOT_FOUND[kind]);
        return salesOrderToPrintable(so);
      }
    }
  }
}
