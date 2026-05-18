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

async function requestBuffer(url, options = {}) {
  const res = await fetch(url, { ...options, headers: { ...(options.headers || {}) } });
  const buffer = Buffer.from(await res.arrayBuffer());
  if (!res.ok) { const err = new Error(`${res.status} ${res.statusText}`); err.data = buffer.toString('utf8').slice(0, 300); throw err; }
  return { buffer, contentType: res.headers.get('content-type') || '' };
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
  await assertOk('API Gateway readiness', () => request(`${API}/health/ready`));
  const login = await assertOk('Demo admin login', () => request(`${API}/auth/login`, { method: 'POST', body: JSON.stringify({ email, password }) }));
  const refreshed = await assertOk('Auth refresh token rotation', () => request(`${API}/auth/refresh`, { method: 'POST', body: JSON.stringify({ refreshToken: login.refreshToken }) }));
  const headers = { authorization: `Bearer ${refreshed.accessToken}` };

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
  const cancelInbound = await assertOk('Create cancellable inbound draft', () => request(`${API}/inbounds`, { method: 'POST', headers, body: JSON.stringify({ warehouseId: warehouse.id, supplierId: supplier.id, note: 'Smoke cancel inbound', items: [{ productId: product.id, locationId: location.id, quantity: 1, unitPrice: 1000 }] }) }));
  await assertOk('Cancel inbound draft', () => request(`${API}/inbounds/${cancelInbound.id}/cancel`, { method: 'POST', headers }));
  await assertOk('Confirm inbound', () => request(`${API}/inbounds/${inbound.id}/confirm`, { method: 'POST', headers }));
  await assertOk('Inbound PDF export via Gateway', async () => {
    const pdf = await requestBuffer(`${API}/inbounds/${inbound.id}/pdf`, { headers });
    if (!pdf.contentType.includes('application/pdf')) throw new Error(`Unexpected PDF content type: ${pdf.contentType}`);
    if (pdf.buffer.subarray(0, 5).toString() !== '%PDF-') throw new Error('Inbound PDF is not a valid PDF response');
    if (pdf.buffer.length < 1000) throw new Error('Inbound PDF response is unexpectedly small');
  });
  const inboundQuantity = stockAtLocation(await request(`${API}/stock-levels?warehouseId=${warehouse.id}&productId=${product.id}`, { headers }));
  if (inboundQuantity < beforeQuantity + 10) throw new Error('Inbound did not increase stock at smoke location');

  const outbound = await assertOk('Create outbound draft', () => request(`${API}/outbounds`, { method: 'POST', headers, body: JSON.stringify({ warehouseId: warehouse.id, note: 'Smoke outbound', items: [{ productId: product.id, locationId: location.id, quantity: 2, unitPrice: 1000 }] }) }));
  await assertOk('Confirm outbound', () => request(`${API}/outbounds/${outbound.id}/confirm`, { method: 'POST', headers }));
  await assertOk('Reject duplicate confirm', async () => {
    try { await request(`${API}/outbounds/${outbound.id}/confirm`, { method: 'POST', headers }); } catch (error) { if (error.message.startsWith('409')) return true; throw error; }
    throw new Error('Duplicate confirm unexpectedly succeeded');
  });
  const outboundQuantity = stockAtLocation(await request(`${API}/stock-levels?warehouseId=${warehouse.id}&productId=${product.id}`, { headers }));
  if (outboundQuantity !== inboundQuantity - 2) throw new Error('Outbound did not decrease stock at smoke location');
  await assertOk('Stock movements via Gateway', () => request(`${API}/stock-movements?warehouseId=${warehouse.id}&productId=${product.id}`, { headers }));
  await assertOk('Report summary via Gateway', () => request(`${API}/reports/summary`, { headers }));
  await assertOk('Report low stock via Gateway', () => request(`${API}/reports/low-stock`, { headers }));
  await assertOk('Report stock movements via Gateway', () => request(`${API}/reports/stock-movements`, { headers }));
  await assertOk('Report movement export via Gateway', () => request(`${API}/reports/export/excel?kind=movements`, { headers }));

  await assertOk('Transactions via Gateway', () => request(`${API}/transactions`, { headers }));
  console.log('\nSmoke test passed. Demo is ready.');
})().catch(() => process.exit(1));
