# Regression Test Matrix

Phase này bổ sung lớp test nhẹ, chạy nhanh, không phụ thuộc Docker.
Mục tiêu là bắt regression sớm trước khi chạy smoke test full-stack.

## Commands

```powershell
npm run test:regression
```

Hoặc chạy riêng:

```powershell
npm run test:rbac
npm run test:inventory
npm run test:transactions
```

## Coverage hiện tại

| Script | Phạm vi | Regression được chặn |
|---|---|---|
| `scripts/rbac-regression-test.js` | Gateway RBAC matrix | Staff đọc report, manager adjust tồn, staff sửa product |
| `scripts/inventory-regression-test.js` | Stock integrity rules | Negative stock, location không thuộc warehouse |
| `scripts/transaction-regression-test.js` | Voucher lifecycle | Confirm trùng, hủy phiếu đã confirm |

## CI integration

`.github/workflows/ci.yml` chạy `npm run test:regression` sau build và trước Docker stack.
Nếu regression fail thì CI dừng sớm, không cần chờ smoke test.

## Khi thêm nghiệp vụ mới

- Thêm test script nhỏ nếu logic có thể kiểm thử không cần DB.
- Nếu cần API thật, mở rộng `scripts/smoke-test.js`.
- Nếu cần trình duyệt thật, thêm Playwright ở phase UI E2E riêng.

## Added production checks

```powershell
npm run test:api-contract
npm run test:e2e
```

- `scripts/api-contract-test.js` checks that docs, gateway prefixes, and controllers stay aligned for auth, product image upload, inventory, stock transfer, voucher PDF, and report export routes.
- `scripts/e2e-workflow-test.js` checks live login, product/category list, and report summary when `WMS_API_URL` or `API_URL` points to a running stack. Without a live URL it exits as skipped so local static gates remain deterministic.
- `scripts/smoke-test.js` verifies stock transfer, inbound PDF export, and report Excel export as binary responses. The Excel check requires the rebuilt report-service image because older containers returned CSV.

## Latest coverage additions

- `scripts/auth-regression-test.js` covers refresh-token rotation, self-disable protection, and disabled-user refresh token revocation.
- `scripts/api-contract-test.js` now includes user status updates, CSV import dry-run, stock reservations, and stocktakes.
- `scripts/rbac-regression-test.js` covers read/write access for stock reservations and stocktakes.
- `scripts/inventory-regression-test.js` covers reserved quantity, available quantity protection, and stocktake approval references.
- `scripts/transaction-regression-test.js` covers reservation release on cancel and reservation consume on outbound confirm.
