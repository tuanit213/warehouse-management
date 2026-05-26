const assert = require('assert/strict');
const { requireDedicatedCredentialsForRemote } = require('./lib/env-safety');

const API = process.env.WMS_API_URL || process.env.API_URL;
const adminAccessToken = process.env.E2E_ADMIN_ACCESS_TOKEN || process.env.SMOKE_ADMIN_ACCESS_TOKEN || process.env.WMS_ADMIN_ACCESS_TOKEN;
const email = process.env.E2E_ADMIN_EMAIL || process.env.SMOKE_ADMIN_EMAIL || process.env.DEMO_ADMIN_EMAIL || process.env.BOOTSTRAP_ADMIN_EMAIL || 'admin@wms.local';
const password = process.env.E2E_ADMIN_PASSWORD || process.env.SMOKE_ADMIN_PASSWORD || process.env.DEMO_ADMIN_PASSWORD || process.env.BOOTSTRAP_ADMIN_PASSWORD || 'Password@123';

async function request(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(`${response.status} ${path}: ${data?.message || text}`);
  return data;
}

async function main() {
  if (!API) {
    console.log('[SKIP] E2E workflow checks require WMS_API_URL or API_URL');
    return;
  }
  requireDedicatedCredentialsForRemote({
    apiUrl: API,
    purpose: 'E2E workflow test',
    tokenKeys: ['E2E_ADMIN_ACCESS_TOKEN', 'SMOKE_ADMIN_ACCESS_TOKEN', 'WMS_ADMIN_ACCESS_TOKEN'],
    credentialPairs: [['E2E_ADMIN_EMAIL', 'E2E_ADMIN_PASSWORD'], ['SMOKE_ADMIN_EMAIL', 'SMOKE_ADMIN_PASSWORD']],
  });
  const headers = adminAccessToken ? { authorization: `Bearer ${adminAccessToken}` } : await loginHeaders();
  const products = await request('/products?page=1&limit=5', { headers });
  assert.ok(Array.isArray(products.data));
  const categories = await request('/categories', { headers });
  assert.ok(Array.isArray(categories));
  const reports = await request('/reports/summary', { headers });
  assert.ok(reports.generatedAt);
  console.log('[OK] E2E login/product/category/report smoke');
}

async function loginHeaders() {
  const login = await request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
  assert.ok(login.accessToken);
  return { authorization: `Bearer ${login.accessToken}` };
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
