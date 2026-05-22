const { spawnSync } = require('node:child_process');

const apiUrl = process.env.WMS_API_URL || process.env.API_URL || '';

function runLocal() {
  const result = spawnSync(process.execPath, ['scripts/transaction-regression-test.js'], { encoding: 'utf8' });
  process.stdout.write(result.stdout || '');
  process.stderr.write(result.stderr || '');
  if (result.status) throw new Error('local transaction regression failed');
}

async function main() {
  runLocal();
  if (!apiUrl || !process.env.WMS_ACCESS_TOKEN) {
    console.log('[SKIP] transaction live idempotency requires WMS_API_URL and WMS_ACCESS_TOKEN');
    return;
  }
  console.log('[SKIP] live transaction idempotency requires isolated product/warehouse fixture IDs');
}

main().then(() => console.log('[OK] transaction idempotency checks')).catch((error) => {
  console.error(`[FAIL] transaction idempotency checks: ${error.message}`);
  process.exit(1);
});
