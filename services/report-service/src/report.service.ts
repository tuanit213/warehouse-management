import { Injectable } from '@nestjs/common';

type ProductResponse = { data?: Product[] } | Product[];
type Product = { id: string; name: string; sku?: string; costPrice?: number | string; cost_price?: number | string };
type Warehouse = { id: string; code: string; name?: string };
type StockLevel = { id: string; productId: string; warehouseId: string; warehouseCode?: string; quantity: number | string; minQuantity: number | string };
type Transaction = { id: string; type: 'INBOUND' | 'OUTBOUND'; status: string; warehouseId: string; totalQuantity: number | string; totalValue: number | string; createdAt: string };

type InventoryValueRow = {
  productId: string;
  productName: string;
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
    const [products, warehouses, stockLevels, lowStock, transactions, inventoryValue] = await Promise.all([
      this.products(),
      this.get<Warehouse[]>(`${INVENTORY_API}/warehouses`, []),
      this.get<StockLevel[]>(`${INVENTORY_API}/stock-levels`, []),
      this.get<StockLevel[]>(`${INVENTORY_API}/stock-alerts/low-stock`, []),
      this.get<Transaction[]>(`${TRANSACTION_API}/transactions`, []),
      this.inventoryValue(),
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
        warehouseCode: stock.warehouseCode || warehouseMap.get(stock.warehouseId)?.code || stock.warehouseId,
        quantity,
        costPrice,
        totalValue: quantity * costPrice,
      };
    });
  }

  async inoutChart(from?: string, to?: string) {
    const transactions = await this.get<Transaction[]>(`${TRANSACTION_API}/transactions`, []);
    const fromTime = from ? new Date(from).getTime() : Number.NEGATIVE_INFINITY;
    const toTime = to ? new Date(to).getTime() + 86_399_999 : Number.POSITIVE_INFINITY;
    const bucket = new Map<string, { date: string; inboundQuantity: number; outboundQuantity: number }>();
    for (const transaction of transactions) {
      const time = new Date(transaction.createdAt).getTime();
      if (Number.isNaN(time) || time < fromTime || time > toTime) continue;
      const date = new Date(transaction.createdAt).toISOString().slice(0, 10);
      const row = bucket.get(date) || { date, inboundQuantity: 0, outboundQuantity: 0 };
      if (transaction.type === 'INBOUND') row.inboundQuantity += Number(transaction.totalQuantity || 0);
      else row.outboundQuantity += Number(transaction.totalQuantity || 0);
      bucket.set(date, row);
    }
    return Array.from(bucket.values()).sort((a, b) => a.date.localeCompare(b.date));
  }

  async exportCsv() {
    const rows = await this.inventoryValue();
    const header = ['productId', 'productName', 'warehouseCode', 'quantity', 'costPrice', 'totalValue'];
    const lines = rows.map((row) => header.map((key) => this.csvCell(row[key as keyof InventoryValueRow])).join(','));
    return [header.join(','), ...lines].join('\n');
  }

  async exportPdfText() {
    const dashboard = await this.dashboard();
    const rows = await this.inventoryValue();
    return [
      'Warehouse Management System - Report',
      `Generated at: ${dashboard.generatedAt}`,
      `Products: ${dashboard.totalProducts}`,
      `Warehouses: ${dashboard.totalWarehouses}`,
      `Total stock: ${dashboard.totalStock}`,
      `Low stock: ${dashboard.lowStockCount}`,
      `Inventory value: ${dashboard.totalInventoryValue}`,
      '',
      'Inventory value detail:',
      ...rows.map((row) => `${row.productName} | ${row.warehouseCode} | qty=${row.quantity} | value=${row.totalValue}`),
    ].join('\n');
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

  private csvCell(value: unknown) {
    const text = String(value ?? '');
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }
}
