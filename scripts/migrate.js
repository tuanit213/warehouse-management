const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');

const root = path.resolve(__dirname, '..');
const migrationsRoot = path.join(root, 'database', 'migrations');
const services = ['auth', 'inventory', 'transaction'];

function usage() {
  console.log('Usage: node scripts/migrate.js [--service auth|inventory|transaction|all] [--database-url postgresql://...] [--dry-run] [--preflight] [--repeat 2]');
  console.log('Database URL lookup order: --database-url, <SERVICE>_DATABASE_URL, <SERVICE>_SERVICE_DATABASE_URL, DATABASE_URL_<SERVICE>, DATABASE_URL.');
}

function parseArgs(argv) {
  const args = { service: 'all', dryRun: false, preflight: false, repeat: 1, databaseUrl: '' };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--service') args.service = argv[++i];
    else if (arg === '--database-url') args.databaseUrl = argv[++i];
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--preflight') args.preflight = true;
    else if (arg === '--repeat') args.repeat = Number(argv[++i] || 1);
    else if (arg === '--help') {
      usage();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (args.service !== 'all' && !services.includes(args.service)) throw new Error(`Unsupported service: ${args.service}`);
  if (args.dryRun && args.preflight) throw new Error('Use either --dry-run or --preflight, not both');
  if (!Number.isInteger(args.repeat) || args.repeat < 1) throw new Error('--repeat must be a positive integer');
  return args;
}

function envName(service) {
  return `${service.toUpperCase()}_DATABASE_URL`;
}

function databaseUrl(service, explicitUrl) {
  const upper = service.toUpperCase();
  return explicitUrl
    || process.env[`${upper}_DATABASE_URL`]
    || process.env[`${upper}_SERVICE_DATABASE_URL`]
    || process.env[`DATABASE_URL_${upper}`]
    || process.env[`${upper}_DB_URL`]
    || process.env.DATABASE_URL;
}

function readMigrations(service) {
  const dir = path.join(migrationsRoot, service);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((file) => /^\d+_.+\.sql$/.test(file))
    .sort()
    .map((file) => ({
      service,
      version: file.replace(/\.sql$/, ''),
      file,
      path: path.join(dir, file),
      sql: fs.readFileSync(path.join(dir, file), 'utf8'),
    }));
}

function validatePlan(migrations) {
  const seen = new Set();
  for (const migration of migrations) {
    const key = `${migration.service}:${migration.version}`;
    if (seen.has(key)) throw new Error(`Duplicate migration version: ${key}`);
    seen.add(key);
    if (!migration.sql.trim()) throw new Error(`Empty migration: ${migration.service}/${migration.file}`);
  }
}

async function ensureMigrationTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      service VARCHAR(80) NOT NULL,
      version VARCHAR(160) NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(service, version)
    )
  `);
}

const preflightChecks = {
  auth: [
    {
      name: 'invalid user roles',
      sql: "SELECT count(*)::int AS count FROM users WHERE role NOT IN ('ADMIN', 'MANAGER', 'WAREHOUSE_STAFF')",
    },
    {
      name: 'invalid user statuses',
      sql: "SELECT count(*)::int AS count FROM users WHERE status NOT IN ('ACTIVE', 'DISABLED')",
    },
  ],
  inventory: [
    {
      name: 'duplicate stock level keys',
      sql: `SELECT count(*)::int AS count FROM (
        SELECT product_id, warehouse_id, location_id
        FROM stock_levels
        GROUP BY product_id, warehouse_id, location_id
        HAVING count(*) > 1
      ) duplicates`,
    },
    {
      name: 'negative stock level quantities',
      sql: 'SELECT count(*)::int AS count FROM stock_levels WHERE quantity < 0 OR min_quantity < 0',
    },
    {
      name: 'negative stock movement balances',
      sql: 'SELECT count(*)::int AS count FROM stock_movements WHERE quantity_after < 0',
    },
  ],
  transaction: [
    {
      name: 'invalid transaction statuses',
      sql: "SELECT count(*)::int AS count FROM stock_transactions WHERE status NOT IN ('DRAFT', 'CONFIRMING', 'CONFIRM_FAILED', 'CONFIRMED', 'CANCELLED')",
    },
  ],
};

async function runPreflight(service, client) {
  const checks = preflightChecks[service] || [];
  let failures = 0;
  for (const check of checks) {
    const result = await client.query(check.sql);
    const count = Number(result.rows[0]?.count || 0);
    if (count > 0) {
      failures += 1;
      console.error(`[PREFLIGHT FAIL] ${service}: ${check.name} (${count})`);
    } else {
      console.log(`[PREFLIGHT OK] ${service}: ${check.name}`);
    }
  }
  if (failures) throw new Error(`${service} preflight failed with ${failures} issue(s)`);
}

async function withServiceClient(service, explicitUrl, fn) {
  const url = databaseUrl(service, explicitUrl);
  if (!url) throw new Error(`Missing database URL for ${service}. Set ${envName(service)}, ${service.toUpperCase()}_SERVICE_DATABASE_URL, DATABASE_URL_${service.toUpperCase()}, DATABASE_URL, or pass --database-url.`);
  const pool = new Pool({ connectionString: url });
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
    await pool.end();
  }
}

async function applyService(service, mode, explicitUrl) {
  const migrations = readMigrations(service);
  validatePlan(migrations);
  if (mode === 'dry-run') {
    for (const migration of migrations) console.log(`[DRY-RUN] ${service}: ${migration.version}`);
    return;
  }
  if (mode === 'preflight') {
    await withServiceClient(service, explicitUrl, (client) => runPreflight(service, client));
    return;
  }

  await withServiceClient(service, explicitUrl, async (client) => {
    await ensureMigrationTable(client);
    for (const migration of migrations) {
      const applied = await client.query('SELECT 1 FROM schema_migrations WHERE service=$1 AND version=$2', [service, migration.version]);
      if (applied.rowCount) {
        console.log(`[SKIP] ${service}: ${migration.version}`);
        continue;
      }
      await client.query('BEGIN');
      try {
        await client.query(migration.sql);
        await client.query('INSERT INTO schema_migrations(service, version) VALUES($1,$2)', [service, migration.version]);
        await client.query('COMMIT');
        console.log(`[APPLIED] ${service}: ${migration.version}`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  });
}

async function main() {
  const args = parseArgs(process.argv);
  const selected = args.service === 'all' ? services : [args.service];
  const mode = args.dryRun ? 'dry-run' : args.preflight ? 'preflight' : 'apply';
  for (let run = 1; run <= args.repeat; run += 1) {
    if (args.repeat > 1) console.log(`Migration pass ${run}/${args.repeat}`);
    for (const service of selected) await applyService(service, mode, args.databaseUrl);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[MIGRATION FAILED] ${error.message}`);
    process.exit(1);
  });
}

module.exports = {
  preflightChecks,
  services,
};
