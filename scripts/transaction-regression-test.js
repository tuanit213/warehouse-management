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

function confirmTransaction(transaction) {
  if (!['DRAFT', 'CONFIRM_FAILED'].includes(transaction.status)) throw new Error(`Only DRAFT or CONFIRM_FAILED transactions can be confirmed. Current status: ${transaction.status}`);
  return { ...transaction, status: 'CONFIRMED' };
}

function confirmWithItemIdempotency(transaction, appliedItems) {
  if (!['DRAFT', 'CONFIRM_FAILED', 'CONFIRMING'].includes(transaction.status)) {
    if (transaction.status === 'CONFIRMED') return transaction;
    throw new Error(`Only DRAFT or CONFIRM_FAILED transactions can be confirmed. Current status: ${transaction.status}`);
  }
  for (const item of transaction.items) {
    if (appliedItems.has(item.id)) continue;
    appliedItems.add(item.id);
  }
  return { ...transaction, status: 'CONFIRMED' };
}

function cancelTransaction(transaction) {
  if (transaction.status !== 'DRAFT') throw new Error(`Only DRAFT transactions can be cancelled. Current status: ${transaction.status}`);
  return { ...transaction, status: 'CANCELLED' };
}

function failConfirm(transaction) {
  if (transaction.status !== 'CONFIRMING') throw new Error('Only CONFIRMING transactions can fail confirmation');
  return { ...transaction, status: 'CONFIRM_FAILED', confirmError: 'Inventory sync failed', confirmAttempts: transaction.confirmAttempts || 1 };
}

(async () => {
  await test('Transaction confirms draft', () => {
    assert.equal(confirmTransaction({ id: 't1', status: 'DRAFT' }).status, 'CONFIRMED');
  });

  await test('Transaction rejects duplicate confirm', () => {
    assert.throws(() => confirmTransaction({ id: 't1', status: 'CONFIRMED' }), /Only DRAFT or CONFIRM_FAILED/);
  });

  await test('Transaction cancels draft', () => {
    assert.equal(cancelTransaction({ id: 't1', status: 'DRAFT' }).status, 'CANCELLED');
  });

  await test('Transaction rejects cancelling confirmed voucher', () => {
    assert.throws(() => cancelTransaction({ id: 't1', status: 'CONFIRMED' }), /Only DRAFT/);
  });

  await test('Transaction rejects cancelling CONFIRMING and CONFIRM_FAILED vouchers', () => {
    assert.throws(() => cancelTransaction({ id: 't1', status: 'CONFIRMING' }), /Only DRAFT/);
    assert.throws(() => cancelTransaction({ id: 't1', status: 'CONFIRM_FAILED' }), /Only DRAFT/);
  });

  await test('Failed confirmation moves to CONFIRM_FAILED instead of DRAFT', () => {
    const failed = failConfirm({ id: 't1', status: 'CONFIRMING', confirmAttempts: 1 });
    assert.equal(failed.status, 'CONFIRM_FAILED');
    assert.equal(failed.confirmError, 'Inventory sync failed');
    assert.equal(failed.confirmAttempts, 1);
  });

  await test('Confirm retry does not apply transaction items twice', () => {
    const appliedItems = new Set();
    const transaction = { id: 't1', status: 'DRAFT', items: [{ id: 'i1' }, { id: 'i2' }] };
    const confirmed = confirmWithItemIdempotency(transaction, appliedItems);
    const retried = confirmWithItemIdempotency({ ...confirmed, items: transaction.items }, appliedItems);
    assert.equal(retried.status, 'CONFIRMED');
    assert.deepEqual([...appliedItems].sort(), ['i1', 'i2']);
  });

  await test('Recoverable CONFIRMING transaction can be retried idempotently', () => {
    const appliedItems = new Set(['i1']);
    const retried = confirmWithItemIdempotency({ id: 't1', status: 'CONFIRMING', items: [{ id: 'i1' }, { id: 'i2' }] }, appliedItems);
    assert.equal(retried.status, 'CONFIRMED');
    assert.deepEqual([...appliedItems].sort(), ['i1', 'i2']);
  });

  await test('CONFIRM_FAILED transaction can be retried idempotently', () => {
    const appliedItems = new Set(['i1']);
    const retried = confirmWithItemIdempotency({ id: 't1', status: 'CONFIRM_FAILED', items: [{ id: 'i1' }, { id: 'i2' }] }, appliedItems);
    assert.equal(retried.status, 'CONFIRMED');
    assert.deepEqual([...appliedItems].sort(), ['i1', 'i2']);
  });

  await test('Transaction service applies confirm recovery migration at startup', () => {
    const source = fs.readFileSync(path.join(root, 'services/transaction-service/src/transaction.service.ts'), 'utf8');
    assert.match(source, /implements OnModuleInit/);
    assert.match(source, /async onModuleInit\(\)/);
    assert.match(source, /ALTER TABLE stock_transactions ADD COLUMN IF NOT EXISTS confirming_started_at TIMESTAMPTZ/);
    assert.match(source, /CONFIRM_FAILED/);
    assert.match(source, /idx_stock_transactions_status_confirming_started/);
  });

  await test('Transaction service rejects duplicate confirmed voucher API calls', () => {
    const source = fs.readFileSync(path.join(root, 'services/transaction-service/src/transaction.service.ts'), 'utf8');
    assert.match(source, /existing\.status === 'CONFIRMED'\) throw new ConflictException\('Transaction is already confirmed'\)/);
  });

  await test('Transaction inventory sync includes internal gateway token', () => {
    const source = fs.readFileSync(path.join(root, 'services/transaction-service/src/transaction.service.ts'), 'utf8');
    assert.match(source, /x-internal-gateway-token/);
    assert.match(source, /process\.env\.INTERNAL_GATEWAY_TOKEN/);
  });

  await test('Outbound reservation lifecycle is released on cancel and consumed on confirm', () => {
    const source = fs.readFileSync(path.join(root, 'services/transaction-service/src/transaction.service.ts'), 'utf8');
    assert.match(source, /releaseInventoryReservations/);
    assert.match(source, /consumeInventoryReservations/);
    assert.match(source, /stock-reservations\/release-reference\/transaction/);
    assert.match(source, /stock-reservations\/consume-reference\/transaction/);
    assert.match(source, /if \(transaction\.type === 'OUTBOUND'\) await this\.consumeInventoryReservations\(id\)/);
  });

  await test('Transaction outbox publisher drains events with RabbitMQ retry metadata', () => {
    const moduleSource = fs.readFileSync(path.join(root, 'services/transaction-service/src/app.module.ts'), 'utf8');
    const publisherSource = fs.readFileSync(path.join(root, 'services/transaction-service/src/transaction-outbox.publisher.ts'), 'utf8');
    const serviceSource = fs.readFileSync(path.join(root, 'services/transaction-service/src/transaction.service.ts'), 'utf8');
    assert.match(moduleSource, /TransactionOutboxPublisher/);
    assert.match(serviceSource, /transaction\.confirmed/);
    assert.match(serviceSource, /items: transaction\.items\.map/);
    assert.match(publisherSource, /FOR UPDATE SKIP LOCKED/);
    assert.match(publisherSource, /createConfirmChannel/);
    assert.match(publisherSource, /deliveryMode: 2/);
    assert.match(publisherSource, /TRANSACTION_OUTBOX_MAX_ATTEMPTS/);
    assert.match(publisherSource, /wms\.transaction\.events\.dead/);
  });

  if (process.exitCode) process.exit(1);
})();
