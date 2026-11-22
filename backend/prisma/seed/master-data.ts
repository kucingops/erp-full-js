import type { PrismaClient } from '../../src/generated/prisma/client.js';

/** Data demo master data (kategori, produk, customer, supplier). Gudang ada di warehouses.ts. */
export async function seedMasterData(prisma: PrismaClient) {
  const categories = ['Minuman', 'Makanan Ringan', 'Alat Tulis'];
  const catId: Record<string, string> = {};
  for (const name of categories) {
    const c = await prisma.category.upsert({
      where: { name },
      update: {},
      create: { name },
    });
    catId[name] = c.id;
  }

  const products = [
    {
      sku: 'KOPI-001',
      name: 'Kopi Arabika 250g',
      unit: 'pcs',
      category: 'Minuman',
      costPrice: 55000,
      salePrice: 75000,
      minStock: 10,
    },
    {
      sku: 'TEH-001',
      name: 'Teh Melati 100g',
      unit: 'pcs',
      category: 'Minuman',
      costPrice: 12000,
      salePrice: 18000,
      minStock: 20,
    },
    {
      sku: 'AIR-600',
      name: 'Air Mineral 600ml',
      unit: 'dus',
      category: 'Minuman',
      costPrice: 38000,
      salePrice: 48000,
      minStock: 15,
    },
    {
      sku: 'KRP-001',
      name: 'Keripik Singkong 200g',
      unit: 'pcs',
      category: 'Makanan Ringan',
      costPrice: 9000,
      salePrice: 14000,
      minStock: 25,
    },
    {
      sku: 'CKL-001',
      name: 'Cokelat Batang 50g',
      unit: 'pcs',
      category: 'Makanan Ringan',
      costPrice: 7000,
      salePrice: 11000,
      minStock: 30,
    },
    {
      sku: 'PLP-2B',
      name: 'Pensil 2B',
      unit: 'lusin',
      category: 'Alat Tulis',
      costPrice: 24000,
      salePrice: 36000,
      minStock: 5,
    },
    {
      sku: 'BKU-A5',
      name: 'Buku Tulis A5',
      unit: 'pak',
      category: 'Alat Tulis',
      costPrice: 30000,
      salePrice: 42000,
      minStock: 8,
    },
  ];
  for (const { category, ...p } of products) {
    await prisma.product.upsert({
      where: { sku: p.sku },
      update: {},
      create: { ...p, categoryId: catId[category] },
    });
  }

  const customers = [
    {
      code: 'CUST-001',
      name: 'Toko Sinar Jaya',
      email: 'order@sinarjaya.test',
      phone: '021-5550101',
      address: 'Jakarta Barat',
    },
    {
      code: 'CUST-002',
      name: 'Warung Bu Sri',
      phone: '0812-3456-7890',
      address: 'Bandung',
    },
    {
      code: 'CUST-003',
      name: 'PT Kantor Maju',
      email: 'procurement@kantormaju.test',
      address: 'Jakarta Selatan',
    },
  ];
  for (const c of customers) {
    await prisma.customer.upsert({
      where: { code: c.code },
      update: {},
      create: c,
    });
  }

  const suppliers = [
    {
      code: 'SUP-001',
      name: 'CV Kopi Nusantara',
      email: 'sales@kopinusantara.test',
      phone: '022-7770101',
      address: 'Bandung',
    },
    {
      code: 'SUP-002',
      name: 'PT Snack Indo',
      email: 'cs@snackindo.test',
      address: 'Tangerang',
    },
    {
      code: 'SUP-003',
      name: 'UD Alat Tulis Abadi',
      phone: '021-6660202',
      address: 'Jakarta Pusat',
    },
  ];
  for (const s of suppliers) {
    await prisma.supplier.upsert({
      where: { code: s.code },
      update: {},
      create: s,
    });
  }
}
