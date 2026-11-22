import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { paginate, toOrderBy, toSkipTake } from '../common/utils/paginate.js';
import type {
  ConvertQueryDto,
  CreateCurrencyDto,
  CurrencyQueryDto,
  ExchangeRateQueryDto,
  UpdateCurrencyDto,
  UpdateExchangeRateDto,
  UpsertExchangeRateDto,
} from './dto/currency.dto.js';
import { BASE_CURRENCY, crossConvert, wibDate } from './money.js';

const SORTABLE = ['code', 'name', 'createdAt'] as const;
const RATE_SORTABLE = ['effectiveDate', 'currencyCode', 'rate'] as const;

type Tx = Prisma.TransactionClient;

/** Hasil snapshot mata uang untuk dokumen (PO/SO/invoice). */
export interface CurrencySnapshot {
  currencyCode: string;
  exchangeRate: Prisma.Decimal;
}

const isoDate = (d: Date) => wibDate(d).toISOString().slice(0, 10);

/**
 * Master mata uang + kurs harian, plus helper konversi yang dipakai modul lain.
 * Konvensi kurs: 1 unit mata uang asing = `rate` IDR (base). Base currency selalu kurs 1
 * dan tidak punya baris di `exchange_rates`.
 */
@Injectable()
export class CurrenciesService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------- master mata uang ----------

  async findAll(query: CurrencyQueryDto) {
    const where: Prisma.CurrencyWhereInput = {
      ...(query.search && {
        OR: [
          { code: { contains: query.search, mode: 'insensitive' } },
          { name: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
      ...(query.isActive !== undefined && { isActive: query.isActive }),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.currency.findMany({
        where,
        orderBy: toOrderBy(query.sortBy, SORTABLE, 'code', query.sortOrder),
        ...toSkipTake(query),
      }),
      this.prisma.currency.count({ where }),
    ]);
    const latest = await this.latestRates(rows.map((r) => r.code));
    const data = rows.map((r) => ({
      ...r,
      isBase: r.code === BASE_CURRENCY,
      latestRate:
        r.code === BASE_CURRENCY
          ? { rate: '1', effectiveDate: null }
          : (latest.get(r.code) ?? null),
    }));
    return paginate(data, total, query);
  }

  async findOne(id: string) {
    const row = await this.prisma.currency.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Mata uang tidak ditemukan');
    return { ...row, isBase: row.code === BASE_CURRENCY };
  }

  /** Kode duplikat → P2002 → 409. */
  create(dto: CreateCurrencyDto) {
    return this.prisma.currency.create({ data: dto });
  }

  async update(id: string, dto: UpdateCurrencyDto) {
    const row = await this.findOne(id);
    if (row.isBase && dto.isActive === false) {
      throw new BadRequestException('Base currency tidak boleh dinonaktifkan');
    }
    return this.prisma.currency.update({ where: { id }, data: dto });
  }

  /** Mata uang yang sudah dipakai PO/SO → FK Restrict → 409 (PrismaExceptionFilter). */
  async remove(id: string) {
    const row = await this.findOne(id);
    if (row.isBase) throw new BadRequestException('Base currency tidak boleh dihapus');
    await this.prisma.currency.delete({ where: { id } });
  }

  // ---------- kurs ----------

  async findRates(query: ExchangeRateQueryDto) {
    const where: Prisma.ExchangeRateWhereInput = query.currencyCode
      ? { currencyCode: query.currencyCode }
      : {};
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.exchangeRate.findMany({
        where,
        include: { currency: { select: { code: true, name: true, symbol: true } } },
        orderBy: toOrderBy(query.sortBy, RATE_SORTABLE, 'effectiveDate', query.sortOrder),
        ...toSkipTake(query),
      }),
      this.prisma.exchangeRate.count({ where }),
    ]);
    return paginate(rows, total, query);
  }

  /** Satu kurs per (mata uang, tanggal): input ulang di tanggal yang sama = update. */
  async upsertRate(dto: UpsertExchangeRateDto) {
    if (dto.currencyCode === BASE_CURRENCY) {
      throw new BadRequestException(`Kurs ${BASE_CURRENCY} selalu 1, tidak perlu diinput`);
    }
    await this.assertActive(dto.currencyCode);
    // effectiveDate dari form berupa 'YYYY-MM-DD' → simpan apa adanya sebagai tanggal.
    const effectiveDate = new Date(`${dto.effectiveDate.slice(0, 10)}T00:00:00.000Z`);
    const rate = new Prisma.Decimal(dto.rate);
    return this.prisma.exchangeRate.upsert({
      where: { currencyCode_effectiveDate: { currencyCode: dto.currencyCode, effectiveDate } },
      create: { currencyCode: dto.currencyCode, effectiveDate, rate },
      update: { rate },
    });
  }

  async updateRate(id: string, dto: UpdateExchangeRateDto) {
    await this.findRate(id);
    return this.prisma.exchangeRate.update({
      where: { id },
      data: { rate: new Prisma.Decimal(dto.rate) },
    });
  }

  /** Dokumen yang sudah dibuat menyimpan snapshot kurs sendiri, jadi aman dihapus. */
  async removeRate(id: string) {
    await this.findRate(id);
    await this.prisma.exchangeRate.delete({ where: { id } });
  }

  async convert(q: ConvertQueryDto) {
    const date = q.date ? new Date(q.date) : new Date();
    const to = q.to ?? BASE_CURRENCY;
    const [fromRate, toRate] = await Promise.all([
      this.getRate(q.from, date),
      this.getRate(to, date),
    ]);
    return {
      amount: String(q.amount),
      from: q.from,
      to,
      date: isoDate(date),
      fromRate: fromRate.toString(),
      toRate: toRate.toString(),
      result: crossConvert(q.amount, fromRate, toRate).toString(),
    };
  }

  // ---------- API publik untuk modul lain (PO, SO, invoicing) ----------

  /**
   * Kurs yang berlaku untuk `code` pada `date` (tanggal WIB): baris terbaru dengan
   * effectiveDate <= tanggal itu. Base currency = 1.
   * @throws BadRequestException kalau belum ada kurs sama sekali sampai tanggal itu.
   */
  async getRate(code: string, date: Date, tx: Tx = this.prisma): Promise<Prisma.Decimal> {
    if (code === BASE_CURRENCY) return new Prisma.Decimal(1);
    const row = await tx.exchangeRate.findFirst({
      where: { currencyCode: code, effectiveDate: { lte: wibDate(date) } },
      orderBy: { effectiveDate: 'desc' },
      select: { rate: true },
    });
    if (!row) {
      throw new BadRequestException(
        `Belum ada kurs ${code} untuk tanggal ${isoDate(date)}. Input kurs dulu atau isi kurs manual.`,
      );
    }
    return new Prisma.Decimal(row.rate);
  }

  /**
   * Tentukan mata uang + kurs untuk dokumen baru/diedit.
   * Urutan mata uang: `requested` → `partnerDefault` (customer/supplier) → base.
   * Kurs: `override` kalau dikirim user, kalau tidak dari tabel kurs per `date`.
   * Base currency selalu kurs 1 (override diabaikan).
   */
  async snapshot(
    opts: {
      requested?: string | null;
      partnerDefault?: string | null;
      date: Date;
      override?: number | null;
    },
    tx: Tx = this.prisma,
  ): Promise<CurrencySnapshot> {
    const currencyCode = opts.requested ?? opts.partnerDefault ?? BASE_CURRENCY;
    if (currencyCode === BASE_CURRENCY) {
      return { currencyCode, exchangeRate: new Prisma.Decimal(1) };
    }
    await this.assertActive(currencyCode, tx);
    const exchangeRate =
      opts.override != null
        ? new Prisma.Decimal(opts.override)
        : await this.getRate(currencyCode, opts.date, tx);
    return { currencyCode, exchangeRate };
  }

  // ---------- helper ----------

  /** Dipakai juga untuk validasi default currency customer/supplier. */
  async assertActive(code: string, tx: Tx = this.prisma) {
    const cur = await tx.currency.findUnique({ where: { code }, select: { isActive: true } });
    if (!cur) throw new BadRequestException(`Mata uang ${code} tidak terdaftar`);
    if (!cur.isActive) throw new BadRequestException(`Mata uang ${code} nonaktif`);
  }

  private async findRate(id: string) {
    const row = await this.prisma.exchangeRate.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Kurs tidak ditemukan');
    return row;
  }

  /** Kurs terbaru per mata uang (untuk kolom "kurs terakhir" di list). */
  private async latestRates(codes: string[]) {
    const foreign = codes.filter((c) => c !== BASE_CURRENCY);
    const map = new Map<string, { rate: string; effectiveDate: Date }>();
    if (foreign.length === 0) return map;
    const rows = await this.prisma.exchangeRate.findMany({
      where: { currencyCode: { in: foreign } },
      orderBy: { effectiveDate: 'desc' },
      distinct: ['currencyCode'],
      select: { currencyCode: true, rate: true, effectiveDate: true },
    });
    for (const r of rows) {
      map.set(r.currencyCode, { rate: r.rate.toString(), effectiveDate: r.effectiveDate });
    }
    return map;
  }
}
