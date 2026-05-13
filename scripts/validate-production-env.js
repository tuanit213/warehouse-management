const REQUIRED = ['JWT_SECRET', 'POSTGRES_PASSWORD', 'RABBITMQ_DEFAULT_PASS'];
const WEAK_VALUES = new Set(['change-me-super-secret', 'postgres', 'guest', 'password', 'admin']);

function fail(message) {
  console.error(`[FAIL] ${message}`);
  process.exitCode = 1;
}

for (const key of REQUIRED) {
  const value = process.env[key];
  if (!value) {
    fail(`${key} is required`);
    continue;
  }
  if (WEAK_VALUES.has(value)) fail(`${key} uses an unsafe default value`);
  if (key.includes('SECRET') && value.length < 32) fail(`${key} must be at least 32 characters`);
  if (key.includes('PASSWORD') && value.length < 12) fail(`${key} must be at least 12 characters`);
}

if (process.env.NODE_ENV !== 'production') fail('NODE_ENV must be production for production deploy validation');

if (!process.exitCode) console.log('[OK] Production environment looks safe');
