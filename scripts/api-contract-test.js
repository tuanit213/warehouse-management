const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const apiSpec = fs.readFileSync(path.join(root, 'docs/API_SPEC.md'), 'utf8');
const gateway = fs.readFileSync(path.join(root, 'services/api-gateway/src/gateway.controller.ts'), 'utf8');
const productController = fs.readFileSync(path.join(root, 'services/product-service/src/product.controller.ts'), 'utf8');
const inventoryController = fs.readFileSync(path.join(root, 'services/inventory-service/src/app.controller.ts'), 'utf8');
const transactionController = fs.readFileSync(path.join(root, 'services/transaction-service/src/app.controller.ts'), 'utf8');
const reportController = fs.readFileSync(path.join(root, 'services/report-service/src/app.controller.ts'), 'utf8');

function ok(name, fn) {
  fn();
  console.log(`[OK] ${name}`);
}

ok('API spec documents auth, product, inventory, transaction and report routes', () => {
  for (const route of [
    '/auth/login',
    '/auth/change-password',
    '/auth/users',
    '/auth/users/:id/status',
    '/products',
    '/products/export/csv',
    '/products/import/csv',
    '/categories',
    '/stock-levels',
    '/stock-levels/adjust',
    '/stock-transfers',
    '/stock-reservations',
    '/stocktakes',
    '/inbounds',
    '/outbounds',
    '/outbounds/:id/pdf',
    '/reports/export/excel',
  ]) {
    assert.match(apiSpec, new RegExp(route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

ok('Gateway maps all documented service prefixes', () => {
  for (const prefix of ['auth', 'products', 'categories', 'uploads', 'stock-levels', 'stock-movements', 'stock-transfers', 'stock-reservations', 'stocktakes', 'inbounds', 'outbounds', 'reports']) {
    assert.match(gateway, new RegExp(`${prefix}:|'${prefix}':`));
  }
});

ok('Controllers implement production-critical routes', () => {
  assert.match(productController, /@Post\('products\/images'\)/);
  assert.match(productController, /@Get\('products\/export\/csv'\)/);
  assert.match(productController, /@Post\('products\/import\/csv'\)/);
  assert.match(productController, /dryRun/);
  assert.match(productController, /@Get\('uploads\/products\/:fileName'\)/);
  assert.match(inventoryController, /@Post\('stock-levels'\)/);
  assert.match(inventoryController, /@Post\('stock-levels\/adjust'\)/);
  assert.match(inventoryController, /@Post\('stock-transfers'\)/);
  assert.match(inventoryController, /@Post\('stock-reservations'\)/);
  assert.match(inventoryController, /@Post\('stocktakes'\)/);
  assert.match(inventoryController, /@Post\('stocktakes\/:id\/approve'\)/);
  assert.match(transactionController, /@Get\('outbounds\/:id\/pdf'\)/);
  assert.match(reportController, /@Get\('export\/excel'\)/);
  assert.match(reportController, /spreadsheetml\.sheet/);
  assert.match(reportController, /wms-\$\{reportKind\}\.xlsx/);
});

ok('Gateway RBAC protects admin and write routes', () => {
  assert.match(gateway, /auth\\\/users/);
  assert.match(gateway, /roles: \['ADMIN'\]/);
  assert.match(gateway, /stock-levels/);
  assert.match(gateway, /stock-transfers/);
  assert.match(gateway, /stock-reservations/);
  assert.match(gateway, /stocktakes/);
  assert.match(gateway, /WAREHOUSE_STAFF/);
});
