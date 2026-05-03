const API = process.env.API_URL || 'http://localhost:3000/api';
const FRONTEND = process.env.FRONTEND_URL || 'http://localhost:3006';
const email = process.env.DEMO_ADMIN_EMAIL || 'admin@wms.local';
const password = process.env.DEMO_ADMIN_PASSWORD || 'Password@123';

async function assertOk(name, fn) {
  try {
    const result = await fn();
    console.log(`[OK] ${name}`);
    return result;
  } catch (error) {
    console.error(`[FAIL] ${name}: ${error.message}`);
    if (error.data) console.error(JSON.stringify(error.data, null, 2));
    process.exitCode = 1;
    throw error;
  }
}

async function request(url, options = {}) {
  const res = await fetch(url, { ...options, headers: { 'content-type': 'application/json', ...(options.headers || {}) } });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : text; } catch { data = text; }
  if (!res.ok) { const err = new Error(`${res.status} ${res.statusText}`); err.data = data; throw err; }
  return data;
}

async function ensureProduct(headers) {
  const list = await request(`${API}/products?keyword=SMOKE-TX-SKU&page=1&limit=20`, { headers });
  const found = list?.data?.find((item) => item.sku === 'SMOKE-TX-SKU');
  return found || request(`${API}/products`, { method: 'POST', headers, body: JSON.stringify({ sku: 'SMOKE-TX-SKU', name: 'Smoke transaction SKU', unit: 'cái', costPrice: 1000 }) });
}

async function ensureLocation(headers, warehouse) {
  const locations = await request(`${API}/warehouses/${warehouse.id}/locations`, { headers });
  return locations.find((item) => item.code === 'SMOKE-LOC') || request(`${API}/warehouses/${warehouse.id}/locations`, { method: 'POST', headers, body: JSON.stringify({ code: 'SMOKE-LOC', description: 'Vị trí smoke test' }) });
}

(async () => {
  await assertOk('Frontend responds', () => request(FRONTEND));
  await assertOk('API Gateway health', () => request(`${API}/health`));
  const login = await assertOk('Demo admin login', () => request(`${API}/auth/login`, { method: 'POST', body: JSON.stringify({ email, password }) }));
  const headers = { authorization: `Bearer ${login.accessToken}` };

  await assertOk('Auth /me via Gateway', () => request(`${API}/auth/me`, { headers }));
  await assertOk('Product list via Gateway + PostgreSQL', () => request(`${API}/products?page=1&limit=5`, { headers }));
  await assertOk('Categories via Gateway + PostgreSQL', () => request(`${API}/categories`, { headers }));

  const warehouses = await assertOk('Warehouses via Gateway + PostgreSQL', () => request(`${API}/warehouses`, { headers }));
  const warehouse = warehouses.find((item) => item.code === 'SMOKE-WH') || await request(`${API}/warehouses`, { method: 'POST', headers, body: JSON.stringify({ code: 'SMOKE-WH', name: 'Kho smoke test', address: 'Demo smoke test' }) });
  const location = await assertOk('Warehouse locations via Gateway', () => ensureLocation(headers, warehouse));
  await assertOk('Stock levels via Gateway', () => request(`${API}/stock-levels`, { headers }));
  await assertOk('Low stock alerts via Gateway', () => request(`${API}/stock-alerts/low-stock`, { headers }));

  const product = await ensureProduct(headers);
  const suppliers = await assertOk('Suppliers via Gateway', () => request(`${API}/suppliers`, { headers }));
  const supplier = suppliers.find((item) => item.code === 'SMOKE-SUP') || await request(`${API}/suppliers`, { method: 'POST', headers, body: JSON.stringify({ code: 'SMOKE-SUP', name: 'Nhà cung cấp smoke', phone: '0900000000' }) });

  await assertOk('Seed deterministic smoke stock', () => request(`${API}/stock-levels`, { method: 'POST', headers, body: JSON.stringify({ productId: product.id, warehouseId: warehouse.id, locationId: location.id, quantity: 100, minQuantity: 0 }) }));
  const beforeStock = await request(`${API}/stock-levels?warehouseId=${warehouse.id}&productId=${product.id}`, { headers });
  const stockAtLocation = (rows) => Number(rows.find((item) => item.locationId === location.id)?.quantity || 0);
  const beforeQuantity = stockAtLocation(beforeStock);

  const inbound = await assertOk('Create inbound draft', () => request(`${API}/inbounds`, { method: 'POST', headers, body: JSON.stringify({ warehouseId: warehouse.id, supplierId: supplier.id, note: 'Smoke inbound', items: [{ productId: product.id, locationId: location.id, quantity: 10, unitPrice: 1000 }] }) }));
  await assertOk('Confirm inbound', () => request(`${API}/inbounds/${inbound.id}/confirm`, { method: 'POST', headers }));
  const inboundQuantity = stockAtLocation(await request(`${API}/stock-levels?warehouseId=${warehouse.id}&productId=${product.id}`, { headers }));
  if (inboundQuantity < beforeQuantity + 10) throw new Error('Inbound did not increase stock at smoke location');

  const outbound = await assertOk('Create outbound draft', () => request(`${API}/outbounds`, { method: 'POST', headers, body: JSON.stringify({ warehouseId: warehouse.id, note: 'Smoke outbound', items: [{ productId: product.id, locationId: location.id, quantity: 2, unitPrice: 1000 }] }) }));
  await assertOk('Confirm outbound', () => request(`${API}/outbounds/${outbound.id}/confirm`, { method: 'POST', headers }));
  const outboundQuantity = stockAtLocation(await request(`${API}/stock-levels?warehouseId=${warehouse.id}&productId=${product.id}`, { headers }));
  if (outboundQuantity !== inboundQuantity - 2) throw new Error('Outbound did not decrease stock at smoke location');

  await assertOk('Transactions via Gateway', () => request(`${API}/transactions`, { headers }));
  console.log('\nSmoke test passed. Demo is ready.');
})().catch(() => process.exit(1));
