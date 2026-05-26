const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function run(args) {
  const result = spawnSync(process.execPath, ['scripts/migrate.js', ...args], { encoding: 'utf8' });
  process.stdout.write(result.stdout || '');
  process.stderr.write(result.stderr || '');
  if (result.status) throw new Error(`migration command failed: ${args.join(' ')}`);
}

try {
  run(['--dry-run', '--service', 'all', '--repeat', '2']);
  if (process.env.AUTH_DATABASE_URL || process.env.INVENTORY_DATABASE_URL || process.env.TRANSACTION_DATABASE_URL || process.env.DATABASE_URL) {
    run(['--preflight', '--service', 'all']);
  } else if (dockerStackRunning()) {
    runDockerPreflight();
  } else {
    console.log('[SKIP] migration DB preflight requires service DATABASE_URL env');
  }
  console.log('[OK] migration idempotency checks');
} catch (error) {
  console.error(`[FAIL] migration idempotency checks: ${error.message}`);
  process.exit(1);
}

function dockerStackRunning() {
  const result = spawnSync('docker', ['compose', 'ps', '--services', '--status', 'running'], { encoding: 'utf8' });
  return result.status === 0 && /auth-service-db/.test(result.stdout || '') && /inventory-service-db/.test(result.stdout || '') && /transaction-service-db/.test(result.stdout || '');
}

function loadEnvFile(file) {
  const env = {};
  if (!fs.existsSync(file)) return env;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
  return env;
}

function runDockerPreflight() {
  const env = { ...loadEnvFile(path.join(root, '.env.production')), ...process.env };
  const user = env.POSTGRES_USER || 'postgres';
  const checks = [
    {
      service: 'auth',
      container: 'auth-service-db',
      database: env.AUTH_DB || 'auth_db',
      checks: [
        ['invalid user roles', "SELECT count(*)::int FROM users WHERE role NOT IN ('ADMIN', 'MANAGER', 'WAREHOUSE_STAFF')"],
        ['invalid user statuses', "SELECT count(*)::int FROM users WHERE status NOT IN ('ACTIVE', 'DISABLED')"],
      ],
    },
    {
      service: 'inventory',
      container: 'inventory-service-db',
      database: env.INVENTORY_DB || 'inventory_db',
      checks: [
        ['duplicate stock level keys', `SELECT count(*)::int FROM (
          SELECT product_id, warehouse_id, location_id
          FROM stock_levels
          GROUP BY product_id, warehouse_id, location_id
          HAVING count(*) > 1
        ) duplicates`],
        ['negative stock level quantities', 'SELECT count(*)::int FROM stock_levels WHERE quantity < 0 OR min_quantity < 0'],
        ['negative stock movement balances', 'SELECT count(*)::int FROM stock_movements WHERE quantity_after < 0'],
      ],
    },
    {
      service: 'transaction',
      container: 'transaction-service-db',
      database: env.TRANSACTION_DB || 'transaction_db',
      checks: [
        ['invalid transaction statuses', "SELECT count(*)::int FROM stock_transactions WHERE status NOT IN ('DRAFT', 'CONFIRMING', 'CONFIRM_FAILED', 'CONFIRMED', 'CANCELLED')"],
      ],
    },
  ];

  for (const group of checks) {
    for (const [name, sql] of group.checks) {
      const count = Number(psqlCount(group.container, user, group.database, sql));
      if (count > 0) throw new Error(`${group.service} preflight failed: ${name} (${count})`);
      console.log(`[PREFLIGHT OK] ${group.service}: ${name}`);
    }
  }
}

function psqlCount(container, user, database, sql) {
  const result = spawnSync('docker', ['compose', 'exec', '-T', container, 'psql', '-U', user, '-d', database, '-tAc', sql], { encoding: 'utf8' });
  if (result.status) {
    process.stdout.write(result.stdout || '');
    process.stderr.write(result.stderr || '');
    throw new Error(`docker preflight query failed for ${container}`);
  }
  return String(result.stdout || '').trim();
}
