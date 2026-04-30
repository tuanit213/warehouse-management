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

  const categoryNames = ['Vật tư đóng gói', 'Thiết bị kho', 'Nguyên vật liệu'];
  const categories = [];
  for (const name of categoryNames) {
    const category = await request('/categories', { method: 'POST', headers, body: JSON.stringify({ name }) });
    categories.push(category);
    console.log(`Created category: ${category.name}`);
  }

  const products = [
    { sku: `DEMO-CARTON-${Date.now()}`, name: 'Thùng carton A4', description: 'Thùng đóng gói chuẩn A4', unit: 'cái', categoryId: categories[0].id, costPrice: 12000 },
    { sku: `DEMO-TAPE-${Date.now()}`, name: 'Băng keo trong 5cm', description: 'Băng keo đóng thùng', unit: 'cuộn', categoryId: categories[0].id, costPrice: 18000 },
    { sku: `DEMO-PALLET-${Date.now()}`, name: 'Pallet nhựa xanh', description: 'Pallet kê hàng trong kho', unit: 'cái', categoryId: categories[1].id, costPrice: 240000 },
  ];
  for (const product of products) {
    const created = await request('/products', { method: 'POST', headers, body: JSON.stringify(product) });
    console.log(`Created product: ${created.sku} - ${created.name}`);
  }

  const list = await request('/products?keyword=DEMO&page=1&limit=10', { headers });
  console.log(`Product search OK. Total demo-ish products: ${list.meta.total}`);
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
