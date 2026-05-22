# Incident Runbook

## Gateway Timeout Spike

1. Check `/api/health/ready`.
2. Check gateway logs for `proxy_timeout` and `auth_verify_failed`.
3. Identify the degraded downstream service.
4. Scale or restart the affected service.
5. Confirm `/api/metrics` counters stop increasing abnormally.

## Stuck CONFIRMING

1. Find transactions where `status='CONFIRMING'`.
2. If `confirming_started_at` is older than `CONFIRMING_RETRY_AFTER_MINUTES`, retry confirmation.
3. If retry fails, the transaction moves to `CONFIRM_FAILED` with `confirm_error`.

## CONFIRM_FAILED

1. Inspect `confirm_error`.
2. Check inventory-service logs for `insufficient_stock`, `idempotency_hit`, or `stock_adjusted`.
3. Fix stock/data/downstream availability.
4. Retry confirm. Do not cancel unless the transaction is still `DRAFT`.

## Refresh Token Reuse

1. Check auth logs for `reuse_detected`.
2. The token family is revoked automatically.
3. Ask the user to log in again and investigate account activity.
