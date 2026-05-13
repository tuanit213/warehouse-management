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
