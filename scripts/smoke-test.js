const fs = require('node:fs');
const path = require('node:path');

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
}

loadEnvFile(path.resolve(__dirname, '..', '.env.production'));

const API = process.env.API_URL || 'http://localhost:3000/api';
const FRONTEND = process.env.FRONTEND_URL || 'http://localhost:3006';
const email = process.env.DEMO_ADMIN_EMAIL || process.env.BOOTSTRAP_ADMIN_EMAIL || 'admin@wms.local';
const password = process.env.DEMO_ADMIN_PASSWORD || process.env.BOOTSTRAP_ADMIN_PASSWORD || process.env.POSTGRES_PASSWORD || 'Password@123';

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

async function ensureLocation(headers, warehouse, code = 'SMOKE-LOC', description = 'Smoke test location') {
  const locations = await request(`${API}/warehouses/${warehouse.id}/locations`, { headers });
  return locations.find((item) => item.code === code) || request(`${API}/warehouses/${warehouse.id}/locations`, { method: 'POST', headers, body: JSON.stringify({ code, description }) });
}

async function upsertSmokeStock(headers, payload) {
  try {
    return await request(`${API}/stock-levels`, { method: 'POST', headers, body: JSON.stringify({ ...payload, reason: 'Smoke test stock baseline' }) });
  } catch (error) {
    const messages = Array.isArray(error.data?.message) ? error.data.message : [];
    if (messages.some((message) => /property reason should not exist/.test(message))) {
      return request(`${API}/stock-levels`, { method: 'POST', headers, body: JSON.stringify(payload) });
    }
    throw error;
  }
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
  await assertOk('Product CSV export via Gateway', async () => {
    const csv = await requestBuffer(`${API}/products/export/csv`, { headers });
    if (!csv.contentType.includes('text/csv')) throw new Error(`Unexpected product CSV content type: ${csv.contentType}`);
    if (!csv.buffer.toString('utf8').includes('sku,name,unit')) throw new Error('Product CSV export does not include expected header');
  });
  await assertOk('Categories via Gateway + PostgreSQL', () => request(`${API}/categories`, { headers }));

  const warehouses = await assertOk('Warehouses via Gateway + PostgreSQL', () => request(`${API}/warehouses`, { headers }));
  const warehouse = warehouses.find((item) => item.code === 'SMOKE-WH') || await request(`${API}/warehouses`, { method: 'POST', headers, body: JSON.stringify({ code: 'SMOKE-WH', name: 'Kho smoke test', address: 'Demo smoke test' }) });
  const location = await assertOk('Warehouse locations via Gateway', () => ensureLocation(headers, warehouse));
  const transferWarehouse = warehouses.find((item) => item.code === 'SMOKE-WH-TRANSFER') || await request(`${API}/warehouses`, { method: 'POST', headers, body: JSON.stringify({ code: 'SMOKE-WH-TRANSFER', name: 'Transfer smoke warehouse', address: 'Demo smoke test' }) });
  const transferLocation = await assertOk('Transfer warehouse locations via Gateway', () => ensureLocation(headers, transferWarehouse, 'SMOKE-TRANSFER-LOC', 'Smoke transfer destination'));
  await assertOk('Stock levels via Gateway', () => request(`${API}/stock-levels`, { headers }));
  await assertOk('Low stock alerts via Gateway', () => request(`${API}/stock-alerts/low-stock`, { headers }));

  const product = await ensureProduct(headers);
  const suppliers = await assertOk('Suppliers via Gateway', () => request(`${API}/suppliers`, { headers }));
  const supplier = suppliers.find((item) => item.code === 'SMOKE-SUP') || await request(`${API}/suppliers`, { method: 'POST', headers, body: JSON.stringify({ code: 'SMOKE-SUP', name: 'Nhà cung cấp smoke', phone: '0900000000' }) });

  await assertOk('Seed deterministic smoke stock', () => upsertSmokeStock(headers, { productId: product.id, warehouseId: warehouse.id, locationId: location.id, quantity: 100, minQuantity: 0 }));
  const beforeStock = await request(`${API}/stock-levels?warehouseId=${warehouse.id}&productId=${product.id}`, { headers });
  const stockAtLocation = (rows, locationId = location.id) => Number(rows.find((item) => item.locationId === locationId)?.quantity || 0);
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
  const transferDestinationBefore = stockAtLocation(await request(`${API}/stock-levels?warehouseId=${transferWarehouse.id}&productId=${product.id}`, { headers }), transferLocation.id);
  await assertOk('Transfer stock between warehouses via Gateway', () => request(`${API}/stock-transfers`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      productId: product.id,
      fromWarehouseId: warehouse.id,
      fromLocationId: location.id,
      toWarehouseId: transferWarehouse.id,
      toLocationId: transferLocation.id,
      quantity: 3,
      reason: 'Smoke stock transfer',
    }),
  }));
  const sourceAfterTransfer = stockAtLocation(await request(`${API}/stock-levels?warehouseId=${warehouse.id}&productId=${product.id}`, { headers }));
  const destinationAfterTransfer = stockAtLocation(await request(`${API}/stock-levels?warehouseId=${transferWarehouse.id}&productId=${product.id}`, { headers }), transferLocation.id);
  if (sourceAfterTransfer !== outboundQuantity - 3) throw new Error('Stock transfer did not decrease source location');
  if (destinationAfterTransfer !== transferDestinationBefore + 3) throw new Error('Stock transfer did not increase destination location');
  await assertOk('Stock movements via Gateway', () => request(`${API}/stock-movements?warehouseId=${warehouse.id}&productId=${product.id}`, { headers }));
  await assertOk('Report summary via Gateway', () => request(`${API}/reports/summary`, { headers }));
  await assertOk('Report low stock via Gateway', () => request(`${API}/reports/low-stock`, { headers }));
  await assertOk('Report stock movements via Gateway', () => request(`${API}/reports/stock-movements`, { headers }));
  await assertOk('Report movement Excel export via Gateway', async () => {
    const xlsx = await requestBuffer(`${API}/reports/export/excel?kind=movements`, { headers });
    if (!xlsx.contentType.includes('spreadsheetml.sheet')) throw new Error(`Unexpected Excel content type: ${xlsx.contentType}`);
    if (xlsx.buffer.subarray(0, 2).toString('utf8') !== 'PK') throw new Error('Excel export is not an XLSX/ZIP response');
    if (xlsx.buffer.length < 1000) throw new Error('Excel export response is unexpectedly small');
  });

  await assertOk('Transactions via Gateway', () => request(`${API}/transactions`, { headers }));
  console.log('\nSmoke test passed. Demo is ready.');
})().catch(() => process.exit(1));
