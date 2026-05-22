import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from './database';
import { CreateGenericTransactionDto, CreateSupplierDto, CreateTransactionDto, UpdateSupplierDto } from './dto';

type TransactionType = 'INBOUND' | 'OUTBOUND';

@Injectable()
export class TransactionService implements OnModuleInit {
  constructor(@Inject(PG_POOL) private readonly db: Pool) {}

  private inventoryUrl = process.env.INVENTORY_API_URL || 'http://inventory-service:3003/api';

  async onModuleInit() {
    await this.ensureSchema();
  }

  private async ensureSchema() {
    await this.db.query(`
      CREATE EXTENSION IF NOT EXISTS "pgcrypto";
      CREATE TABLE IF NOT EXISTS suppliers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        code VARCHAR(50) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        contact_name VARCHAR(255),
        phone VARCHAR(50),
        email VARCHAR(255),
        address TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS stock_transactions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        type VARCHAR(20) NOT NULL,
        code VARCHAR(50) UNIQUE NOT NULL,
        warehouse_id UUID NOT NULL,
        supplier_id UUID NULL,
        status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
        note TEXT,
        total_quantity NUMERIC(14,2) NOT NULL DEFAULT 0,
        total_value NUMERIC(14,2) NOT NULL DEFAULT 0,
        confirmed_at TIMESTAMPTZ,
        confirm_error TEXT,
        confirm_attempts INT NOT NULL DEFAULT 0,
        confirming_started_at TIMESTAMPTZ,
        created_by UUID,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS stock_transaction_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        transaction_id UUID NOT NULL REFERENCES stock_transactions(id) ON DELETE CASCADE,
        product_id UUID NOT NULL,
        location_id UUID NULL,
        quantity NUMERIC(14,2) NOT NULL CHECK (quantity > 0),
        unit_price NUMERIC(14,2) NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS transaction_audit_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        transaction_id UUID NULL,
        event VARCHAR(80) NOT NULL,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS transaction_outbox_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        event_type VARCHAR(120) NOT NULL,
        aggregate_id UUID NOT NULL,
        payload JSONB NOT NULL,
        status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
        attempts INT NOT NULL DEFAULT 0,
        next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        published_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
      ALTER TABLE stock_transactions ADD COLUMN IF NOT EXISTS total_quantity NUMERIC(14,2) NOT NULL DEFAULT 0;
      ALTER TABLE stock_transactions ADD COLUMN IF NOT EXISTS total_value NUMERIC(14,2) NOT NULL DEFAULT 0;
      ALTER TABLE stock_transactions ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;
      ALTER TABLE stock_transactions ADD COLUMN IF NOT EXISTS confirm_error TEXT;
      ALTER TABLE stock_transactions ADD COLUMN IF NOT EXISTS confirm_attempts INT NOT NULL DEFAULT 0;
      ALTER TABLE stock_transactions ADD COLUMN IF NOT EXISTS confirming_started_at TIMESTAMPTZ;
      ALTER TABLE stock_transactions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
      ALTER TABLE stock_transaction_items ADD COLUMN IF NOT EXISTS location_id UUID NULL;
      UPDATE stock_transactions SET status = 'CONFIRMED', confirmed_at = COALESCE(confirmed_at, created_at) WHERE status = 'COMPLETED';
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_stock_transactions_status') THEN
          ALTER TABLE stock_transactions DROP CONSTRAINT chk_stock_transactions_status;
        END IF;
        ALTER TABLE stock_transactions
          ADD CONSTRAINT chk_stock_transactions_status
          CHECK (status IN ('DRAFT', 'CONFIRMING', 'CONFIRM_FAILED', 'CONFIRMED', 'CANCELLED'));
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_stock_transactions_type') THEN
          ALTER TABLE stock_transactions ADD CONSTRAINT chk_stock_transactions_type CHECK (type IN ('INBOUND', 'OUTBOUND'));
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_stock_transaction_items_unit_price') THEN
          ALTER TABLE stock_transaction_items ADD CONSTRAINT chk_stock_transaction_items_unit_price CHECK (unit_price >= 0);
        END IF;
      END $$;
      CREATE INDEX IF NOT EXISTS idx_stock_transactions_type ON stock_transactions(type);
      CREATE INDEX IF NOT EXISTS idx_stock_transactions_status ON stock_transactions(status);
      CREATE INDEX IF NOT EXISTS idx_stock_transactions_status_updated ON stock_transactions(status, updated_at);
      CREATE INDEX IF NOT EXISTS idx_stock_transactions_status_confirming_started ON stock_transactions(status, confirming_started_at);
      CREATE INDEX IF NOT EXISTS idx_stock_transactions_warehouse ON stock_transactions(warehouse_id);
      CREATE INDEX IF NOT EXISTS idx_stock_transactions_supplier ON stock_transactions(supplier_id);
      CREATE INDEX IF NOT EXISTS idx_stock_transaction_items_product ON stock_transaction_items(product_id);
      CREATE INDEX IF NOT EXISTS idx_stock_transaction_items_transaction ON stock_transaction_items(transaction_id);
      CREATE INDEX IF NOT EXISTS idx_transaction_audit_events_transaction_created ON transaction_audit_events(transaction_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_transaction_outbox_events_status_next_attempt ON transaction_outbox_events(status, next_attempt_at);
      CREATE INDEX IF NOT EXISTS idx_transaction_outbox_events_aggregate ON transaction_outbox_events(aggregate_id, created_at DESC);
    `);
  }

  private log(level: 'info' | 'warn' | 'error', event: string, fields: Record<string, unknown> = {}) {
    console.log(JSON.stringify({ service: 'transaction-service', level, event, timestamp: new Date().toISOString(), ...fields }));
  }

  private async audit(transactionId: string, event: string, metadata: Record<string, unknown> = {}) {
    try {
      await this.db.query('INSERT INTO transaction_audit_events(transaction_id, event, metadata) VALUES($1,$2,$3)', [transactionId, event, JSON.stringify(metadata)]);
    } catch {
      this.log('warn', 'audit_write_failed', { transactionId, event });
    }
  }

  private async enqueueOutbox(
    client: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
    eventType: string,
    aggregateId: string,
    payload: Record<string, unknown>,
  ) {
    await client.query(
      'INSERT INTO transaction_outbox_events(event_type, aggregate_id, payload) VALUES($1,$2,$3)',
      [eventType, aggregateId, JSON.stringify(payload)],
    );
  }

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
      confirmError: row.confirm_error,
      confirmAttempts: Number(row.confirm_attempts || 0),
      confirmingStartedAt: row.confirming_started_at,
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
      const duplicateKeys = new Set<string>();
      for (const item of dto.items) {
        const key = `${item.productId}:${item.locationId || 'NO_LOCATION'}`;
        if (duplicateKeys.has(key)) throw new BadRequestException('Duplicate product/location line is not allowed');
        duplicateKeys.add(key);
      }
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
      await this.enqueueOutbox(client, 'transaction.created', transaction.rows[0].id, {
        transactionId: transaction.rows[0].id,
        type: dto.type,
        code,
        warehouseId: dto.warehouseId,
        supplierId: dto.supplierId || null,
        totalQuantity,
        totalValue,
        itemCount: dto.items.length,
      });
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
    const claimed = await this.db.query(
      `UPDATE stock_transactions
       SET status=$1,
           confirm_attempts=confirm_attempts + 1,
           confirming_started_at=NOW(),
           confirm_error=NULL,
           updated_at=NOW()
       WHERE id=$2
         AND (
           status=$3
           OR status=$4
           OR (status=$5 AND COALESCE(confirming_started_at, updated_at) < NOW() - ($6 || ' minutes')::interval)
         )
       RETURNING *`,
      ['CONFIRMING', id, 'DRAFT', 'CONFIRM_FAILED', 'CONFIRMING', Number(process.env.CONFIRMING_RETRY_AFTER_MINUTES || 5)],
    );

    if (!claimed.rowCount) {
      const existing = await this.getTransaction(id);
      if (existing.status === 'CONFIRMED') throw new ConflictException('Transaction is already confirmed');
      if (existing.status === 'CONFIRMING') throw new ConflictException('Transaction confirmation is already in progress');
      if (existing.status === 'CONFIRM_FAILED') throw new ConflictException('Transaction confirmation failed and could not be reclaimed');
      if (existing.status === 'CANCELLED') throw new ConflictException('Cancelled transactions cannot be confirmed');
      throw new ConflictException('Only DRAFT or CONFIRM_FAILED transactions can be confirmed');
    }

    const transaction = await this.getTransaction(id);
    this.log('info', 'confirm_started', { transactionId: id, status: transaction.status });
    try {
      for (const item of transaction.items) {
        const delta = transaction.type === 'INBOUND' ? item.quantity : -item.quantity;
        await this.adjustStock(transaction.warehouseId, item.productId, item.locationId, delta, item.id, transaction.id);
      }

      const client = await this.db.connect();
      try {
        await client.query('BEGIN');
        await client.query('UPDATE stock_transactions SET status=$1, confirmed_at=NOW(), updated_at=NOW() WHERE id=$2', ['CONFIRMED', id]);
        await this.enqueueOutbox(client, 'transaction.confirmed', id, {
          transactionId: id,
          type: transaction.type,
          code: transaction.code,
          warehouseId: transaction.warehouseId,
          totalQuantity: transaction.totalQuantity,
          totalValue: transaction.totalValue,
          itemCount: transaction.items.length,
          items: transaction.items.map((item) => ({
            id: item.id,
            productId: item.productId,
            locationId: item.locationId || null,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
          })),
        });
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
      this.log('info', 'confirm_completed', { transactionId: id });
      await this.audit(id, 'confirm_completed');
      if (transaction.type === 'OUTBOUND') await this.consumeInventoryReservations(id);
      return this.getTransaction(id);
    } catch (error) {
      const message = this.sanitizeError(error);
      await this.db.query(
        'UPDATE stock_transactions SET status=$1, confirm_error=$2, updated_at=NOW() WHERE id=$3 AND status=$4',
        ['CONFIRM_FAILED', message, id, 'CONFIRMING'],
      );
      this.log('error', 'confirm_failed', { transactionId: id, message });
      await this.audit(id, 'confirm_failed', { message });
      await this.enqueueOutbox(this.db, 'transaction.confirm_failed', id, { transactionId: id, message });
      throw error;
    }
  }

  async cancelTransaction(id: string) {
    const transaction = await this.getTransaction(id);
    if (transaction.status === 'CANCELLED') throw new ConflictException('Transaction is already cancelled');
    if (transaction.status !== 'DRAFT') throw new ConflictException(`Only DRAFT transactions can be cancelled. Current status: ${transaction.status}`);
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      await client.query('UPDATE stock_transactions SET status=$1, updated_at=NOW() WHERE id=$2', ['CANCELLED', id]);
      await this.enqueueOutbox(client, 'transaction.cancelled', id, {
        transactionId: id,
        type: transaction.type,
        code: transaction.code,
        warehouseId: transaction.warehouseId,
      });
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    await this.releaseInventoryReservations(id);
    return this.getTransaction(id);
  }

  async pdf(id: string) {
    const transaction = await this.getTransaction(id);
    const supplier = transaction.supplierId ? await this.db.query('SELECT code, name, contact_name, phone, email, address FROM suppliers WHERE id=$1', [transaction.supplierId]) : null;
    const lines = [
      'WAREHOUSE MANAGEMENT SYSTEM',
      `${transaction.type} VOUCHER`,
      '',
      `Voucher: ${transaction.code}`,
      `Status: ${transaction.status}`,
      `Created at: ${this.formatDate(transaction.createdAt)}`,
      `Confirmed at: ${this.formatDate(transaction.confirmedAt)}`,
      `Warehouse ID: ${transaction.warehouseId}`,
      `Supplier: ${supplier?.rows[0] ? `${supplier.rows[0].code} - ${supplier.rows[0].name}` : transaction.supplierId || '-'}`,
      `Note: ${transaction.note || '-'}`,
      '',
      'ITEMS',
      'No.  Product ID                            Location ID                           Qty        Unit price      Amount',
      ...transaction.items.map((item, index) => {
        const amount = Number(item.quantity || 0) * Number(item.unitPrice || 0);
        return [
          String(index + 1).padEnd(4),
          String(item.productId).padEnd(37),
          String(item.locationId || '-').padEnd(37),
          this.money(item.quantity).padStart(8),
          this.money(item.unitPrice).padStart(15),
          this.money(amount).padStart(12),
        ].join(' ');
      }),
      '',
      `Total quantity: ${this.money(transaction.totalQuantity)}`,
      `Total value: ${this.money(transaction.totalValue)}`,
      '',
      'Prepared by                         Checked by                          Approved by',
      '',
      '',
      '____________________                ____________________                ____________________',
    ];
    return this.simplePdf(lines);
  }

  private formatDate(value?: string | null) {
    if (!value) return '-';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '-' : date.toISOString().replace('T', ' ').slice(0, 19);
  }

  private money(value: number | string) {
    return Number(value || 0).toLocaleString('vi-VN');
  }

  private simplePdf(lines: string[]) {
    const content = [
      'BT',
      '/F1 10 Tf',
      '50 790 Td',
      ...lines.flatMap((line, index) => [`(${this.pdfText(line)}) Tj`, index === lines.length - 1 ? '' : '0 -14 Td']).filter(Boolean),
      'ET',
    ].join('\n');
    const objects = [
      '1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj',
      '2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj',
      '3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>endobj',
      '4 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj',
      `5 0 obj<< /Length ${Buffer.byteLength(content)} >>stream\n${content}\nendstream\nendobj`,
    ];
    let offset = `%PDF-1.4\n`.length;
    const xref = ['xref', `0 ${objects.length + 1}`, '0000000000 65535 f '];
    const body = objects.map((object) => {
      xref.push(`${String(offset).padStart(10, '0')} 00000 n `);
      offset += Buffer.byteLength(object + '\n');
      return object;
    }).join('\n') + '\n';
    const xrefOffset = Buffer.byteLength(`%PDF-1.4\n${body}`);
    return Buffer.from(`%PDF-1.4\n${body}${xref.join('\n')}\ntrailer<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);
  }

  private pdfText(value: string) {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\x20-\x7E]/g, '')
      .replace(/\\/g, '\\\\')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)');
  }

  private sanitizeError(error: unknown) {
    const raw = error instanceof Error ? error.message : String(error || 'Unknown confirmation error');
    return raw
      .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
      .replace(/password[=:]\S+/gi, 'password=[redacted]')
      .slice(0, 1000);
  }

  private async adjustStock(warehouseId: string, productId: string, locationId: string | null, delta: number, referenceId: string, transactionId: string) {
    await this.callInventory('/stock-levels/adjust', {
      method: 'POST',
      body: JSON.stringify({ productId, warehouseId, locationId: locationId || undefined, delta, referenceId, note: `Transaction ${transactionId} item ${referenceId} stock adjustment` }),
    });
  }

  private async callInventory(path: string, options: RequestInit = {}) {
    const response = await fetch(`${this.inventoryUrl}${path}`, {
      ...options,
      headers: {
        'content-type': 'application/json',
        ...(process.env.INTERNAL_GATEWAY_TOKEN ? { 'x-internal-gateway-token': process.env.INTERNAL_GATEWAY_TOKEN } : {}),
        ...(options.headers || {}),
      },
    });
    const text = await response.text();
    const data = text ? JSON.parse(text) : null;
    if (!response.ok) throw new ConflictException(data?.message || `Inventory sync failed: ${response.status}`);
    return data;
  }

  private async releaseInventoryReservations(transactionId: string) {
    try {
      await this.callInventory(`/stock-reservations/release-reference/transaction/${transactionId}`, {
        method: 'POST',
        body: JSON.stringify({ reason: 'Transaction cancelled' }),
      });
    } catch (error) {
      this.log('warn', 'reservation_release_failed', { transactionId, message: this.sanitizeError(error) });
    }
  }

  private async consumeInventoryReservations(transactionId: string) {
    try {
      await this.callInventory(`/stock-reservations/consume-reference/transaction/${transactionId}`, {
        method: 'POST',
        body: JSON.stringify({ reason: 'Transaction confirmed' }),
      });
    } catch (error) {
      this.log('warn', 'reservation_consume_failed', { transactionId, message: this.sanitizeError(error) });
    }
  }
}
