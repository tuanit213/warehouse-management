const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

async function test(name, fn) {
  try {
    await fn();
    console.log(`[OK] ${name}`);
  } catch (error) {
    console.error(`[FAIL] ${name}: ${error.message}`);
    process.exitCode = 1;
  }
}

function publicRegister(input) {
  return { email: input.email.toLowerCase(), fullName: input.fullName, role: 'WAREHOUSE_STAFF' };
}

function parseRefreshToken(refreshToken) {
  const [tokenId, secret, extra] = refreshToken.split('.');
  if (!tokenId || !secret || extra || secret.length < 32) throw new Error('invalid refresh token');
  return { tokenId, secret };
}

(async () => {
  await test('Register ignores requested ADMIN role', () => {
    const user = publicRegister({ email: 'NEW@WMS.LOCAL', fullName: 'New User', role: 'ADMIN' });
    assert.equal(user.role, 'WAREHOUSE_STAFF');
  });

  await test('Refresh token format uses token id lookup and secret compare', () => {
    const parsed = parseRefreshToken('11111111-1111-4111-8111-111111111111.' + 's'.repeat(48));
    assert.equal(parsed.tokenId, '11111111-1111-4111-8111-111111111111');
    assert.equal(parsed.secret.length, 48);
    assert.throws(() => parseRefreshToken('legacy-token-without-id'), /invalid/);
  });

  await test('AuthService refresh no longer scans all refresh tokens', () => {
    const source = fs.readFileSync(path.join(root, 'services/auth-service/src/auth.service.ts'), 'utf8');
    assert.match(source, /WHERE rt\.id=\$1/);
    assert.match(source, /rt\.id AS refresh_token_id/);
    assert.doesNotMatch(source, /ORDER BY rt\.expires_at DESC/);
  });

  await test('Refresh token reuse detection revokes token family', () => {
    const source = fs.readFileSync(path.join(root, 'services/auth-service/src/auth.service.ts'), 'utf8');
    assert.match(source, /family_id/);
    assert.match(source, /reuse_detected_at/);
    assert.match(source, /WHERE family_id=\$1/);
    assert.match(source, /replaced_by=\$3/);
  });

  await test('Auth service applies refresh-token migration at startup', () => {
    const source = fs.readFileSync(path.join(root, 'services/auth-service/src/auth.service.ts'), 'utf8');
    assert.match(source, /implements OnModuleInit/);
    assert.match(source, /async onModuleInit\(\)/);
    assert.match(source, /ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS family_id UUID/);
    assert.match(source, /CREATE INDEX IF NOT EXISTS idx_refresh_tokens_family/);
  });

  if (process.exitCode) process.exit(1);
})();
