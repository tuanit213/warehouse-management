import puppeteer, { Browser } from 'puppeteer-core';

export type TransactionPdfData = {
  title: string;
  voucherLabel: string;
  transaction: {
    id: string;
    code: string;
    type: 'INBOUND' | 'OUTBOUND';
    status: string;
    note?: string | null;
    createdAt?: string | null;
    confirmedAt?: string | null;
    totalQuantity: number;
    totalValue: number;
  };
  warehouse: {
    id: string;
    code?: string;
    name?: string;
    address?: string;
  };
  supplier?: {
    id?: string;
    code?: string;
    name?: string;
    contactName?: string;
    phone?: string;
    email?: string;
    address?: string;
  } | null;
  items: Array<{
    index: number;
    productId: string;
    sku?: string;
    productName?: string;
    unit?: string;
    locationId?: string | null;
    locationCode?: string;
    quantity: number;
    unitPrice: number;
    amount: number;
  }>;
  printedAt: string;
  generatedBy?: string;
};

let browserPromise: Promise<Browser> | null = null;

export async function renderTransactionPdf(data: TransactionPdfData): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(buildTransactionPdfHtml(data), { waitUntil: 'domcontentloaded' });
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '14mm', right: '14mm', bottom: '14mm', left: '14mm' },
      preferCSSPageSize: true,
    });
    return Buffer.from(pdf);
  } finally {
    await page.close().catch(() => undefined);
  }
}

export async function closeTransactionPdfBrowser() {
  const current = browserPromise;
  browserPromise = null;
  if (!current) return;
  const browser = await current.catch(() => null);
  await browser?.close().catch(() => undefined);
}

export function buildTransactionPdfHtml(data: TransactionPdfData): string {
  const statusClass = data.transaction.status.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
  const supplier = data.supplier;
  const warehouseName = [data.warehouse.code, data.warehouse.name].filter(Boolean).join(' - ') || data.warehouse.id;
  const supplierName = supplier ? [supplier.code, supplier.name].filter(Boolean).join(' - ') || supplier.id || '-' : '-';
  const note = data.transaction.note || '-';
  const watermark = ['DRAFT', 'CANCELLED', 'CONFIRMED'].includes(data.transaction.status) ? data.transaction.status : '';
  const items = data.items.length ? data.items : [{
    index: 1,
    productId: '-',
    sku: '-',
    productName: 'Không có hàng hóa',
    unit: '-',
    locationId: null,
    locationCode: '-',
    quantity: 0,
    unitPrice: 0,
    amount: 0,
  }];

  return `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(data.title)} - ${escapeHtml(data.transaction.code)}</title>
  <style>
    @page { size: A4 portrait; margin: 14mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: #111827;
      font-family: Arial, "DejaVu Sans", "Liberation Sans", sans-serif;
      font-size: 12px;
      line-height: 1.45;
      background: #ffffff;
    }
    .document { position: relative; min-height: 100%; }
    .top-line { height: 4px; margin-bottom: 14px; background: #0f766e; }
    .header {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 16px;
      align-items: start;
      border-bottom: 1px solid #cbd5e1;
      padding-bottom: 12px;
    }
    .brand { font-size: 11px; color: #475569; text-transform: uppercase; letter-spacing: 0; }
    .brand strong { display: block; color: #0f172a; font-size: 16px; letter-spacing: 0; }
    h1 {
      margin: 10px 0 0;
      font-size: 25px;
      line-height: 1.15;
      text-transform: uppercase;
      color: #0f172a;
      letter-spacing: 0;
    }
    .voucher-meta { min-width: 190px; text-align: right; }
    .voucher-code { font-size: 18px; font-weight: 700; color: #0f172a; }
    .badge {
      display: inline-block;
      margin-top: 8px;
      border: 1px solid #99f6e4;
      border-radius: 999px;
      padding: 4px 10px;
      background: #f0fdfa;
      color: #115e59;
      font-weight: 700;
      font-size: 11px;
    }
    .badge.cancelled { border-color: #fecaca; background: #fef2f2; color: #991b1b; }
    .badge.draft, .badge.confirming, .badge.confirm_failed { border-color: #fed7aa; background: #fff7ed; color: #9a3412; }
    .info-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 0;
      margin-top: 16px;
      border: 1px solid #cbd5e1;
      border-bottom: 0;
      border-right: 0;
    }
    .info-cell {
      min-height: 42px;
      border-right: 1px solid #cbd5e1;
      border-bottom: 1px solid #cbd5e1;
      padding: 8px 10px;
    }
    .info-cell.wide { grid-column: span 2; }
    .label {
      display: block;
      margin-bottom: 2px;
      color: #64748b;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
    }
    .value { white-space: pre-wrap; }
    .section-title {
      margin: 18px 0 8px;
      font-weight: 700;
      text-transform: uppercase;
      color: #0f172a;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      page-break-inside: auto;
    }
    thead { display: table-header-group; }
    tr { page-break-inside: avoid; page-break-after: auto; }
    th, td {
      border: 1px solid #cbd5e1;
      padding: 7px 6px;
      vertical-align: top;
      overflow-wrap: anywhere;
    }
    th {
      background: #ecfeff;
      color: #0f172a;
      text-align: left;
      font-size: 10px;
      text-transform: uppercase;
    }
    .col-index { width: 34px; text-align: center; }
    .col-sku { width: 88px; }
    .col-location { width: 72px; }
    .col-unit { width: 48px; text-align: center; }
    .col-qty { width: 70px; text-align: right; }
    .col-money { width: 88px; text-align: right; }
    .muted { display: block; margin-top: 2px; color: #64748b; font-size: 10px; }
    .number { text-align: right; white-space: nowrap; }
    .summary {
      display: grid;
      grid-template-columns: 1fr 230px;
      gap: 16px;
      margin-top: 12px;
    }
    .summary-box {
      grid-column: 2;
      border: 1px solid #cbd5e1;
      background: #f8fafc;
    }
    .summary-row {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      padding: 8px 10px;
      border-bottom: 1px solid #cbd5e1;
    }
    .summary-row:last-child { border-bottom: 0; font-weight: 700; }
    .signatures {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 10px;
      margin-top: 28px;
      text-align: center;
      page-break-inside: avoid;
    }
    .signature {
      min-height: 94px;
      border-top: 1px solid #94a3b8;
      padding-top: 8px;
      color: #0f172a;
      font-weight: 700;
    }
    .signature small {
      display: block;
      margin-top: 4px;
      color: #64748b;
      font-weight: 400;
    }
    .footer {
      margin-top: 18px;
      border-top: 1px solid #cbd5e1;
      padding-top: 8px;
      color: #64748b;
      font-size: 10px;
      display: flex;
      justify-content: space-between;
      gap: 12px;
    }
    .watermark {
      position: fixed;
      top: 42%;
      left: 50%;
      transform: translate(-50%, -50%) rotate(-18deg);
      color: rgba(15, 23, 42, 0.06);
      font-size: 86px;
      font-weight: 800;
      z-index: -1;
      white-space: nowrap;
    }
  </style>
</head>
<body>
  <main class="document">
    ${watermark ? `<div class="watermark">${escapeHtml(watermark)}</div>` : ''}
    <div class="top-line"></div>
    <header class="header">
      <div>
        <div class="brand"><strong>tuanit WMS</strong>Warehouse Management System</div>
        <h1>${escapeHtml(data.title)}</h1>
      </div>
      <div class="voucher-meta">
        <span class="label">${escapeHtml(data.voucherLabel)}</span>
        <div class="voucher-code">${escapeHtml(data.transaction.code)}</div>
        <span class="badge ${escapeHtml(statusClass)}">${escapeHtml(data.transaction.status)}</span>
      </div>
    </header>

    <section class="info-grid">
      <div class="info-cell"><span class="label">Ngày tạo</span><div class="value">${escapeHtml(formatDateVi(data.transaction.createdAt))}</div></div>
      <div class="info-cell"><span class="label">Ngày xác nhận</span><div class="value">${escapeHtml(formatDateVi(data.transaction.confirmedAt))}</div></div>
      <div class="info-cell"><span class="label">Kho</span><div class="value">${escapeHtml(warehouseName)}</div></div>
      <div class="info-cell"><span class="label">Địa chỉ kho</span><div class="value">${escapeHtml(data.warehouse.address || '-')}</div></div>
      ${data.transaction.type === 'INBOUND' ? `<div class="info-cell"><span class="label">Nhà cung cấp</span><div class="value">${escapeHtml(supplierName)}</div></div>
      <div class="info-cell"><span class="label">Liên hệ NCC</span><div class="value">${escapeHtml(formatSupplierContact(supplier))}</div></div>` : ''}
      <div class="info-cell wide"><span class="label">Ghi chú</span><div class="value">${escapeHtml(note)}</div></div>
    </section>

    <div class="section-title">Bảng hàng hóa</div>
    <table>
      <thead>
        <tr>
          <th class="col-index">STT</th>
          <th class="col-sku">SKU/Mã hàng</th>
          <th>Tên sản phẩm</th>
          <th class="col-location">Vị trí</th>
          <th class="col-unit">ĐVT</th>
          <th class="col-qty">Số lượng</th>
          <th class="col-money">Đơn giá</th>
          <th class="col-money">Thành tiền</th>
        </tr>
      </thead>
      <tbody>
        ${items.map((item) => `<tr>
          <td class="col-index">${escapeHtml(String(item.index))}</td>
          <td>${escapeHtml(item.sku || item.productId)}${item.sku && item.sku !== item.productId ? `<span class="muted">${escapeHtml(shortId(item.productId))}</span>` : ''}</td>
          <td>${escapeHtml(item.productName || item.productId)}</td>
          <td>${escapeHtml(item.locationCode || item.locationId || '-')}</td>
          <td class="col-unit">${escapeHtml(item.unit || '-')}</td>
          <td class="number">${escapeHtml(formatNumber(item.quantity))}</td>
          <td class="number">${escapeHtml(formatCurrencyVnd(item.unitPrice))}</td>
          <td class="number">${escapeHtml(formatCurrencyVnd(item.amount))}</td>
        </tr>`).join('')}
      </tbody>
    </table>

    <section class="summary">
      <div class="summary-box">
        <div class="summary-row"><span>Tổng số lượng</span><strong>${escapeHtml(formatNumber(data.transaction.totalQuantity))}</strong></div>
        <div class="summary-row"><span>Tổng giá trị</span><strong>${escapeHtml(formatCurrencyVnd(data.transaction.totalValue))}</strong></div>
      </div>
    </section>

    <section class="signatures">
      <div class="signature">Người lập phiếu<small>Ký, ghi rõ họ tên</small></div>
      <div class="signature">Thủ kho<small>Ký, ghi rõ họ tên</small></div>
      <div class="signature">Kế toán<small>Ký, ghi rõ họ tên</small></div>
      <div class="signature">Người duyệt<small>Ký, ghi rõ họ tên</small></div>
    </section>

    <footer class="footer">
      <span>In từ tuanit WMS${data.generatedBy ? ` bởi ${escapeHtml(data.generatedBy)}` : ''}</span>
      <span>Thời gian in: ${escapeHtml(formatDateVi(data.printedAt))}</span>
      <span>ID: ${escapeHtml(data.transaction.id)}</span>
    </footer>
  </main>
</body>
</html>`;
}

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      executablePath: chromiumExecutablePath(),
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      headless: true,
    }).then((browser) => {
      browser.on('disconnected', () => {
        browserPromise = null;
      });
      return browser;
    }).catch((error) => {
      browserPromise = null;
      throw error;
    });
  }
  return browserPromise;
}

function chromiumExecutablePath() {
  return process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROME_BIN || '/usr/bin/chromium-browser';
}

function formatSupplierContact(supplier?: TransactionPdfData['supplier']) {
  if (!supplier) return '-';
  const lines = [
    supplier.contactName,
    supplier.phone ? `ĐT: ${supplier.phone}` : '',
    supplier.email ? `Email: ${supplier.email}` : '',
    supplier.address ? `Địa chỉ: ${supplier.address}` : '',
  ].filter(Boolean);
  return lines.join('\n') || '-';
}

function formatDateVi(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatNumber(value: number | string) {
  return Number(value || 0).toLocaleString('vi-VN', { maximumFractionDigits: 2 });
}

function formatCurrencyVnd(value: number | string) {
  return `${Number(value || 0).toLocaleString('vi-VN', { maximumFractionDigits: 0 })} đ`;
}

function shortId(value?: string) {
  return value && value.length > 12 ? value.slice(0, 8) : value || '';
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
