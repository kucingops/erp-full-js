import { ROLES_KEY } from '../common/decorators/roles.decorator.js';
import { Role } from '../generated/prisma/enums.js';
import { CategoriesController } from '../categories/categories.controller.js';
import { CustomersController } from '../customers/customers.controller.js';
import { ProductsController } from '../products/products.controller.js';
import { SuppliersController } from '../suppliers/suppliers.controller.js';
import { WarehousesController } from '../warehouses/warehouses.controller.js';

/**
 * Cek matriks role (CONTRIBUTING.md) lewat metadata @Roles().
 * Efektif = role di method, kalau tidak ada pakai role di class (sama seperti getAllAndOverride).
 * undefined = semua user login boleh. ADMIN selalu lolos di RolesGuard.
 */
// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type -- class controller apa saja
const effectiveRoles = (ctrl: Function, method: string): Role[] | undefined => {
  const handler = (ctrl.prototype as Record<string, object>)[method];
  return (
    (Reflect.getMetadata(ROLES_KEY, handler) as Role[] | undefined) ??
    (Reflect.getMetadata(ROLES_KEY, ctrl) as Role[] | undefined)
  );
};

const READ = ['findAll', 'findOne'];
const WRITE = ['create', 'update', 'remove'];

describe('RBAC master data', () => {
  it.each([
    ['products', ProductsController, undefined, [Role.WAREHOUSE]],
    ['categories', CategoriesController, undefined, [Role.WAREHOUSE]],
    ['customers', CustomersController, [Role.SALES], [Role.SALES]],
    ['suppliers', SuppliersController, [Role.PURCHASING], [Role.PURCHASING]],
    ['warehouses', WarehousesController, undefined, [Role.ADMIN]],
  ])('%s: baca %j, tulis %j', (_name, ctrl, read, write) => {
    for (const m of READ) expect(effectiveRoles(ctrl, m)).toEqual(read);
    for (const m of WRITE) expect(effectiveRoles(ctrl, m)).toEqual(write);
  });
});
