const fs = require('fs');
const path = require('path');

const REQUIRED = [
  'NODE_ENV',
  'JWT_SECRET',
  'INTERNAL_GATEWAY_TOKEN',
  'POSTGRES_PASSWORD',
  'RABBITMQ_DEFAULT_USER',
  'RABBITMQ_DEFAULT_PASS',
  'CORS_ORIGIN',
  'NEXT_PUBLIC_API_URL',
];
const WEAK_VALUES = new Set(['change-me-super-secret', 'postgres', 'guest', 'password', 'admin', 'changeme']);
const PLACEHOLDER_PATTERN = /replace-with|change-this|example|placeholder|your-|localhost-only/i;

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return false;
  const text = fs.readFileSync(file, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    process.env[key] = rawValue.replace(/^['"]|['"]$/g, '');
  }
  return true;
}

const envFile = process.env.PRODUCTION_ENV_FILE || path.resolve(__dirname, '..', '.env.production');
const loaded = loadEnvFile(envFile);

function fail(message) {
  console.error(`[FAIL] ${message}`);
  process.exitCode = 1;
}

for (const key of REQUIRED) {
  const value = process.env[key];
  if (!value) {
    fail(`${key} is required${loaded ? '' : ' (.env.production was not found and no process env value was provided)'}`);
    continue;
  }
  if (WEAK_VALUES.has(value.toLowerCase()) || PLACEHOLDER_PATTERN.test(value)) fail(`${key} uses an unsafe placeholder/default value`);
  if ((key.includes('SECRET') || key.includes('TOKEN')) && value.length < 32) fail(`${key} must be at least 32 characters`);
  if ((key.includes('PASSWORD') || key.endsWith('_PASS')) && value.length < 12) fail(`${key} must be at least 12 characters`);
}

if (process.env.NODE_ENV !== 'production') fail('NODE_ENV must be production for production deploy validation');
if (process.env.CORS_ORIGIN === '*') fail('CORS_ORIGIN must not be * in production');
if (process.env.JWT_SECRET && process.env.INTERNAL_GATEWAY_TOKEN && process.env.JWT_SECRET === process.env.INTERNAL_GATEWAY_TOKEN) {
  fail('JWT_SECRET and INTERNAL_GATEWAY_TOKEN must be different values');
}

if (process.env.BOOTSTRAP_ADMIN_EMAIL || process.env.BOOTSTRAP_ADMIN_PASSWORD) {
  if (!process.env.BOOTSTRAP_ADMIN_EMAIL) fail('BOOTSTRAP_ADMIN_EMAIL is required when BOOTSTRAP_ADMIN_PASSWORD is set');
  if (!process.env.BOOTSTRAP_ADMIN_PASSWORD) fail('BOOTSTRAP_ADMIN_PASSWORD is required when BOOTSTRAP_ADMIN_EMAIL is set');
  if (process.env.BOOTSTRAP_ADMIN_PASSWORD && process.env.BOOTSTRAP_ADMIN_PASSWORD.length < 12) fail('BOOTSTRAP_ADMIN_PASSWORD must be at least 12 characters');
  if (process.env.BOOTSTRAP_ADMIN_PASSWORD && PLACEHOLDER_PATTERN.test(process.env.BOOTSTRAP_ADMIN_PASSWORD)) fail('BOOTSTRAP_ADMIN_PASSWORD uses an unsafe placeholder/default value');
}

if (!process.exitCode) console.log(`[OK] Production environment looks safe (${loaded ? envFile : 'process env'})`);
