import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from './database';
import { CreateGenericTransactionDto, CreateSupplierDto, CreateTransactionDto, UpdateSupplierDto } from './dto';

type TransactionType = 'INBOUND' | 'OUTBOUND';

@Injectable()
export class TransactionService {
  constructor(@Inject(PG_POOL) private readonly db: Pool) {}

  private inventoryUrl = process.env.INVENTORY_API_URL || 'http://inventory-service:3003/api';

  private supplier(row: any) {
    return { id: row.id, code: row.code, name: row.name, contactName: row.contact_name, phone: row.phone, email: row.email, address: row.address, createdAt: row.created_at, updatedAt: row.updated_at };
  }

  private transaction(row: any, items: any[] = []) {
    return {
      id: row.id,
      type: row.type,
      code: row.code,
      warehouseId: row.warehouse_id,
      supplierId: row.supplier_id,
      status: row.status,
      note: row.note,
      totalQuantity: Number(row.total_quantity || 0),
      totalValue: Number(row.total_value || 0),
      confirmedAt: row.confirmed_at,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      items: items.map((item) => ({ id: item.id, productId: item.product_id, locationId: item.location_id, quantity: Number(item.quantity), unitPrice: Number(item.unit_price || 0) })),
    };
  }

  async listSuppliers() {
    const result = await this.db.query('SELECT * FROM suppliers ORDER BY code ASC');
    return result.rows.map((row) => this.supplier(row));
  }

  async createSupplier(dto: CreateSupplierDto) {
    try {
      const result = await this.db.query(
        'INSERT INTO suppliers(code,name,contact_name,phone,email,address) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',
        [dto.code, dto.name, dto.contactName || null, dto.phone || null, dto.email || null, dto.address || null],
      );
      return this.supplier(result.rows[0]);
    } catch (error: any) {
      if (error?.code === '23505') throw new ConflictException('Supplier code already exists');
      throw error;
    }
  }

  async updateSupplier(id: string, dto: UpdateSupplierDto) {
    const current = await this.db.query('SELECT * FROM suppliers WHERE id=$1', [id]);
    if (!current.rowCount) throw new NotFoundException('Supplier not found');
    const next = {
      code: dto.code ?? current.rows[0].code,
      name: dto.name ?? current.rows[0].name,
      contactName: dto.contactName ?? current.rows[0].contact_name,
      phone: dto.phone ?? current.rows[0].phone,
      email: dto.email ?? current.rows[0].email,
      address: dto.address ?? current.rows[0].address,
    };
    try {
      const result = await this.db.query(
        'UPDATE suppliers SET code=$1,name=$2,contact_name=$3,phone=$4,email=$5,address=$6,updated_at=NOW() WHERE id=$7 RETURNING *',
        [next.code, next.name, next.contactName || null, next.phone || null, next.email || null, next.address || null, id],
      );
      return this.supplier(result.rows[0]);
    } catch (error: any) {
      if (error?.code === '23505') throw new ConflictException('Supplier code already exists');
      throw error;
    }
  }

  async deleteSupplier(id: string) {
    const used = await this.db.query('SELECT id FROM stock_transactions WHERE supplier_id=$1 LIMIT 1', [id]);
    if (used.rowCount) throw new ConflictException('Supplier is used by transactions');
    const result = await this.db.query('DELETE FROM suppliers WHERE id=$1 RETURNING id', [id]);
    if (!result.rowCount) throw new NotFoundException('Supplier not found');
    return { deleted: true, id };
  }

  async listTransactions(type?: string, status?: string) {
    const where: string[] = [];
    const params: any[] = [];
    if (type) { params.push(type); where.push(`type=$${params.length}`); }
    if (status) { params.push(status); where.push(`status=$${params.length}`); }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const result = await this.db.query(`SELECT * FROM stock_transactions ${whereSql} ORDER BY created_at DESC LIMIT 100`, params);
    return result.rows.map((row) => this.transaction(row));
  }

  async getTransaction(id: string) {
    const transaction = await this.db.query('SELECT * FROM stock_transactions WHERE id=$1', [id]);
    if (!transaction.rowCount) throw new NotFoundException('Transaction not found');
    const items = await this.db.query('SELECT * FROM stock_transaction_items WHERE transaction_id=$1 ORDER BY id ASC', [id]);
    return this.transaction(transaction.rows[0], items.rows);
  }

  async createInbound(dto: CreateTransactionDto) {
    if (!dto.supplierId) throw new BadRequestException('supplierId is required for inbound transactions');
    return this.createTransaction({ ...dto, type: 'INBOUND' });
  }

  async createOutbound(dto: CreateTransactionDto) {
    return this.createTransaction({ ...dto, type: 'OUTBOUND' });
  }

  async createTransaction(dto: CreateGenericTransactionDto) {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      if (dto.type === 'INBOUND' && dto.supplierId) {
        const supplier = await client.query('SELECT id FROM suppliers WHERE id=$1', [dto.supplierId]);
        if (!supplier.rowCount) throw new NotFoundException('Supplier not found');
      }
      const code = dto.code || `${dto.type === 'INBOUND' ? 'IN' : 'OUT'}-${Date.now()}`;
      const totalQuantity = dto.items.reduce((sum, item) => sum + Number(item.quantity), 0);
      const totalValue = dto.items.reduce((sum, item) => sum + Number(item.quantity) * Number(item.unitPrice || 0), 0);
      const transaction = await client.query(
        'INSERT INTO stock_transactions(type,code,warehouse_id,supplier_id,note,status,total_quantity,total_value) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
        [dto.type, code, dto.warehouseId, dto.supplierId || null, dto.note || null, 'DRAFT', totalQuantity, totalValue],
      );
      for (const item of dto.items) {
        await client.query(
          'INSERT INTO stock_transaction_items(transaction_id,product_id,location_id,quantity,unit_price) VALUES($1,$2,$3,$4,$5)',
          [transaction.rows[0].id, item.productId, item.locationId || null, item.quantity, item.unitPrice || 0],
        );
      }
      await client.query('COMMIT');
      return this.getTransaction(transaction.rows[0].id);
    } catch (error: any) {
      await client.query('ROLLBACK');
      if (error?.code === '23505') throw new ConflictException('Transaction code already exists');
      throw error;
    } finally {
      client.release();
    }
  }

  async confirmTransaction(id: string) {
    const transaction = await this.getTransaction(id);
    if (transaction.status === 'CONFIRMED') throw new ConflictException('Transaction is already confirmed');
    if (transaction.status !== 'DRAFT') throw new ConflictException('Only DRAFT transactions can be confirmed');

    for (const item of transaction.items) {
      if (transaction.type === 'INBOUND') {
        await this.upsertStock(transaction.warehouseId, item.productId, item.locationId, item.quantity);
      } else {
        await this.adjustStock(transaction.warehouseId, item.productId, item.locationId, -item.quantity);
      }
    }

    await this.db.query('UPDATE stock_transactions SET status=$1, confirmed_at=NOW(), updated_at=NOW() WHERE id=$2', ['CONFIRMED', id]);
    return this.getTransaction(id);
  }

  async cancelTransaction(id: string) {
    const transaction = await this.getTransaction(id);
    if (transaction.status === 'CONFIRMED') throw new ConflictException('Confirmed transactions cannot be cancelled');
    if (transaction.status === 'CANCELLED') throw new ConflictException('Transaction is already cancelled');
    await this.db.query('UPDATE stock_transactions SET status=$1, updated_at=NOW() WHERE id=$2', ['CANCELLED', id]);
    return this.getTransaction(id);
  }

  async pdf(id: string) {
    const transaction = await this.getTransaction(id);
    const body = `Transaction ${transaction.code}\nType: ${transaction.type}\nStatus: ${transaction.status}\nTotal quantity: ${transaction.totalQuantity}`;
    return Buffer.from(`%PDF-1.4\n1 0 obj<<>>endobj\n2 0 obj<< /Length ${body.length} >>stream\n${body}\nendstream\nendobj\ntrailer<<>>\n%%EOF`);
  }

  private async upsertStock(warehouseId: string, productId: string, locationId: string | null, quantity: number) {
    const current = await this.findStock(warehouseId, productId, locationId);
    const nextQuantity = current ? Number(current.quantity) + quantity : quantity;
    await this.callInventory('/stock-levels', {
      method: 'POST',
      body: JSON.stringify({ productId, warehouseId, locationId: locationId || undefined, quantity: nextQuantity, minQuantity: current ? Number(current.minQuantity || 0) : 0 }),
    });
  }

  private async adjustStock(warehouseId: string, productId: string, locationId: string | null, delta: number) {
    await this.callInventory('/stock-levels/adjust', {
      method: 'POST',
      body: JSON.stringify({ productId, warehouseId, locationId: locationId || undefined, delta }),
    });
  }

  private async findStock(warehouseId: string, productId: string, locationId: string | null) {
    const stocks = await this.callInventory(`/stock-levels?warehouseId=${warehouseId}&productId=${productId}`);
    return stocks.find((item: any) => (item.locationId || null) === (locationId || null));
  }

  private async callInventory(path: string, options: RequestInit = {}) {
    const response = await fetch(`${this.inventoryUrl}${path}`, { ...options, headers: { 'content-type': 'application/json', ...(options.headers || {}) } });
    const text = await response.text();
    const data = text ? JSON.parse(text) : null;
    if (!response.ok) throw new ConflictException(data?.message || `Inventory sync failed: ${response.status}`);
    return data;
  }
}
