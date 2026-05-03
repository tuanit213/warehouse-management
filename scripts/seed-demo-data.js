const API = process.env.API_URL || 'http://localhost:3000/api';
const admin = {
  email: process.env.DEMO_ADMIN_EMAIL || 'admin@wms.local',
  password: process.env.DEMO_ADMIN_PASSWORD || 'Password@123',
  fullName: 'Demo Admin',
  role: 'ADMIN',
};

async function request(path, options = {}) {
  const res = await fetch(API + path, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const err = new Error(`${options.method || 'GET'} ${path} -> ${res.status}`);
    err.data = data;
    throw err;
  }
  return data;
}

async function main() {
  console.log(`Seeding demo data via ${API}`);
  let auth;
  try {
    auth = await request('/auth/register', { method: 'POST', body: JSON.stringify(admin) });
    console.log(`Created admin: ${admin.email}`);
  } catch (error) {
    const message = JSON.stringify(error.data || '');
    if (!message.includes('Email already exists')) throw error;
    auth = await request('/auth/login', { method: 'POST', body: JSON.stringify({ email: admin.email, password: admin.password }) });
    console.log(`Admin already exists, logged in: ${admin.email}`);
  }

  const token = auth.accessToken;
  const headers = { authorization: `Bearer ${token}` };

  const getOrCreateCategory = async (name) => {
    const existing = await request('/categories', { headers });
    const found = existing.find((category) => category.name === name);
    if (found) return found;
    return request('/categories', { method: 'POST', headers, body: JSON.stringify({ name }) });
  };

  const categoryNames = ['Vật tư đóng gói', 'Thiết bị kho', 'Nguyên vật liệu'];
  const categories = [];
  for (const name of categoryNames) {
    const category = await getOrCreateCategory(name);
    categories.push(category);
    console.log(`Category ready: ${category.name}`);
  }

  const productInputs = [
    { sku: 'DEMO-CARTON-A4', name: 'Thùng carton A4', description: 'Thùng đóng gói chuẩn A4', unit: 'cái', categoryId: categories[0].id, costPrice: 12000 },
    { sku: 'DEMO-TAPE-5CM', name: 'Băng keo trong 5cm', description: 'Băng keo đóng thùng', unit: 'cuộn', categoryId: categories[0].id, costPrice: 18000 },
    { sku: 'DEMO-PALLET-BLUE', name: 'Pallet nhựa xanh', description: 'Pallet kê hàng trong kho', unit: 'cái', categoryId: categories[1].id, costPrice: 240000 },
  ];
  const products = [];
  for (const product of productInputs) {
    const list = await request(`/products?keyword=${encodeURIComponent(product.sku)}&page=1&limit=10`, { headers });
    const found = list.data.find((item) => item.sku === product.sku);
    const ready = found || await request('/products', { method: 'POST', headers, body: JSON.stringify(product) });
    products.push(ready);
    console.log(`Product ready: ${ready.sku} - ${ready.name}`);
  }

  const getOrCreateWarehouse = async (warehouse) => {
    const warehouses = await request('/warehouses', { headers });
    const found = warehouses.find((item) => item.code === warehouse.code);
    return found || request('/warehouses', { method: 'POST', headers, body: JSON.stringify(warehouse) });
  };
  const hcm = await getOrCreateWarehouse({ code: 'WH-HCM', name: 'Kho Hồ Chí Minh', address: 'Khu công nghiệp Tân Bình, TP.HCM' });
  const hn = await getOrCreateWarehouse({ code: 'WH-HN', name: 'Kho Hà Nội', address: 'Khu công nghiệp Thăng Long, Hà Nội' });

  const getOrCreateLocation = async (warehouseId, location) => {
    const locations = await request(`/warehouses/${warehouseId}/locations`, { headers });
    const found = locations.find((item) => item.code === location.code);
    return found || request(`/warehouses/${warehouseId}/locations`, { method: 'POST', headers, body: JSON.stringify(location) });
  };
  const hcmA01 = await getOrCreateLocation(hcm.id, { code: 'A-01', description: 'Kệ A, tầng 01' });
  const hcmB02 = await getOrCreateLocation(hcm.id, { code: 'B-02', description: 'Kệ B, hàng dễ lấy' });
  const hn01 = await getOrCreateLocation(hn.id, { code: 'HN-01', description: 'Khu nhận hàng Hà Nội' });

  const stockInputs = [
    { productId: products[0].id, warehouseId: hcm.id, locationId: hcmA01.id, quantity: 12, minQuantity: 20 },
    { productId: products[1].id, warehouseId: hcm.id, locationId: hcmB02.id, quantity: 80, minQuantity: 15 },
    { productId: products[2].id, warehouseId: hn.id, locationId: hn01.id, quantity: 6, minQuantity: 10 },
  ];
  for (const stock of stockInputs) {
    await request('/stock-levels', { method: 'POST', headers, body: JSON.stringify(stock) });
    console.log(`Stock ready: ${stock.productId} @ ${stock.warehouseId}`);
  }


  const suppliers = await request('/suppliers', { headers });
  const demoSupplier = suppliers.find((item) => item.code === 'DEMO-SUP')
    || await request('/suppliers', { method: 'POST', headers, body: JSON.stringify({ code: 'DEMO-SUP', name: 'Nhà cung cấp demo', phone: '0900000000', address: 'TP.HCM' }) });
  const inbound = await request('/inbounds', { method: 'POST', headers, body: JSON.stringify({ warehouseId: hcm.id, supplierId: demoSupplier.id, note: 'Demo nhập kho đồng bộ tồn kho', items: [{ productId: products[0].id, locationId: hcmA01.id, quantity: 3, unitPrice: 12000 }] }) });
  await request(`/inbounds/${inbound.id}/confirm`, { method: 'POST', headers });
  const outbound = await request('/outbounds', { method: 'POST', headers, body: JSON.stringify({ warehouseId: hcm.id, note: 'Demo xuất kho đồng bộ tồn kho', items: [{ productId: products[1].id, locationId: hcmB02.id, quantity: 1, unitPrice: 18000 }] }) });
  await request(`/outbounds/${outbound.id}/confirm`, { method: 'POST', headers });
  console.log(`Transactions ready: ${inbound.code}, ${outbound.code}`);
  const list = await request('/products?keyword=DEMO&page=1&limit=10', { headers });
  const warehouses = await request('/warehouses', { headers });
  const stockLevels = await request('/stock-levels', { headers });
  console.log(`Product search OK. Total demo-ish products: ${list.meta.total}`);
  console.log(`Inventory OK. Warehouses: ${warehouses.length}, stock levels: ${stockLevels.length}`);
  console.log('\nDemo account:');
  console.log(`  email: ${admin.email}`);
  console.log(`  password: ${admin.password}`);
  console.log('\nURLs:');
  console.log('  Frontend: http://localhost:3006');
  console.log('  API Gateway: http://localhost:3000/api/health');
  console.log('  RabbitMQ UI: http://localhost:15672 (guest/guest)');
}

main().catch((error) => {
  console.error('Seed failed:', error.message);
  if (error.data) console.error(JSON.stringify(error.data, null, 2));
  process.exit(1);
});

