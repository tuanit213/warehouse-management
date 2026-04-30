const API = process.env.API_URL || 'http://localhost:3000/api';
const FRONTEND = process.env.FRONTEND_URL || 'http://localhost:3006';
const email = process.env.DEMO_ADMIN_EMAIL || 'admin@wms.local';
const password = process.env.DEMO_ADMIN_PASSWORD || 'Password@123';

async function assertOk(name, fn) {
  try {
    const result = await fn();
    console.log(`✅ ${name}`);
    return result;
  } catch (error) {
    console.error(`❌ ${name}: ${error.message}`);
    if (error.data) console.error(JSON.stringify(error.data, null, 2));
    process.exitCode = 1;
  }
}

async function request(url, options = {}) {
  const res = await fetch(url, { ...options, headers: { 'content-type': 'application/json', ...(options.headers || {}) } });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : text; } catch { data = text; }
  if (!res.ok) {
    const err = new Error(`${res.status} ${res.statusText}`);
    err.data = data;
    throw err;
  }
  return data;
}

(async () => {
  await assertOk('Frontend responds', () => request(FRONTEND));
  await assertOk('API Gateway health', () => request(`${API}/health`));
  const login = await assertOk('Demo admin login', () => request(`${API}/auth/login`, { method: 'POST', body: JSON.stringify({ email, password }) }));
  if (!login?.accessToken) process.exit(1);
  const headers = { authorization: `Bearer ${login.accessToken}` };
  await assertOk('Auth /me via Gateway', () => request(`${API}/auth/me`, { headers }));
  await assertOk('Product list via Gateway + PostgreSQL', () => request(`${API}/products?page=1&limit=5`, { headers }));
  await assertOk('Categories via Gateway + PostgreSQL', () => request(`${API}/categories`, { headers }));
  if (!process.exitCode) console.log('\n🎉 Smoke test passed. Demo is ready.');
})();
