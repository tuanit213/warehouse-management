const assert = require('node:assert/strict');

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
  if (transaction.status !== 'DRAFT') throw new Error(`Only DRAFT transactions can be confirmed. Current status: ${transaction.status}`);
  return { ...transaction, status: 'CONFIRMED' };
}

function cancelTransaction(transaction) {
  if (transaction.status !== 'DRAFT') throw new Error(`Only DRAFT transactions can be cancelled. Current status: ${transaction.status}`);
  return { ...transaction, status: 'CANCELLED' };
}

(async () => {
  await test('Transaction confirms draft', () => {
    assert.equal(confirmTransaction({ id: 't1', status: 'DRAFT' }).status, 'CONFIRMED');
  });

  await test('Transaction rejects duplicate confirm', () => {
    assert.throws(() => confirmTransaction({ id: 't1', status: 'CONFIRMED' }), /Only DRAFT/);
  });

  await test('Transaction cancels draft', () => {
    assert.equal(cancelTransaction({ id: 't1', status: 'DRAFT' }).status, 'CANCELLED');
  });

  await test('Transaction rejects cancelling confirmed voucher', () => {
    assert.throws(() => cancelTransaction({ id: 't1', status: 'CONFIRMED' }), /Only DRAFT/);
  });

  if (process.exitCode) process.exit(1);
})();
