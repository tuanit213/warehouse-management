const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const apiUrl = process.env.WMS_API_URL || process.env.API_URL || '';

async function main() {
  const dto = fs.readFileSync(path.join(root, 'services/auth-service/src/dto.ts'), 'utf8');
  const service = fs.readFileSync(path.join(root, 'services/auth-service/src/auth.service.ts'), 'utf8');
  const registerDto = dto.match(/export class RegisterDto \{[\s\S]*?\n\}/)?.[0] || '';
  assert.ok(registerDto, 'RegisterDto not found');
  assert.doesNotMatch(registerDto, /role[!?]?:/);
  assert.match(service, /const role: Role = 'WAREHOUSE_STAFF'/);
  assert.match(service, /WHERE rt\.id=\$1/);
  assert.match(service, /reuse_detected_at/);

  if (!apiUrl) {
    console.log('[SKIP] auth live API checks require WMS_API_URL or API_URL');
    return;
  }

  const email = `critical-${Date.now()}@wms.local`;
  const password = `Password@${Date.now()}`;
  const register = await json('/auth/register', { email, password, fullName: 'Critical Test', role: 'ADMIN' });
  assert.equal(register.user.role, 'WAREHOUSE_STAFF');
  const login = await json('/auth/login', { email, password });
  assert.ok(login.accessToken);
  assert.ok(login.refreshToken);
  const refreshed = await json('/auth/refresh', { refreshToken: login.refreshToken });
  assert.ok(refreshed.accessToken);
  await json('/auth/logout', { refreshToken: refreshed.refreshToken }, refreshed.accessToken);
}

async function json(pathname, body, token) {
  const response = await fetch(`${apiUrl.replace(/\/$/, '')}${pathname}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(`${pathname} failed: ${response.status} ${data.message || response.statusText}`);
  return data;
}

main().then(() => console.log('[OK] auth critical checks')).catch((error) => {
  console.error(`[FAIL] auth critical checks: ${error.message}`);
  process.exit(1);
});
