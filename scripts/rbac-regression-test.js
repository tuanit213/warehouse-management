const assert = require('node:assert/strict');

async function test(name, fn) {
  try {
    await fn();
    console.log(`[OK] ${name}`);
  } catch (error) {
    console.error(`[FAIL] ${name}: ${error.message}`);
    process.exitCode = 1;
  }
}

function normalizeRole(role) {
  if (!['ADMIN', 'MANAGER', 'WAREHOUSE_STAFF'].includes(role)) throw new Error(`Unsupported role: ${role}`);
  return role;
}

function canAccess(role, method, path) {
  role = normalizeRole(role);
  if (role === 'ADMIN') return true;
  if (path.startsWith('/reports')) return role === 'MANAGER';
  if (/^\/(inventory|warehouses|locations|stock-levels|stock-alerts|stock-movements)/.test(path)) {
    if (method === 'GET') return ['MANAGER', 'WAREHOUSE_STAFF'].includes(role);
    return role === 'WAREHOUSE_STAFF';
  }
  if (/^\/(transactions?|suppliers|inbounds|outbounds)/.test(path)) return ['MANAGER', 'WAREHOUSE_STAFF'].includes(role);
  if (/^\/(products?|categories)/.test(path)) {
    if (method === 'GET') return ['MANAGER', 'WAREHOUSE_STAFF'].includes(role);
    return role === 'MANAGER';
  }
  return true;
}

(async () => {
  await test('RBAC manager can read reports', () => assert.equal(canAccess('MANAGER', 'GET', '/reports/summary'), true));
  await test('RBAC staff cannot read reports', () => assert.equal(canAccess('WAREHOUSE_STAFF', 'GET', '/reports/summary'), false));
  await test('RBAC staff can adjust inventory', () => assert.equal(canAccess('WAREHOUSE_STAFF', 'POST', '/stock-levels'), true));
  await test('RBAC manager cannot adjust inventory', () => assert.equal(canAccess('MANAGER', 'POST', '/stock-levels'), false));
  await test('RBAC manager can maintain products', () => assert.equal(canAccess('MANAGER', 'POST', '/products'), true));
  await test('RBAC staff cannot maintain products', () => assert.equal(canAccess('WAREHOUSE_STAFF', 'POST', '/products'), false));
  await test('RBAC admin can access everything', () => assert.equal(canAccess('ADMIN', 'DELETE', '/auth/users/1'), true));
  if (process.exitCode) process.exit(1);
})();
