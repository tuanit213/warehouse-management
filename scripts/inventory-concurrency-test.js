const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { requireDedicatedCredentialsForRemote } = require('./lib/env-safety');

const apiUrl = process.env.WMS_API_URL || process.env.API_URL || '';
const apiBase = apiUrl.replace(/\/$/, '');

function localRegression() {
  const result = spawnSync(process.execPath, ['scripts/inventory-regression-test.js'], { encoding: 'utf8' });
  process.stdout.write(result.stdout || '');
  process.stderr.write(result.stderr || '');
  if (result.status) throw new Error('local inventory regression failed');
}

async function main() {
  localRegression();
  if (!apiUrl) {
    console.log('[SKIP] inventory live concurrency requires WMS_API_URL or API_URL');
    return;
  }
  if (!isLocalApi() && process.env.WMS_ENABLE_LIVE_WRITE_TESTS !== 'true') {
    console.log('[SKIP] inventory live write test requires WMS_ENABLE_LIVE_WRITE_TESTS=true for non-local API URLs');
    return;
  }
  requireDedicatedCredentialsForRemote({
    apiUrl,
    tokenKeys: ['WMS_ACCESS_TOKEN', 'E2E_ADMIN_ACCESS_TOKEN', 'SMOKE_ADMIN_ACCESS_TOKEN', 'WMS_ADMIN_ACCESS_TOKEN'],
    credentialPairs: [['E2E_ADMIN_EMAIL', 'E2E_ADMIN_PASSWORD'], ['SMOKE_ADMIN_EMAIL', 'SMOKE_ADMIN_PASSWORD']],
    purpose: 'Inventory live write test',
  });
  const token = await accessToken();
  const headers = { authorization: `Bearer ${token}` };
  const fixture = await createFixture(headers);
  const [first, second] = await Promise.allSettled([
    request('/stock-transfers', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        productId: fixture.product.id,
        fromWarehouseId: fixture.sourceWarehouse.id,
        fromLocationId: fixture.sourceLocation.id,
        toWarehouseId: fixture.destinationWarehouse.id,
        toLocationId: fixture.destinationLocation.id,
        quantity: 4,
        reason: 'Live isolated concurrency test A',
      }),
    }),
    request('/stock-transfers', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        productId: fixture.product.id,
        fromWarehouseId: fixture.sourceWarehouse.id,
        fromLocationId: fixture.sourceLocation.id,
        toWarehouseId: fixture.destinationWarehouse.id,
        toLocationId: fixture.destinationLocation.id,
        quantity: 4,
        reason: 'Live isolated concurrency test B',
      }),
    }),
  ]);
  const successes = [first, second].filter((item) => item.status === 'fulfilled');
  const failures = [first, second].filter((item) => item.status === 'rejected');
  assert.equal(successes.length, 1, `expected exactly one transfer to succeed, got ${successes.length}`);
  assert.equal(failures.length, 1, `expected exactly one transfer to fail, got ${failures.length}`);
  assert.match(String(failures[0].reason?.message || ''), /409|Insufficient available stock/i);

  const stock = await request(`/stock-levels?warehouseId=${fixture.sourceWarehouse.id}&productId=${fixture.product.id}`, { headers });
  const source = stock.find((item) => item.locationId === fixture.sourceLocation.id);
  assert.equal(Number(source?.quantity || 0), 1);
  assert.ok(Number(source?.availableQuantity ?? source?.quantity ?? 0) >= 0);
  console.log('[OK] inventory live isolated concurrency test');
}

function isLocalApi() {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(apiBase);
}

async function accessToken() {
  const token = process.env.WMS_ACCESS_TOKEN || process.env.E2E_ADMIN_ACCESS_TOKEN || process.env.SMOKE_ADMIN_ACCESS_TOKEN || process.env.WMS_ADMIN_ACCESS_TOKEN;
  if (token) return token;
  const email = process.env.E2E_ADMIN_EMAIL || process.env.SMOKE_ADMIN_EMAIL || process.env.DEMO_ADMIN_EMAIL || process.env.BOOTSTRAP_ADMIN_EMAIL || 'admin@wms.local';
  const password = process.env.E2E_ADMIN_PASSWORD || process.env.SMOKE_ADMIN_PASSWORD || process.env.DEMO_ADMIN_PASSWORD || process.env.BOOTSTRAP_ADMIN_PASSWORD;
  if (!password) throw new Error('WMS_ACCESS_TOKEN/E2E_ADMIN_ACCESS_TOKEN/SMOKE_ADMIN_ACCESS_TOKEN or E2E_ADMIN_PASSWORD/SMOKE_ADMIN_PASSWORD/DEMO_ADMIN_PASSWORD/BOOTSTRAP_ADMIN_PASSWORD is required for live inventory test');
  const login = await request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
  return login.accessToken;
}

async function createFixture(headers) {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`.toUpperCase();
  const product = await request('/products', {
    method: 'POST',
    headers,
    body: JSON.stringify({ sku: `CRIT-INV-${suffix}`, name: `Critical inventory ${suffix}`, unit: 'cai', costPrice: 1000 }),
  });
  const sourceWarehouse = await request('/warehouses', {
    method: 'POST',
    headers,
    body: JSON.stringify({ code: `CIS-${suffix}`.slice(0, 50), name: `Critical source ${suffix}` }),
  });
  const destinationWarehouse = await request('/warehouses', {
    method: 'POST',
    headers,
    body: JSON.stringify({ code: `CID-${suffix}`.slice(0, 50), name: `Critical destination ${suffix}` }),
  });
  const sourceLocation = await request(`/warehouses/${sourceWarehouse.id}/locations`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ code: 'A1', description: 'Critical source location' }),
  });
  const destinationLocation = await request(`/warehouses/${destinationWarehouse.id}/locations`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ code: 'B1', description: 'Critical destination location' }),
  });
  await request('/stock-levels', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      productId: product.id,
      warehouseId: sourceWarehouse.id,
      locationId: sourceLocation.id,
      quantity: 5,
      minQuantity: 0,
      reason: 'Live isolated concurrency baseline',
    }),
  });
  return { product, sourceWarehouse, destinationWarehouse, sourceLocation, destinationLocation };
}

async function request(path, options = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
  });
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) {
    const error = new Error(`${response.status} ${path}: ${Array.isArray(data?.message) ? data.message.join(', ') : data?.message || text}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

main().then(() => console.log('[OK] inventory concurrency checks')).catch((error) => {
  console.error(`[FAIL] inventory concurrency checks: ${error.message}`);
  process.exit(1);
});
