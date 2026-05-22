import { Injectable } from '@nestjs/common';

type ProductResponse = { data?: Product[] } | Product[];
type Product = { id: string; name: string; sku?: string; costPrice?: number | string; cost_price?: number | string };
type Warehouse = { id: string; code: string; name?: string };
type StockLevel = { id: string; productId: string; warehouseId: string; warehouseCode?: string; locationCode?: string; quantity: number | string; minQuantity: number | string; lastMovementAt?: string };
type StockMovement = { id: string; productId: string; warehouseId: string; warehouseCode?: string; locationCode?: string | null; movementType: 'INBOUND' | 'OUTBOUND' | 'ADJUSTMENT'; quantityDelta: number | string; quantityAfter: number | string; createdAt: string };
type Transaction = { id: string; type: 'INBOUND' | 'OUTBOUND'; status: string; warehouseId: string; totalQuantity: number | string; totalValue: number | string; createdAt: string };

type InventoryValueRow = {
  productId: string;
  productName: string;
  sku: string;
  warehouseCode: string;
  quantity: number;
  costPrice: number;
  totalValue: number;
};

const PRODUCT_API = process.env.PRODUCT_SERVICE_URL || 'http://product-service:3002/api';
const INVENTORY_API = process.env.INVENTORY_SERVICE_URL || 'http://inventory-service:3003/api';
const TRANSACTION_API = process.env.TRANSACTION_SERVICE_URL || 'http://transaction-service:3004/api';

@Injectable()
export class ReportService {
  async dashboard() {
    const [products, warehouses, stockLevels, lowStock, transactions, inventoryValue, movements] = await Promise.all([
      this.products(),
      this.get<Warehouse[]>(`${INVENTORY_API}/warehouses`, []),
      this.get<StockLevel[]>(`${INVENTORY_API}/stock-levels`, []),
      this.lowStock(),
      this.get<Transaction[]>(`${TRANSACTION_API}/transactions`, []),
      this.inventoryValue(),
      this.stockMovements(),
    ]);
    const inboundCount = transactions.filter((item) => item.type === 'INBOUND').length;
    const outboundCount = transactions.filter((item) => item.type === 'OUTBOUND').length;
    return {
      totalProducts: products.length,
      totalWarehouses: warehouses.length,
      totalStock: stockLevels.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
      lowStockCount: lowStock.length,
      inboundCount,
      outboundCount,
      totalTransactions: transactions.length,
      totalInventoryValue: inventoryValue.reduce((sum, item) => sum + item.totalValue, 0),
      latestMovementCount: movements.length,
      generatedAt: new Date().toISOString(),
    };
  }

  async inventoryValue(productId?: string, warehouseId?: string): Promise<InventoryValueRow[]> {
    const [products, warehouses, stockLevels] = await Promise.all([
      this.products(),
      this.get<Warehouse[]>(`${INVENTORY_API}/warehouses`, []),
      this.get<StockLevel[]>(`${INVENTORY_API}/stock-levels`, []),
    ]);
    const productMap = new Map(products.map((item) => [item.id, item]));
    const warehouseMap = new Map(warehouses.map((item) => [item.id, item]));
    return stockLevels.filter((stock) => (!productId || stock.productId === productId) && (!warehouseId || stock.warehouseId === warehouseId)).map((stock) => {
      const product = productMap.get(stock.productId);
      const costPrice = Number(product?.costPrice ?? product?.cost_price ?? 0);
      const quantity = Number(stock.quantity || 0);
      return {
        productId: stock.productId,
        productName: product?.name || stock.productId,
        sku: product?.sku || '',
        warehouseCode: stock.warehouseCode || warehouseMap.get(stock.warehouseId)?.code || stock.warehouseId,
        quantity,
        costPrice,
        totalValue: quantity * costPrice,
      };
    }).sort((a, b) => b.totalValue - a.totalValue);
  }

  async lowStock(productId?: string, warehouseId?: string) {
    const [products, alerts] = await Promise.all([
      this.products(),
      this.get<StockLevel[]>(`${INVENTORY_API}/stock-alerts/low-stock`, []),
    ]);
    const productMap = new Map(products.map((item) => [item.id, item]));
    return alerts.filter((item) => (!productId || item.productId === productId) && (!warehouseId || item.warehouseId === warehouseId)).map((item) => ({
      productId: item.productId,
      sku: productMap.get(item.productId)?.sku || '',
      productName: productMap.get(item.productId)?.name || item.productId,
      warehouseCode: item.warehouseCode || item.warehouseId,
      locationCode: item.locationCode || null,
      quantity: Number(item.quantity || 0),
      minQuantity: Number(item.minQuantity || 0),
      shortage: Math.max(0, Number(item.minQuantity || 0) - Number(item.quantity || 0)),
    })).sort((a, b) => b.shortage - a.shortage);
  }

  async stockMovements(productId?: string, warehouseId?: string) {
    const params = new URLSearchParams();
    if (productId) params.set('productId', productId);
    if (warehouseId) params.set('warehouseId', warehouseId);
    const query = params.toString() ? `?${params}` : '';
    return this.get<StockMovement[]>(`${INVENTORY_API}/stock-movements${query}`, []);
  }

  async operationalSummary() {
    const [dashboard, lowStock, movements, chart] = await Promise.all([
      this.dashboard(),
      this.lowStock(),
      this.stockMovements(),
      this.inoutChart(),
    ]);
    return {
      ...dashboard,
      topLowStock: lowStock.slice(0, 10),
      latestMovements: movements.slice(0, 20),
      inoutChart: chart.slice(-14),
    };
  }

  async inoutChart(from?: string, to?: string) {
    const transactions = await this.get<Transaction[]>(`${TRANSACTION_API}/transactions`, []);
    const fromTime = from ? new Date(from).getTime() : Number.NEGATIVE_INFINITY;
    const toTime = to ? new Date(to).getTime() + 86_399_999 : Number.POSITIVE_INFINITY;
    const bucket = new Map<string, { date: string; inboundQuantity: number; outboundQuantity: number; inboundValue: number; outboundValue: number }>();
    for (const transaction of transactions.filter((item) => item.status === 'CONFIRMED')) {
      const time = new Date(transaction.createdAt).getTime();
      if (Number.isNaN(time) || time < fromTime || time > toTime) continue;
      const date = new Date(transaction.createdAt).toISOString().slice(0, 10);
      const row = bucket.get(date) || { date, inboundQuantity: 0, outboundQuantity: 0, inboundValue: 0, outboundValue: 0 };
      if (transaction.type === 'INBOUND') {
        row.inboundQuantity += Number(transaction.totalQuantity || 0);
        row.inboundValue += Number(transaction.totalValue || 0);
      } else {
        row.outboundQuantity += Number(transaction.totalQuantity || 0);
        row.outboundValue += Number(transaction.totalValue || 0);
      }
      bucket.set(date, row);
    }
    return Array.from(bucket.values()).sort((a, b) => a.date.localeCompare(b.date));
  }

  async exportCsv(kind: 'inventory' | 'low-stock' | 'movements' = 'inventory') {
    if (kind === 'low-stock') return this.toCsv(await this.lowStock(), ['sku', 'productName', 'warehouseCode', 'locationCode', 'quantity', 'minQuantity', 'shortage']);
    if (kind === 'movements') return this.toCsv(await this.stockMovements(), ['productId', 'warehouseCode', 'locationCode', 'movementType', 'quantityDelta', 'quantityAfter', 'createdAt']);
    return this.toCsv(await this.inventoryValue(), ['sku', 'productName', 'warehouseCode', 'quantity', 'costPrice', 'totalValue']);
  }

  async exportXlsx(kind: 'inventory' | 'low-stock' | 'movements' = 'inventory', productId?: string, warehouseId?: string) {
    if (kind === 'low-stock') return this.toXlsx(await this.lowStock(productId, warehouseId), ['sku', 'productName', 'warehouseCode', 'locationCode', 'quantity', 'minQuantity', 'shortage'], 'Low stock');
    if (kind === 'movements') return this.toXlsx(await this.stockMovements(productId, warehouseId), ['productId', 'warehouseCode', 'locationCode', 'movementType', 'quantityDelta', 'quantityAfter', 'createdAt'], 'Movements');
    return this.toXlsx(await this.inventoryValue(productId, warehouseId), ['sku', 'productName', 'warehouseCode', 'quantity', 'costPrice', 'totalValue'], 'Inventory');
  }

  async exportPdfBuffer(productId?: string, warehouseId?: string) {
    const dashboard = await this.dashboard();
    const rows = await this.inventoryValue(productId, warehouseId);
    const body = [
      'Warehouse Management System - Production Report',
      `Generated at: ${dashboard.generatedAt}`,
      `Products: ${dashboard.totalProducts}`,
      `Warehouses: ${dashboard.totalWarehouses}`,
      `Total stock: ${dashboard.totalStock}`,
      `Low stock: ${dashboard.lowStockCount}`,
      `Inventory value: ${dashboard.totalInventoryValue}`,
      '',
      'Top inventory value:',
      ...rows.slice(0, 20).map((row) => `${row.sku || row.productId} | ${row.productName} | ${row.warehouseCode} | qty=${row.quantity} | value=${row.totalValue}`),
    ].join('\n');
    return this.simplePdf(body);
  }

  private async products(): Promise<Product[]> {
    const response = await this.get<ProductResponse>(`${PRODUCT_API}/products?page=1&limit=1000`, []);
    return Array.isArray(response) ? response : response.data || [];
  }

  private async get<T>(url: string, fallback: T): Promise<T> {
    try {
      const response = await fetch(url);
      if (!response.ok) return fallback;
      return await response.json();
    } catch {
      return fallback;
    }
  }

  private toCsv<T extends Record<string, unknown>>(rows: T[], header: string[]) {
    const lines = rows.map((row) => header.map((key) => this.csvCell(row[key])).join(','));
    return `\uFEFF${[header.join(','), ...lines].join('\n')}`;
  }

  private csvCell(value: unknown) {
    const text = String(value ?? '');
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  private toXlsx<T extends Record<string, unknown>>(rows: T[], header: string[], sheetName: string) {
    const sheetRows = [header, ...rows.map((row) => header.map((key) => row[key]))];
    const worksheet = this.worksheetXml(sheetRows);
    const files = [
      ['[Content_Types].xml', this.contentTypesXml()],
      ['_rels/.rels', this.rootRelsXml()],
      ['xl/workbook.xml', this.workbookXml(sheetName)],
      ['xl/_rels/workbook.xml.rels', this.workbookRelsXml()],
      ['xl/worksheets/sheet1.xml', worksheet],
      ['xl/styles.xml', this.stylesXml()],
    ] as Array<[string, string | Buffer]>;
    return this.zip(files);
  }

  private worksheetXml(rows: unknown[][]) {
    const body = rows.map((row, rowIndex) => {
      const cells = row.map((value, columnIndex) => {
        const ref = `${this.columnName(columnIndex + 1)}${rowIndex + 1}`;
        if (typeof value === 'number' && Number.isFinite(value)) return `<c r="${ref}" t="n"><v>${value}</v></c>`;
        return `<c r="${ref}" t="inlineStr"><is><t>${this.xml(String(value ?? ''))}</t></is></c>`;
      }).join('');
      return `<row r="${rowIndex + 1}">${cells}</row>`;
    }).join('');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
  }

  private columnName(index: number) {
    let name = '';
    while (index > 0) {
      index -= 1;
      name = String.fromCharCode(65 + (index % 26)) + name;
      index = Math.floor(index / 26);
    }
    return name;
  }

  private contentTypesXml() {
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>';
  }

  private rootRelsXml() {
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
  }

  private workbookXml(sheetName: string) {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${this.xml(sheetName).slice(0, 31)}" sheetId="1" r:id="rId1"/></sheets></workbook>`;
  }

  private workbookRelsXml() {
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>';
  }

  private stylesXml() {
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs></styleSheet>';
  }

  private xml(value: string) {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  private zip(files: Array<[string, string | Buffer]>) {
    const localParts: Buffer[] = [];
    const centralParts: Buffer[] = [];
    let offset = 0;
    for (const [name, content] of files) {
      const nameBuffer = Buffer.from(name);
      const data = Buffer.isBuffer(content) ? content : Buffer.from(content);
      const crc = this.crc32(data);
      const local = Buffer.alloc(30);
      local.writeUInt32LE(0x04034b50, 0);
      local.writeUInt16LE(20, 4);
      local.writeUInt16LE(0, 6);
      local.writeUInt16LE(0, 8);
      local.writeUInt16LE(0, 10);
      local.writeUInt16LE(0, 12);
      local.writeUInt32LE(crc, 14);
      local.writeUInt32LE(data.length, 18);
      local.writeUInt32LE(data.length, 22);
      local.writeUInt16LE(nameBuffer.length, 26);
      local.writeUInt16LE(0, 28);
      localParts.push(local, nameBuffer, data);

      const central = Buffer.alloc(46);
      central.writeUInt32LE(0x02014b50, 0);
      central.writeUInt16LE(20, 4);
      central.writeUInt16LE(20, 6);
      central.writeUInt16LE(0, 8);
      central.writeUInt16LE(0, 10);
      central.writeUInt16LE(0, 12);
      central.writeUInt16LE(0, 14);
      central.writeUInt32LE(crc, 16);
      central.writeUInt32LE(data.length, 20);
      central.writeUInt32LE(data.length, 24);
      central.writeUInt16LE(nameBuffer.length, 28);
      central.writeUInt16LE(0, 30);
      central.writeUInt16LE(0, 32);
      central.writeUInt16LE(0, 34);
      central.writeUInt16LE(0, 36);
      central.writeUInt32LE(0, 38);
      central.writeUInt32LE(offset, 42);
      centralParts.push(central, nameBuffer);
      offset += local.length + nameBuffer.length + data.length;
    }
    const centralDirectory = Buffer.concat(centralParts);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(0, 4);
    end.writeUInt16LE(0, 6);
    end.writeUInt16LE(files.length, 8);
    end.writeUInt16LE(files.length, 10);
    end.writeUInt32LE(centralDirectory.length, 12);
    end.writeUInt32LE(offset, 16);
    end.writeUInt16LE(0, 20);
    return Buffer.concat([...localParts, centralDirectory, end]);
  }

  private crc32(data: Buffer) {
    let crc = 0xffffffff;
    for (const byte of data) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  private simplePdf(text: string) {
    const escaped = text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)').split('\n');
    const content = ['BT', '/F1 10 Tf', '50 780 Td', ...escaped.flatMap((line, index) => [`(${line}) Tj`, index === escaped.length - 1 ? '' : '0 -14 Td']).filter(Boolean), 'ET'].join('\n');
    const objects = [
      '1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj',
      '2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj',
      '3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>endobj',
      '4 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj',
      `5 0 obj<< /Length ${Buffer.byteLength(content)} >>stream\n${content}\nendstream\nendobj`,
    ];
    const body = objects.join('\n');
    return Buffer.from(`%PDF-1.4\n${body}\ntrailer<< /Root 1 0 R >>\n%%EOF`);
  }
}
