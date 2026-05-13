const assert = require('node:assert/strict');

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

  if (process.exitCode) process.exit(1);
})();
