const { spawnSync } = require('node:child_process');
const assert = require('node:assert/strict');
const { requireDedicatedCredentialsForRemote } = require('./lib/env-safety');

const apiUrl = process.env.WMS_API_URL || process.env.API_URL || '';
const apiBase = apiUrl.replace(/\/$/, '');

function runLocal() {
  const result = spawnSync(process.execPath, ['scripts/transaction-regression-test.js'], { encoding: 'utf8' });
  process.stdout.write(result.stdout || '');
  process.stderr.write(result.stderr || '');
  if (result.status) throw new Error('local transaction regression failed');
}

async function main() {
  runLocal();
  if (!apiUrl) {
    console.log('[SKIP] transaction live idempotency requires WMS_API_URL or API_URL');
    return;
  }
  if (!isLocalApi() && process.env.WMS_ENABLE_LIVE_WRITE_TESTS !== 'true') {
    console.log('[SKIP] transaction live write test requires WMS_ENABLE_LIVE_WRITE_TESTS=true for non-local API URLs');
    return;
  }
  requireDedicatedCredentialsForRemote({
    apiUrl,
    tokenKeys: ['WMS_ACCESS_TOKEN', 'E2E_ADMIN_ACCESS_TOKEN', 'SMOKE_ADMIN_ACCESS_TOKEN', 'WMS_ADMIN_ACCESS_TOKEN'],
    credentialPairs: [['E2E_ADMIN_EMAIL', 'E2E_ADMIN_PASSWORD'], ['SMOKE_ADMIN_EMAIL', 'SMOKE_ADMIN_PASSWORD']],
    purpose: 'Transaction live write test',
  });
  const token = await accessToken();
  const headers = { authorization: `Bearer ${token}` };
  const fixture = await createFixture(headers);
  const transaction = await request('/outbounds', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      warehouseId: fixture.warehouse.id,
      note: 'Live isolated transaction idempotency test',
      items: [{ productId: fixture.product.id, locationId: fixture.location.id, quantity: 2, unitPrice: 1000 }],
    }),
  });

  const [first, second] = await Promise.allSettled([
    request(`/outbounds/${transaction.id}/confirm`, { method: 'POST', headers }),
    request(`/outbounds/${transaction.id}/confirm`, { method: 'POST', headers }),
  ]);
  const successes = [first, second].filter((item) => item.status === 'fulfilled');
  const failures = [first, second].filter((item) => item.status === 'rejected');
  assert.equal(successes.length, 1, `expected exactly one confirm to succeed, got ${successes.length}`);
  assert.equal(failures.length, 1, `expected exactly one confirm to fail, got ${failures.length}`);
  assert.match(String(failures[0].reason?.message || ''), /409|already|progress/i);

  const retry = await requestExpect(`/outbounds/${transaction.id}/confirm`, { method: 'POST', headers }, 409);
  assert.match(String(retry?.message || ''), /already confirmed|already in progress|Only DRAFT|CONFIRMED/i);
  const stock = await request(`/stock-levels?warehouseId=${fixture.warehouse.id}&productId=${fixture.product.id}`, { headers });
  const row = stock.find((item) => item.locationId === fixture.location.id);
  assert.equal(Number(row?.quantity || 0), 8);
  console.log('[OK] transaction live isolated idempotency test');
}

function isLocalApi() {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(apiBase);
}

async function accessToken() {
  const token = process.env.WMS_ACCESS_TOKEN || process.env.E2E_ADMIN_ACCESS_TOKEN || process.env.SMOKE_ADMIN_ACCESS_TOKEN || process.env.WMS_ADMIN_ACCESS_TOKEN;
  if (token) return token;
  const email = process.env.E2E_ADMIN_EMAIL || process.env.SMOKE_ADMIN_EMAIL || process.env.DEMO_ADMIN_EMAIL || process.env.BOOTSTRAP_ADMIN_EMAIL || 'admin@wms.local';
  const password = process.env.E2E_ADMIN_PASSWORD || process.env.SMOKE_ADMIN_PASSWORD || process.env.DEMO_ADMIN_PASSWORD || process.env.BOOTSTRAP_ADMIN_PASSWORD;
  if (!password) throw new Error('WMS_ACCESS_TOKEN/E2E_ADMIN_ACCESS_TOKEN/SMOKE_ADMIN_ACCESS_TOKEN or E2E_ADMIN_PASSWORD/SMOKE_ADMIN_PASSWORD/DEMO_ADMIN_PASSWORD/BOOTSTRAP_ADMIN_PASSWORD is required for live transaction test');
  const login = await request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
  return login.accessToken;
}

async function createFixture(headers) {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`.toUpperCase();
  const product = await request('/products', {
    method: 'POST',
    headers,
    body: JSON.stringify({ sku: `CRIT-TX-${suffix}`, name: `Critical transaction ${suffix}`, unit: 'cai', costPrice: 1000 }),
  });
  const warehouse = await request('/warehouses', {
    method: 'POST',
    headers,
    body: JSON.stringify({ code: `CTX-${suffix}`.slice(0, 50), name: `Critical transaction ${suffix}` }),
  });
  const location = await request(`/warehouses/${warehouse.id}/locations`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ code: 'A1', description: 'Critical transaction location' }),
  });
  await request('/stock-levels', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      productId: product.id,
      warehouseId: warehouse.id,
      locationId: location.id,
      quantity: 10,
      minQuantity: 0,
      reason: 'Live isolated transaction baseline',
    }),
  });
  return { product, warehouse, location };
}

async function requestExpect(path, options, status) {
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
  });
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (response.status !== status) throw new Error(`expected ${status}, got ${response.status} ${path}: ${data?.message || text}`);
  return data;
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

main().then(() => console.log('[OK] transaction idempotency checks')).catch((error) => {
  console.error(`[FAIL] transaction idempotency checks: ${error.message}`);
  process.exit(1);
});
