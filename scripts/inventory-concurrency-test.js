const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

const apiUrl = process.env.WMS_API_URL || process.env.API_URL || '';

function localRegression() {
  const result = spawnSync(process.execPath, ['scripts/inventory-regression-test.js'], { encoding: 'utf8' });
  process.stdout.write(result.stdout || '');
  process.stderr.write(result.stderr || '');
  if (result.status) throw new Error('local inventory regression failed');
}

async function main() {
  localRegression();
  if (!apiUrl || !process.env.WMS_ACCESS_TOKEN || !process.env.WMS_TEST_PRODUCT_ID || !process.env.WMS_TEST_WAREHOUSE_ID) {
    console.log('[SKIP] inventory live concurrency requires WMS_API_URL, WMS_ACCESS_TOKEN, WMS_TEST_PRODUCT_ID, WMS_TEST_WAREHOUSE_ID');
    return;
  }
  console.log('[SKIP] live destructive concurrency test is disabled unless WMS_ENABLE_DESTRUCTIVE_TESTS=true');
  assert.notEqual(process.env.WMS_ENABLE_DESTRUCTIVE_TESTS, 'true', 'destructive live test implementation must use isolated test data');
}

main().then(() => console.log('[OK] inventory concurrency checks')).catch((error) => {
  console.error(`[FAIL] inventory concurrency checks: ${error.message}`);
  process.exit(1);
});
