const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function makeEnv(overrides = {}) {
  return {
    NODE_ENV: 'production',
    JWT_SECRET: 'valid-jwt-secret-for-production-check-12345',
    INTERNAL_GATEWAY_TOKEN: 'valid-internal-token-for-prod-check-67890',
    POSTGRES_USER: 'wms_prod',
    POSTGRES_PASSWORD: 'valid-db-password-12345',
    RABBITMQ_DEFAULT_USER: 'wms_rabbit',
    RABBITMQ_DEFAULT_PASS: 'valid-rabbit-pass-12345',
    CORS_ORIGIN: 'https://wms.tuanit.vn',
    NEXT_PUBLIC_API_URL: 'https://api.tuanit.vn/api',
    PRODUCT_PUBLIC_BASE_URL: 'https://api.tuanit.vn/api',
    BOOTSTRAP_ADMIN_EMAIL: 'admin@tuanit.vn',
    BOOTSTRAP_ADMIN_PASSWORD: 'valid-bootstrap-pass-12345',
    ...overrides,
  };
}

function writeEnvFile(name, values) {
  const file = path.join(os.tmpdir(), `wms-${name}-${process.pid}.env`);
  const text = Object.entries(values)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  fs.writeFileSync(file, `${text}\n`, { encoding: 'utf8', mode: 0o600 });
  return file;
}

function runValidator(file) {
  return spawnSync('node', ['scripts/validate-production-env.js', '--active-profiles', 'none'], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, PRODUCTION_ENV_FILE: file },
  });
}

function expectPass(name, values) {
  const file = writeEnvFile(name, values);
  try {
    const result = runValidator(file);
    if (result.status !== 0) {
      process.stdout.write(result.stdout || '');
      process.stderr.write(result.stderr || '');
      throw new Error(`${name} expected production env validation to pass`);
    }
    console.log(`[OK] ${name}`);
  } finally {
    fs.rmSync(file, { force: true });
  }
}

function expectFail(name, values, expectedMessage) {
  const file = writeEnvFile(name, values);
  try {
    const result = runValidator(file);
    const output = `${result.stdout || ''}${result.stderr || ''}`;
    if (result.status === 0) {
      process.stdout.write(output);
      throw new Error(`${name} expected production env validation to fail`);
    }
    if (!output.includes(expectedMessage)) {
      process.stdout.write(output);
      throw new Error(`${name} failed with an unexpected message`);
    }
    console.log(`[OK] ${name}`);
  } finally {
    fs.rmSync(file, { force: true });
  }
}

expectPass('production-env-valid-postgres-user', makeEnv());
expectFail(
  'production-env-rejects-hyphenated-postgres-user',
  makeEnv({ POSTGRES_USER: 'wms-prod' }),
  'POSTGRES_USER must be a PostgreSQL role name',
);
