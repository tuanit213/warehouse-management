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

  if (process.exitCode) process.exit(1);
})();
