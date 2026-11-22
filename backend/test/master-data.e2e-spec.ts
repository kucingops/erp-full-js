import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { PrismaExceptionFilter } from '../src/common/filters/prisma-exception.filter.js';
import { Prisma } from '../src/generated/prisma/client.js';
import { Role } from '../src/generated/prisma/enums.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

/**
 * E2E HTTP tanpa database: AppModule asli (guard global, ValidationPipe, filter),
 * tapi PrismaService diganti mock. Yang diuji: routing, RBAC, validasi DTO, mapping error.
 */
process.env.JWT_ACCESS_SECRET = 'e2e-secret';
process.env.DATABASE_URL ??= 'postgresql://unused:unused@localhost:5432/unused';

const delegate = () => ({
  findMany: vi.fn().mockResolvedValue([]),
  count: vi.fn().mockResolvedValue(0),
  findUnique: vi.fn(),
  create: vi.fn((args: { data: object }) =>
    Promise.resolve({ id: 'new', ...args.data }),
  ),
  update: vi.fn((args: { data: object }) =>
    Promise.resolve({ id: 'x', ...args.data }),
  ),
  delete: vi.fn().mockResolvedValue({}),
});

const prisma = {
  product: delegate(),
  category: delegate(),
  customer: delegate(),
  supplier: delegate(),
  warehouse: delegate(),
  $transaction: vi.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  $connect: vi.fn(),
  $disconnect: vi.fn(),
};

const ID = '6f1c2b8e-1d2a-4c3b-9e8f-0a1b2c3d4e5f';

describe('Master data (e2e)', () => {
  let app: INestApplication<App>;
  const token: Partial<Record<Role, string>> = {};
  const as = (role: Role) => ({ Authorization: `Bearer ${token[role]}` });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new PrismaExceptionFilter());
    await app.init();

    const jwt = app.get(JwtService);
    for (const role of Object.values(Role)) {
      token[role] = await jwt.signAsync({
        sub: `u-${role}`,
        email: `${role}@x`,
        role,
      });
    }
  });

  afterAll(() => app.close());
  beforeEach(() => vi.clearAllMocks());

  const http = () => request(app.getHttpServer());

  describe('products', () => {
    it('401 tanpa token', () => http().get('/api/products').expect(401));

    it('semua role boleh baca; query isActive di-transform ke boolean', async () => {
      const res = await http()
        .get(
          '/api/products?isActive=false&search=kopi&sortBy=salePrice&sortOrder=asc',
        )
        .set(as(Role.SALES))
        .expect(200);
      expect(res.body.meta).toEqual({
        page: 1,
        limit: 10,
        total: 0,
        totalPages: 1,
      });
      const args = prisma.product.findMany.mock.calls[0][0];
      expect(args.where.isActive).toBe(false);
      expect(args.orderBy).toEqual({ salePrice: 'asc' });
    });

    it('400 kalau isActive bukan boolean', () =>
      http()
        .get('/api/products?isActive=maybe')
        .set(as(Role.SALES))
        .expect(400));

    it('SALES tidak boleh tambah produk (403)', () =>
      http()
        .post('/api/products')
        .set(as(Role.SALES))
        .send({ sku: 'A-1', name: 'Abc', costPrice: 1, salePrice: 2 })
        .expect(403));

    it('400 untuk body tidak valid + field asing', async () => {
      const res = await http()
        .post('/api/products')
        .set(as(Role.WAREHOUSE))
        .send({
          sku: 'ada spasi',
          name: 'A',
          costPrice: -1,
          salePrice: 1.234,
          hack: true,
        })
        .expect(400);
      const msg = (res.body.message as string[]).join(' | ');
      expect(msg).toMatch(/sku/);
      expect(msg).toMatch(/name/);
      expect(msg).toMatch(/costPrice/);
      expect(msg).toMatch(/salePrice/);
      expect(msg).toMatch(/hack should not exist/);
    });

    it('WAREHOUSE bisa tambah; SKU di-trim & uppercase', async () => {
      const res = await http()
        .post('/api/products')
        .set(as(Role.WAREHOUSE))
        .send({
          sku: ' kopi-9 ',
          name: ' Kopi ',
          costPrice: 1000.5,
          salePrice: 2000,
        })
        .expect(201);
      expect(res.body.sku).toBe('KOPI-9');
      expect(prisma.product.create.mock.calls[0][0].data).toEqual({
        sku: 'KOPI-9',
        name: 'Kopi',
        costPrice: 1000.5,
        salePrice: 2000,
      });
    });

    it('SKU duplikat (P2002) jadi 409', async () => {
      prisma.product.create.mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('dup', {
          code: 'P2002',
          clientVersion: '7',
        }),
      );
      await http()
        .post('/api/products')
        .set(as(Role.WAREHOUSE))
        .send({ sku: 'KOPI-001', name: 'Kopi', costPrice: 1, salePrice: 2 })
        .expect(409);
    });

    it('id bukan UUID → 400, tidak ketemu → 404', async () => {
      await http().get('/api/products/abc').set(as(Role.SALES)).expect(400);
      prisma.product.findUnique.mockResolvedValueOnce(null);
      await http().get(`/api/products/${ID}`).set(as(Role.SALES)).expect(404);
    });

    it('DELETE produk yang masih dipakai (P2003) → 409, sukses → 204', async () => {
      prisma.product.findUnique.mockResolvedValue({ id: ID });
      prisma.product.delete.mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('fk', {
          code: 'P2003',
          clientVersion: '7',
        }),
      );
      await http()
        .delete(`/api/products/${ID}`)
        .set(as(Role.WAREHOUSE))
        .expect(409);
      await http()
        .delete(`/api/products/${ID}`)
        .set(as(Role.WAREHOUSE))
        .expect(204);
    });
  });

  describe('customers & suppliers', () => {
    it('customers: SALES boleh, WAREHOUSE & PURCHASING 403, ADMIN boleh', async () => {
      await http().get('/api/customers').set(as(Role.SALES)).expect(200);
      await http().get('/api/customers').set(as(Role.ADMIN)).expect(200);
      await http().get('/api/customers').set(as(Role.WAREHOUSE)).expect(403);
      await http().get('/api/customers').set(as(Role.PURCHASING)).expect(403);
    });

    it('suppliers: PURCHASING boleh, SALES 403', async () => {
      await http().get('/api/suppliers').set(as(Role.PURCHASING)).expect(200);
      await http().get('/api/suppliers').set(as(Role.SALES)).expect(403);
    });

    it('PATCH customer: string kosong mengosongkan kolom (null), email invalid ditolak', async () => {
      prisma.customer.findUnique.mockResolvedValue({ id: ID });
      await http()
        .patch(`/api/customers/${ID}`)
        .set(as(Role.SALES))
        .send({ email: '', phone: ' ', address: '' })
        .expect(200);
      expect(prisma.customer.update.mock.calls[0][0].data).toEqual({
        email: null,
        phone: null,
        address: null,
      });
      await http()
        .patch(`/api/customers/${ID}`)
        .set(as(Role.SALES))
        .send({ email: 'bukan-email' })
        .expect(400);
    });
  });

  it('Swagger mendokumentasikan semua endpoint master data', () => {
    const doc = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().addBearerAuth().build(),
    );
    for (const r of [
      'products',
      'categories',
      'customers',
      'suppliers',
      'warehouses',
    ]) {
      expect(Object.keys(doc.paths[`/api/${r}`] ?? {})).toEqual(
        expect.arrayContaining(['get', 'post']),
      );
      expect(Object.keys(doc.paths[`/api/${r}/{id}`] ?? {})).toEqual(
        expect.arrayContaining(['get', 'patch', 'delete']),
      );
    }
    const schemas = doc.components?.schemas ?? {};
    expect(Object.keys(schemas)).toEqual(
      expect.arrayContaining([
        'CreateProductDto',
        'UpdateCustomerDto',
        'CreateWarehouseDto',
      ]),
    );
  });

  describe('warehouses & categories', () => {
    it('warehouses: semua role baca, hanya ADMIN tulis', async () => {
      await http().get('/api/warehouses').set(as(Role.SALES)).expect(200);
      await http()
        .post('/api/warehouses')
        .set(as(Role.WAREHOUSE))
        .send({ code: 'WH-SBY', name: 'Gudang Surabaya' })
        .expect(403);
      await http()
        .post('/api/warehouses')
        .set(as(Role.ADMIN))
        .send({ code: 'wh-sby', name: 'Gudang Surabaya' })
        .expect(201)
        .expect((res) => expect(res.body.code).toBe('WH-SBY'));
    });

    it('categories: PURCHASING baca boleh, tulis 403', async () => {
      await http().get('/api/categories').set(as(Role.PURCHASING)).expect(200);
      await http()
        .post('/api/categories')
        .set(as(Role.PURCHASING))
        .send({ name: 'Minuman' })
        .expect(403);
    });
  });
});
