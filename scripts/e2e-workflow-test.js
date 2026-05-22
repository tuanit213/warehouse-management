const assert = require('assert/strict');

const API = process.env.WMS_API_URL || process.env.API_URL;
const email = process.env.DEMO_ADMIN_EMAIL || 'admin@wms.local';
const password = process.env.DEMO_ADMIN_PASSWORD || 'Password@123';

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
  const login = await request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
  assert.ok(login.accessToken);
  const headers = { authorization: `Bearer ${login.accessToken}` };
  const products = await request('/products?page=1&limit=5', { headers });
  assert.ok(Array.isArray(products.data));
  const categories = await request('/categories', { headers });
  assert.ok(Array.isArray(categories));
  const reports = await request('/reports/summary', { headers });
  assert.ok(reports.generatedAt);
  console.log('[OK] E2E login/product/category/report smoke');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
