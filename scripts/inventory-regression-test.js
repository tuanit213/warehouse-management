const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

async function test(name, fn) {
  try {
    await fn();
    console.log(`[OK] ${name}`);
  } catch (error) {
    console.error(`[FAIL] ${name}: ${error.message}`);
    process.exitCode = 1;
  }
}

function stockKey(productId, warehouseId, locationId) {
  return `${productId}:${warehouseId}:${locationId || 'NO_LOCATION'}`;
}

function assertLocationBelongsToWarehouse(location, warehouseId) {
  if (location && location.warehouseId !== warehouseId) throw new Error('Location does not belong to warehouse');
}

function applyStockChange(levels, payload) {
  assertLocationBelongsToWarehouse(payload.location, payload.warehouseId);
  const key = stockKey(payload.productId, payload.warehouseId, payload.locationId);
  const current = levels.get(key) || 0;
  const next = current + payload.quantityDelta;
  if (next < 0) throw new Error('Insufficient stock');
  levels.set(key, next);
  return next;
}

function applyIdempotentStockChange(levels, movements, payload) {
  const movementKey = `${payload.referenceType}:${payload.referenceId}:${stockKey(payload.productId, payload.warehouseId, payload.locationId)}`;
  if (payload.referenceId && movements.has(movementKey)) return levels.get(stockKey(payload.productId, payload.warehouseId, payload.locationId)) || 0;
  const next = applyStockChange(levels, payload);
  if (payload.referenceId) movements.add(movementKey);
  return next;
}

async function runConcurrentOutbound(levels, requests) {
  const results = await Promise.allSettled(requests.map((request) => Promise.resolve().then(() => applyStockChange(levels, request))));
  return results;
}

function transferStock(levels, payload) {
  assertLocationBelongsToWarehouse(payload.fromLocation, payload.fromWarehouseId);
  assertLocationBelongsToWarehouse(payload.toLocation, payload.toWarehouseId);
  const fromLocationId = payload.fromLocationId || '';
  const toLocationId = payload.toLocationId || '';
  if (payload.fromWarehouseId === payload.toWarehouseId && fromLocationId === toLocationId) {
    throw new Error('Source and destination stock locations must be different');
  }
  const fromKey = stockKey(payload.productId, payload.fromWarehouseId, payload.fromLocationId);
  const toKey = stockKey(payload.productId, payload.toWarehouseId, payload.toLocationId);
  const fromQuantity = levels.get(fromKey) || 0;
  if (fromQuantity < payload.quantity) throw new Error('Insufficient stock for transfer');
  levels.set(fromKey, fromQuantity - payload.quantity);
  levels.set(toKey, (levels.get(toKey) || 0) + payload.quantity);
  return { source: levels.get(fromKey), destination: levels.get(toKey) };
}

function reserveStock(levels, reservations, payload) {
  const key = stockKey(payload.productId, payload.warehouseId, payload.locationId);
  const reserved = reservations
    .filter((reservation) => reservation.status === 'RESERVED' && reservation.key === key)
    .reduce((sum, reservation) => sum + reservation.quantity, 0);
  const available = (levels.get(key) || 0) - reserved;
  if (available < payload.quantity) throw new Error('Insufficient available stock for reservation');
  reservations.push({ key, quantity: payload.quantity, status: 'RESERVED', referenceType: payload.referenceType, referenceId: payload.referenceId });
}

function approveStocktake(levels, line) {
  const key = stockKey(line.productId, line.warehouseId, line.locationId);
  const before = levels.get(key) || 0;
  const variance = line.countedQuantity - before;
  levels.set(key, line.countedQuantity);
  return { before, variance, referenceType: 'stocktake' };
}

(async () => {
  await test('Inventory ledger prevents negative stock', () => {
    const levels = new Map([[stockKey('p1', 'w1', 'l1'), 3]]);
    assert.throws(() => applyStockChange(levels, { productId: 'p1', warehouseId: 'w1', locationId: 'l1', quantityDelta: -4, location: { id: 'l1', warehouseId: 'w1' } }), /Insufficient stock/);
  });

  await test('Inventory ledger accepts valid outbound', () => {
    const levels = new Map([[stockKey('p1', 'w1', 'l1'), 3]]);
    assert.equal(applyStockChange(levels, { productId: 'p1', warehouseId: 'w1', locationId: 'l1', quantityDelta: -2, location: { id: 'l1', warehouseId: 'w1' } }), 1);
  });

  await test('Inventory ledger rejects mismatched location warehouse', () => {
    const levels = new Map([[stockKey('p1', 'w1', 'l1'), 3]]);
    assert.throws(() => applyStockChange(levels, { productId: 'p1', warehouseId: 'w1', locationId: 'l2', quantityDelta: 1, location: { id: 'l2', warehouseId: 'w2' } }), /Location does not belong/);
  });

  await test('Inventory idempotency skips duplicate transaction item movement', () => {
    const levels = new Map([[stockKey('p1', 'w1', 'l1'), 10]]);
    const movements = new Set();
    const payload = { productId: 'p1', warehouseId: 'w1', locationId: 'l1', quantityDelta: -4, location: { id: 'l1', warehouseId: 'w1' }, referenceType: 'transaction', referenceId: 'item-1' };
    assert.equal(applyIdempotentStockChange(levels, movements, payload), 6);
    assert.equal(applyIdempotentStockChange(levels, movements, payload), 6);
  });

  await test('Inventory stock transfer moves quantity atomically', () => {
    const levels = new Map([[stockKey('p1', 'w1', 'l1'), 10]]);
    const result = transferStock(levels, {
      productId: 'p1',
      fromWarehouseId: 'w1',
      fromLocationId: 'l1',
      fromLocation: { id: 'l1', warehouseId: 'w1' },
      toWarehouseId: 'w2',
      toLocationId: 'l2',
      toLocation: { id: 'l2', warehouseId: 'w2' },
      quantity: 4,
    });
    assert.equal(result.source, 6);
    assert.equal(result.destination, 4);
  });

  await test('Inventory stock transfer rejects same source and destination', () => {
    const levels = new Map([[stockKey('p1', 'w1', 'l1'), 10]]);
    assert.throws(() => transferStock(levels, {
      productId: 'p1',
      fromWarehouseId: 'w1',
      fromLocationId: 'l1',
      fromLocation: { id: 'l1', warehouseId: 'w1' },
      toWarehouseId: 'w1',
      toLocationId: 'l1',
      toLocation: { id: 'l1', warehouseId: 'w1' },
      quantity: 1,
    }), /different/);
  });

  await test('Inventory stock transfer rejects insufficient source stock', () => {
    const levels = new Map([[stockKey('p1', 'w1', 'l1'), 2]]);
    assert.throws(() => transferStock(levels, {
      productId: 'p1',
      fromWarehouseId: 'w1',
      fromLocationId: 'l1',
      fromLocation: { id: 'l1', warehouseId: 'w1' },
      toWarehouseId: 'w2',
      toLocationId: 'l2',
      toLocation: { id: 'l2', warehouseId: 'w2' },
      quantity: 3,
    }), /Insufficient stock/);
  });

  await test('Concurrent outbound cannot drive stock negative', async () => {
    const levels = new Map([[stockKey('p1', 'w1', 'l1'), 5]]);
    const requests = [
      { productId: 'p1', warehouseId: 'w1', locationId: 'l1', quantityDelta: -4, location: { id: 'l1', warehouseId: 'w1' } },
      { productId: 'p1', warehouseId: 'w1', locationId: 'l1', quantityDelta: -4, location: { id: 'l1', warehouseId: 'w1' } },
    ];
    const results = await runConcurrentOutbound(levels, requests);
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
    assert.equal(levels.get(stockKey('p1', 'w1', 'l1')), 1);
  });

  await test('Reservations reduce available stock before outbound', () => {
    const levels = new Map([[stockKey('p1', 'w1', 'l1'), 5]]);
    const reservations = [];
    reserveStock(levels, reservations, { productId: 'p1', warehouseId: 'w1', locationId: 'l1', quantity: 3, referenceType: 'transaction', referenceId: 't1' });
    assert.throws(() => reserveStock(levels, reservations, { productId: 'p1', warehouseId: 'w1', locationId: 'l1', quantity: 3 }), /Insufficient available stock/);
  });

  await test('Stocktake approval writes counted stock and stocktake reference', () => {
    const levels = new Map([[stockKey('p1', 'w1', 'l1'), 7]]);
    const result = approveStocktake(levels, { productId: 'p1', warehouseId: 'w1', locationId: 'l1', countedQuantity: 4 });
    assert.equal(result.before, 7);
    assert.equal(result.variance, -3);
    assert.equal(result.referenceType, 'stocktake');
    assert.equal(levels.get(stockKey('p1', 'w1', 'l1')), 4);
  });

  await test('Inventory service does not use nullable ON CONFLICT for stock upsert path', () => {
    const source = fs.readFileSync(path.join(root, 'services/inventory-service/src/inventory.service.ts'), 'utf8');
    assert.doesNotMatch(source, /ON CONFLICT\s*\(\s*product_id,\s*warehouse_id,\s*location_id\s*\)/i);
    assert.match(source, /location_id IS NOT DISTINCT FROM/);
    assert.match(source, /FOR UPDATE/);
  });

  await test('Inventory schema merges duplicate stock before unique index creation', () => {
    const source = fs.readFileSync(path.join(root, 'services/inventory-service/src/inventory.service.ts'), 'utf8');
    const uniqueIndex = source.indexOf('CREATE UNIQUE INDEX IF NOT EXISTS ux_stock_levels_product_warehouse_location');
    const mergeStep = source.indexOf('WITH duplicate_stock AS');
    assert.ok(mergeStep >= 0, 'missing duplicate stock merge step');
    assert.ok(uniqueIndex > mergeStep, 'unique index must be created after duplicate stock merge');
    assert.match(source, /SUM\(quantity\) AS quantity/);
    assert.match(source, /s\.location_id IS NOT DISTINCT FROM d\.location_id/);
    assert.match(source, /implements OnModuleInit/);
    assert.match(source, /async onModuleInit\(\)/);
  });

  await test('Inventory consumes transaction confirmed events idempotently', () => {
    const moduleSource = fs.readFileSync(path.join(root, 'services/inventory-service/src/app.module.ts'), 'utf8');
    const consumerSource = fs.readFileSync(path.join(root, 'services/inventory-service/src/transaction-event.consumer.ts'), 'utf8');
    assert.match(moduleSource, /TransactionEventConsumer/);
    assert.match(consumerSource, /transaction\.confirmed/);
    assert.match(consumerSource, /referenceId: item\.id/);
    assert.match(consumerSource, /deadLetterExchange/);
    assert.match(consumerSource, /channel\.ack/);
    assert.match(consumerSource, /channel\.nack/);
  });

  await test('Inventory service implements audited stock transfers', () => {
    const controllerSource = fs.readFileSync(path.join(root, 'services/inventory-service/src/app.controller.ts'), 'utf8');
    const dtoSource = fs.readFileSync(path.join(root, 'services/inventory-service/src/dto.ts'), 'utf8');
    const source = fs.readFileSync(path.join(root, 'services/inventory-service/src/inventory.service.ts'), 'utf8');
    assert.match(controllerSource, /@Post\('stock-transfers'\)/);
    assert.match(dtoSource, /class TransferStockDto/);
    assert.match(source, /async transferStock/);
    assert.match(source, /Source and destination stock locations must be different/);
    assert.match(source, /\.sort\(\)/);
    assert.match(source, /reference_type, reference_id, note/);
    assert.match(source, /'transfer', transferId/);
    assert.match(source, /stock_transferred/);
  });

  await test('Inventory service implements stock reservations and stocktakes', () => {
    const controllerSource = fs.readFileSync(path.join(root, 'services/inventory-service/src/app.controller.ts'), 'utf8');
    const dtoSource = fs.readFileSync(path.join(root, 'services/inventory-service/src/dto.ts'), 'utf8');
    const source = fs.readFileSync(path.join(root, 'services/inventory-service/src/inventory.service.ts'), 'utf8');
    const migration = fs.readFileSync(path.join(root, 'database/migrations/inventory/202605220002_stocktake_reservations.sql'), 'utf8');
    assert.match(controllerSource, /@Post\('stock-reservations'\)/);
    assert.match(controllerSource, /@Post\('stocktakes\/:id\/approve'\)/);
    assert.match(dtoSource, /class CreateReservationDto/);
    assert.match(dtoSource, /class CreateStocktakeDto/);
    assert.match(source, /reservedQuantity/);
    assert.match(source, /availableQuantity/);
    assert.match(source, /Insufficient available stock for reservation/);
    assert.match(source, /reference_type, reference_id/);
    assert.match(source, /'stocktake', id/);
    assert.match(migration, /stocktake_sessions/);
    assert.match(migration, /stock_reservations/);
  });

  if (process.exitCode) process.exit(1);
})();
