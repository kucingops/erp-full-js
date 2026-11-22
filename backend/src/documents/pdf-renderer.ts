import { Injectable } from '@nestjs/common';
import pdfmake from 'pdfmake';
import type { TDocumentDefinitions } from 'pdfmake/interfaces.js';
import { PDF_FONT } from './document-definition.js';

const STANDARD_FONTS = {
  normal: 'Helvetica',
  bold: 'Helvetica-Bold',
  italics: 'Helvetica-Oblique',
  bolditalics: 'Helvetica-BoldOblique',
};

/**
 * Adapter tipis ke pdfmake: document definition (JSON) → Buffer PDF.
 * Dipisah dari service supaya service bisa dites tanpa benar-benar render PDF
 * (cukup mock `render`). Di Java mirip interface `PdfRenderer` + implementasi iText.
 */
@Injectable()
export class PdfRenderer {
  constructor() {
    // Font standar PDF (Helvetica) bawaan PDFKit: tidak perlu file .ttf di disk/image Docker.
    // Trade-off: hanya karakter WinAnsi (Latin), cukup untuk teks Bahasa Indonesia.
    pdfmake.setFonts({ [PDF_FONT]: STANDARD_FONTS });
    // Dokumen tidak butuh file lokal / URL eksternal: tolak semua kecuali nama font standar
    // (cegah SSRF / baca file kalau nanti ada input user yang dipakai sebagai sumber gambar).
    const allowed = new Set<string>(Object.values(STANDARD_FONTS));
    pdfmake.setUrlAccessPolicy(() => false);
    pdfmake.setLocalAccessPolicy((path) => allowed.has(path));
  }

  render(definition: TDocumentDefinitions): Promise<Buffer> {
    return pdfmake.createPdf(definition).getBuffer();
  }
}
