import { BadRequestException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { docNumberPrefix, nextDocNumber } from '../common/utils/doc-number.js';

/**
 * Bikin dokumen bernomor `<PREFIX>-YYYYMMDD-XXXX` dengan retry kalau nomor bentrok (P2002)
 * karena dua request membuat dokumen bersamaan. Pola sama dengan PO/SO, cuma diekstrak
 * jadi fungsi supaya transfer & opname tidak copy-paste.
 *
 * @param findLast cari nomor terakhir yang diawali prefix hari itu
 * @param create   simpan dokumen dengan nomor yang diberikan
 */
export async function createWithDocNumber<T>(
  prefix: string,
  date: Date,
  findLast: (dayPrefix: string) => Promise<string | null | undefined>,
  create: (number: string) => Promise<T>,
): Promise<T> {
  const dayPrefix = docNumberPrefix(prefix, date);
  for (let attempt = 0; ; attempt++) {
    try {
      return await create(nextDocNumber(dayPrefix, await findLast(dayPrefix)));
    } catch (e) {
      const isDuplicate = e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
      if (!isDuplicate || attempt >= 2) throw e;
    }
  }
}

/** Tolak produk dobel dalam satu dokumen. */
export function assertUniqueProducts(ids: string[]) {
  if (new Set(ids).size !== ids.length) {
    throw new BadRequestException('Produk yang sama tidak boleh muncul dua kali');
  }
}
