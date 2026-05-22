const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
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

(async () => {
  await test('Migration runner dry-run is idempotent across two passes', () => {
    const output = execFileSync(process.execPath, ['scripts/migrate.js', '--dry-run', '--repeat', '2'], { cwd: root, encoding: 'utf8' });
    assert.match(output, /Migration pass 1\/2/);
    assert.match(output, /Migration pass 2\/2/);
    assert.match(output, /auth: 202605180001_auth_constraints_refresh_indexes/);
    assert.match(output, /inventory: 202605180001_inventory_stock_idempotency/);
    assert.match(output, /transaction: 202605180001_transaction_confirming_status/);
  });

  await test('Migration versions are unique per service', () => {
    for (const service of ['auth', 'inventory', 'transaction']) {
      const dir = path.join(root, 'database/migrations', service);
      const versions = fs.readdirSync(dir).filter((file) => file.endsWith('.sql')).map((file) => file.replace(/\.sql$/, ''));
      assert.equal(new Set(versions).size, versions.length, `${service} has duplicate migration versions`);
    }
  });

  await test('Transaction migration allows CONFIRM_FAILED status', () => {
    const sql = fs.readFileSync(path.join(root, 'database/migrations/transaction/202605180001_transaction_confirming_status.sql'), 'utf8');
    assert.match(sql, /CONFIRM_FAILED/);
  });

  await test('Inventory migration deduplicates stock levels before unique index', () => {
    const sql = fs.readFileSync(path.join(root, 'database/migrations/inventory/202605180001_inventory_stock_idempotency.sql'), 'utf8');
    const mergeStep = sql.indexOf('WITH duplicate_stock AS');
    const uniqueIndex = sql.indexOf('CREATE UNIQUE INDEX IF NOT EXISTS ux_stock_levels_product_warehouse_location');
    assert.ok(mergeStep >= 0, 'missing duplicate stock merge step');
    assert.ok(uniqueIndex > mergeStep, 'unique index must be created after duplicate stock merge');
    assert.match(sql, /SUM\(quantity\) AS quantity/);
    assert.match(sql, /location_id IS NOT DISTINCT FROM/);
  });

  if (process.exitCode) process.exit(1);
})();
