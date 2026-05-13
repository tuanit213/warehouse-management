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

  async inventoryValue(): Promise<InventoryValueRow[]> {
    const [products, warehouses, stockLevels] = await Promise.all([
      this.products(),
      this.get<Warehouse[]>(`${INVENTORY_API}/warehouses`, []),
      this.get<StockLevel[]>(`${INVENTORY_API}/stock-levels`, []),
    ]);
    const productMap = new Map(products.map((item) => [item.id, item]));
    const warehouseMap = new Map(warehouses.map((item) => [item.id, item]));
    return stockLevels.map((stock) => {
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

  async lowStock() {
    const [products, alerts] = await Promise.all([
      this.products(),
      this.get<StockLevel[]>(`${INVENTORY_API}/stock-alerts/low-stock`, []),
    ]);
    const productMap = new Map(products.map((item) => [item.id, item]));
    return alerts.map((item) => ({
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

  async exportPdfBuffer() {
    const dashboard = await this.dashboard();
    const rows = await this.inventoryValue();
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
