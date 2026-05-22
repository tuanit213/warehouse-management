const { spawnSync } = require('node:child_process');

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
  } else {
    console.log('[SKIP] migration DB preflight requires service DATABASE_URL env');
  }
  console.log('[OK] migration idempotency checks');
} catch (error) {
  console.error(`[FAIL] migration idempotency checks: ${error.message}`);
  process.exit(1);
}
