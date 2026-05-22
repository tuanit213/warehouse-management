import { ConflictException, Inject, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from './database';
import { AdjustStockDto, CreateLocationDto, CreateWarehouseDto, UpdateLocationDto, UpdateWarehouseDto, UpsertStockDto } from './dto';

@Injectable()
export class InventoryService implements OnModuleInit {
  constructor(@Inject(PG_POOL) private readonly db: Pool) {}

  async onModuleInit() {
    await this.ensureSchema();
  }

  private log(level: 'info' | 'warn' | 'error', event: string, fields: Record<string, unknown> = {}) {
    console.log(JSON.stringify({ service: 'inventory-service', level, event, timestamp: new Date().toISOString(), ...fields }));
  }

  private async audit(event: string, metadata: Record<string, unknown> = {}) {
    try {
      await this.db.query('INSERT INTO inventory_audit_events(event, metadata) VALUES($1,$2)', [event, JSON.stringify(metadata)]);
    } catch {
      this.log('warn', 'audit_write_failed', { event });
    }
  }

  private async ensureSchema() {
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS stock_movements (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        product_id UUID NOT NULL,
        warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
        location_id UUID NULL REFERENCES warehouse_locations(id) ON DELETE SET NULL,
        movement_type VARCHAR(30) NOT NULL CHECK (movement_type IN ('INBOUND', 'OUTBOUND', 'ADJUSTMENT')),
        quantity_delta NUMERIC(14,2) NOT NULL,
        quantity_after NUMERIC(14,2) NOT NULL CHECK (quantity_after >= 0),
        reference_type VARCHAR(50),
        reference_id UUID,
        note TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(product_id);
      CREATE INDEX IF NOT EXISTS idx_stock_movements_warehouse ON stock_movements(warehouse_id);
      CREATE INDEX IF NOT EXISTS idx_stock_movements_reference ON stock_movements(reference_type, reference_id);
      CREATE INDEX IF NOT EXISTS idx_stock_movements_created ON stock_movements(created_at);
      WITH duplicate_stock AS (
        SELECT
          MIN(id::text)::uuid AS keep_id,
          product_id,
          warehouse_id,
          location_id,
          SUM(quantity) AS quantity,
          MAX(min_quantity) AS min_quantity,
          MAX(last_movement_at) AS last_movement_at
        FROM stock_levels
        GROUP BY product_id, warehouse_id, location_id
        HAVING COUNT(*) > 1
      ),
      merged AS (
        UPDATE stock_levels s
        SET
          quantity = d.quantity,
          min_quantity = d.min_quantity,
          last_movement_at = d.last_movement_at
        FROM duplicate_stock d
        WHERE s.id = d.keep_id
        RETURNING s.id
      )
      DELETE FROM stock_levels s
      USING duplicate_stock d
      WHERE s.product_id = d.product_id
        AND s.warehouse_id = d.warehouse_id
        AND s.location_id IS NOT DISTINCT FROM d.location_id
        AND s.id <> d.keep_id;
      CREATE UNIQUE INDEX IF NOT EXISTS ux_stock_levels_product_warehouse_location
        ON stock_levels(product_id, warehouse_id, location_id) NULLS NOT DISTINCT;
      CREATE UNIQUE INDEX IF NOT EXISTS ux_stock_movements_transaction_reference
        ON stock_movements(reference_type, reference_id, product_id, warehouse_id, location_id)
        NULLS NOT DISTINCT
        WHERE reference_type = 'transaction' AND reference_id IS NOT NULL;
      CREATE TABLE IF NOT EXISTS inventory_audit_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        event VARCHAR(80) NOT NULL,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_inventory_audit_events_event_created ON inventory_audit_events(event, created_at DESC);
    `);
  }

  private warehouse(row: any) {
    return { id: row.id, code: row.code, name: row.name, address: row.address, createdAt: row.created_at };
  }

  private location(row: any) {
    return { id: row.id, warehouseId: row.warehouse_id, warehouseCode: row.warehouse_code, code: row.code, description: row.description, createdAt: row.created_at };
  }

  private stock(row: any) {
    return {
      id: row.id,
      productId: row.product_id,
      warehouseId: row.warehouse_id,
      warehouseCode: row.warehouse_code,
      locationId: row.location_id,
      locationCode: row.location_code,
      quantity: Number(row.quantity || 0),
      minQuantity: Number(row.min_quantity || 0),
      lastMovementAt: row.last_movement_at,
    };
  }

  private movement(row: any) {
    return {
      id: row.id,
      productId: row.product_id,
      warehouseId: row.warehouse_id,
      warehouseCode: row.warehouse_code,
      locationId: row.location_id,
      locationCode: row.location_code,
      movementType: row.movement_type,
      quantityDelta: Number(row.quantity_delta || 0),
      quantityAfter: Number(row.quantity_after || 0),
      referenceType: row.reference_type,
      referenceId: row.reference_id,
      note: row.note,
      createdAt: row.created_at,
    };
  }

  private async assertLocationBelongsToWarehouse(warehouseId: string, locationId?: string | null) {
    if (!locationId) return;
    const location = await this.db.query('SELECT id FROM warehouse_locations WHERE id=$1 AND warehouse_id=$2', [locationId, warehouseId]);
    if (!location.rowCount) throw new ConflictException('Location does not belong to selected warehouse');
  }

  private async lockStockKey(client: any, productId: string, warehouseId: string, locationId?: string | null) {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1)::bigint)', [`stock:${productId}:${warehouseId}:${locationId || 'NO_LOCATION'}`]);
  }

  private async recordMovement(input: { productId: string; warehouseId: string; locationId?: string | null; movementType: 'INBOUND' | 'OUTBOUND' | 'ADJUSTMENT'; quantityDelta: number; quantityAfter: number; referenceType?: string; referenceId?: string; note?: string }) {
    await this.db.query(
      `INSERT INTO stock_movements(product_id, warehouse_id, location_id, movement_type, quantity_delta, quantity_after, reference_type, reference_id, note)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [input.productId, input.warehouseId, input.locationId || null, input.movementType, input.quantityDelta, input.quantityAfter, input.referenceType || null, input.referenceId || null, input.note || null],
    );
  }

  async listWarehouses() {
    const result = await this.db.query('SELECT * FROM warehouses ORDER BY code ASC');
    return result.rows.map((row) => this.warehouse(row));
  }

  async createWarehouse(dto: CreateWarehouseDto) {
    try {
      const result = await this.db.query('INSERT INTO warehouses(code,name,address) VALUES($1,$2,$3) RETURNING *', [dto.code, dto.name, dto.address || null]);
      return this.warehouse(result.rows[0]);
    } catch (error: any) {
      if (error?.code === '23505') throw new ConflictException('Warehouse code already exists');
      throw error;
    }
  }

  async updateWarehouse(id: string, dto: UpdateWarehouseDto) {
    const current = await this.db.query('SELECT * FROM warehouses WHERE id=$1', [id]);
    if (!current.rowCount) throw new NotFoundException('Warehouse not found');
    const next = { code: dto.code ?? current.rows[0].code, name: dto.name ?? current.rows[0].name, address: dto.address ?? current.rows[0].address };
    try {
      const result = await this.db.query('UPDATE warehouses SET code=$1,name=$2,address=$3 WHERE id=$4 RETURNING *', [next.code, next.name, next.address || null, id]);
      return this.warehouse(result.rows[0]);
    } catch (error: any) {
      if (error?.code === '23505') throw new ConflictException('Warehouse code already exists');
      throw error;
    }
  }

  async deleteWarehouse(id: string) {
    const result = await this.db.query('DELETE FROM warehouses WHERE id=$1 RETURNING id', [id]);
    if (!result.rowCount) throw new NotFoundException('Warehouse not found');
    return { deleted: true, id };
  }

  async listLocations(warehouseId?: string) {
    const params: any[] = [];
    let where = '';
    if (warehouseId) {
      params.push(warehouseId);
      where = 'WHERE l.warehouse_id=$1';
    }
    const result = await this.db.query(
      `SELECT l.*, w.code AS warehouse_code FROM warehouse_locations l JOIN warehouses w ON w.id=l.warehouse_id ${where} ORDER BY w.code ASC, l.code ASC`,
      params,
    );
    return result.rows.map((row) => this.location(row));
  }

  async createLocation(dto: CreateLocationDto) {
    try {
      const result = await this.db.query('INSERT INTO warehouse_locations(warehouse_id,code,description) VALUES($1,$2,$3) RETURNING *', [dto.warehouseId, dto.code, dto.description || null]);
      return (await this.listLocations(dto.warehouseId)).find((item) => item.id === result.rows[0].id);
    } catch (error: any) {
      if (error?.code === '23505') throw new ConflictException('Location code already exists in warehouse');
      if (error?.code === '23503') throw new NotFoundException('Warehouse not found');
      throw error;
    }
  }

  async updateLocation(id: string, dto: UpdateLocationDto) {
    const current = await this.db.query('SELECT * FROM warehouse_locations WHERE id=$1', [id]);
    if (!current.rowCount) throw new NotFoundException('Location not found');
    const next = { warehouseId: dto.warehouseId ?? current.rows[0].warehouse_id, code: dto.code ?? current.rows[0].code, description: dto.description ?? current.rows[0].description };
    try {
      await this.db.query('UPDATE warehouse_locations SET warehouse_id=$1,code=$2,description=$3 WHERE id=$4', [next.warehouseId, next.code, next.description || null, id]);
      return (await this.listLocations(next.warehouseId)).find((item) => item.id === id);
    } catch (error: any) {
      if (error?.code === '23505') throw new ConflictException('Location code already exists in warehouse');
      if (error?.code === '23503') throw new NotFoundException('Warehouse not found');
      throw error;
    }
  }

  async deleteLocation(id: string) {
    const result = await this.db.query('DELETE FROM warehouse_locations WHERE id=$1 RETURNING id', [id]);
    if (!result.rowCount) throw new NotFoundException('Location not found');
    return { deleted: true, id };
  }

  async listStock(productId?: string, warehouseId?: string) {
    const where: string[] = [];
    const params: any[] = [];
    if (productId) { params.push(productId); where.push('s.product_id=$' + params.length); }
    if (warehouseId) { params.push(warehouseId); where.push('s.warehouse_id=$' + params.length); }
    const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const result = await this.db.query(
      `SELECT s.*, w.code AS warehouse_code, l.code AS location_code FROM stock_levels s JOIN warehouses w ON w.id=s.warehouse_id LEFT JOIN warehouse_locations l ON l.id=s.location_id ${whereSql} ORDER BY w.code ASC, l.code ASC NULLS FIRST`,
      params,
    );
    return result.rows.map((row) => this.stock(row));
  }

  async upsertStock(dto: UpsertStockDto) {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const locationId = dto.locationId || null;
      await this.lockStockKey(client, dto.productId, dto.warehouseId, locationId);
      if (locationId) {
        const location = await client.query('SELECT id FROM warehouse_locations WHERE id=$1 AND warehouse_id=$2', [locationId, dto.warehouseId]);
        if (!location.rowCount) throw new ConflictException('Location does not belong to selected warehouse');
      }

      const current = await client.query(
        'SELECT * FROM stock_levels WHERE product_id=$1 AND warehouse_id=$2 AND location_id IS NOT DISTINCT FROM $3 FOR UPDATE',
        [dto.productId, dto.warehouseId, locationId],
      );
      const beforeQuantity = current.rowCount ? Number(current.rows[0].quantity || 0) : 0;
      let stockId: string;
      let afterQuantity: number;

      if (current.rowCount) {
        const updated = await client.query(
          `UPDATE stock_levels
           SET quantity=$1, min_quantity=$2, last_movement_at=NOW()
           WHERE id=$3
           RETURNING id, quantity`,
          [dto.quantity, dto.minQuantity || 0, current.rows[0].id],
        );
        stockId = updated.rows[0].id;
        afterQuantity = Number(updated.rows[0].quantity || 0);
      } else {
        const inserted = await client.query(
          `INSERT INTO stock_levels(product_id,warehouse_id,location_id,quantity,min_quantity,last_movement_at)
           VALUES($1,$2,$3,$4,$5,NOW())
           RETURNING id, quantity`,
          [dto.productId, dto.warehouseId, locationId, dto.quantity, dto.minQuantity || 0],
        );
        stockId = inserted.rows[0].id;
        afterQuantity = Number(inserted.rows[0].quantity || 0);
      }

      if (afterQuantity !== beforeQuantity) {
        await client.query(
          `INSERT INTO stock_movements(product_id, warehouse_id, location_id, movement_type, quantity_delta, quantity_after, reference_type, reference_id, note)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [dto.productId, dto.warehouseId, locationId, 'ADJUSTMENT', afterQuantity - beforeQuantity, afterQuantity, 'manual', null, 'Manual stock upsert'],
        );
      }
      await client.query('COMMIT');
      return (await this.listStock(dto.productId, dto.warehouseId)).find((item) => item.id === stockId);
    } catch (error: any) {
      await client.query('ROLLBACK');
      if (error?.code === '23503') throw new NotFoundException('Warehouse or location not found');
      throw error;
    } finally {
      client.release();
    }
  }

  async adjustStock(dto: AdjustStockDto) {
    await this.assertLocationBelongsToWarehouse(dto.warehouseId, dto.locationId);
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const locationId = dto.locationId || null;
      await this.lockStockKey(client, dto.productId, dto.warehouseId, locationId);
      if (dto.referenceId) {
        const duplicate = await client.query(
          `SELECT quantity_after FROM stock_movements
           WHERE reference_type='transaction'
             AND reference_id=$1
             AND product_id=$2
             AND warehouse_id=$3
             AND location_id IS NOT DISTINCT FROM $4
           LIMIT 1`,
          [dto.referenceId, dto.productId, dto.warehouseId, locationId],
        );
        if (duplicate.rowCount) {
          await client.query('COMMIT');
          this.log('info', 'idempotency_hit', { productId: dto.productId, warehouseId: dto.warehouseId, referenceId: dto.referenceId });
          return (await this.listStock(dto.productId, dto.warehouseId)).find((item) => item.locationId === locationId);
        }
      }

      let current = await client.query(
        'SELECT * FROM stock_levels WHERE product_id=$1 AND warehouse_id=$2 AND location_id IS NOT DISTINCT FROM $3 FOR UPDATE',
        [dto.productId, dto.warehouseId, locationId],
      );
      if (!current.rowCount) {
        await client.query(
          `INSERT INTO stock_levels(product_id,warehouse_id,location_id,quantity,min_quantity,last_movement_at)
           VALUES($1,$2,$3,0,0,NOW())`,
          [dto.productId, dto.warehouseId, locationId],
        );
        current = await client.query(
          'SELECT * FROM stock_levels WHERE product_id=$1 AND warehouse_id=$2 AND location_id IS NOT DISTINCT FROM $3 FOR UPDATE',
          [dto.productId, dto.warehouseId, locationId],
        );
      }
      if (!current.rowCount) throw new ConflictException('Stock level could not be locked');

      if (dto.referenceId) {
        const duplicateAfterLock = await client.query(
          `SELECT quantity_after FROM stock_movements
           WHERE reference_type='transaction'
             AND reference_id=$1
             AND product_id=$2
             AND warehouse_id=$3
             AND location_id IS NOT DISTINCT FROM $4
           LIMIT 1`,
          [dto.referenceId, dto.productId, dto.warehouseId, locationId],
        );
        if (duplicateAfterLock.rowCount) {
          await client.query('COMMIT');
          this.log('info', 'idempotency_hit', { productId: dto.productId, warehouseId: dto.warehouseId, referenceId: dto.referenceId });
          return (await this.listStock(dto.productId, dto.warehouseId)).find((item) => item.id === current.rows[0].id);
        }
      }

      const updated = await client.query(
        `UPDATE stock_levels
         SET quantity = quantity + $1, last_movement_at=NOW()
         WHERE id=$2 AND quantity + $1 >= 0
         RETURNING id, quantity`,
        [dto.delta, current.rows[0].id],
      );
      if (!updated.rowCount) {
        this.log('warn', 'insufficient_stock', { productId: dto.productId, warehouseId: dto.warehouseId, locationId });
        await this.audit('insufficient_stock', { productId: dto.productId, warehouseId: dto.warehouseId, locationId });
        throw new ConflictException('Insufficient stock for outbound transaction');
      }
      await client.query(
        `INSERT INTO stock_movements(product_id, warehouse_id, location_id, movement_type, quantity_delta, quantity_after, reference_type, reference_id, note)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [dto.productId, dto.warehouseId, locationId, dto.delta >= 0 ? 'INBOUND' : 'OUTBOUND', dto.delta, Number(updated.rows[0].quantity || 0), 'transaction', dto.referenceId || null, dto.note || 'Transaction stock adjustment'],
      );
      await client.query('COMMIT');
      this.log('info', 'stock_adjusted', { productId: dto.productId, warehouseId: dto.warehouseId, locationId, delta: dto.delta, referenceId: dto.referenceId || null });
      await this.audit('stock_adjusted', { productId: dto.productId, warehouseId: dto.warehouseId, locationId, delta: dto.delta, referenceId: dto.referenceId || null });
      return (await this.listStock(dto.productId, dto.warehouseId)).find((item) => item.id === current.rows[0].id);
    } catch (error: any) {
      await client.query('ROLLBACK');
      if (error?.code === '23505' && dto.referenceId) {
        return (await this.listStock(dto.productId, dto.warehouseId)).find((item) => item.locationId === (dto.locationId || null));
      }
      if (error?.code === '23503') throw new NotFoundException('Warehouse or location not found');
      throw error;
    } finally {
      client.release();
    }
  }

  async listMovements(productId?: string, warehouseId?: string) {
    const where: string[] = [];
    const params: any[] = [];
    if (productId) { params.push(productId); where.push('m.product_id=$' + params.length); }
    if (warehouseId) { params.push(warehouseId); where.push('m.warehouse_id=$' + params.length); }
    const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const result = await this.db.query(
      `SELECT m.*, w.code AS warehouse_code, l.code AS location_code FROM stock_movements m JOIN warehouses w ON w.id=m.warehouse_id LEFT JOIN warehouse_locations l ON l.id=m.location_id ${whereSql} ORDER BY m.created_at DESC LIMIT 200`,
      params,
    );
    return result.rows.map((row) => this.movement(row));
  }

  async lowStockAlerts(productId?: string, warehouseId?: string) {
    return (await this.listStock(productId, warehouseId)).filter((item) => item.quantity <= item.minQuantity);
  }

  async agingAlerts(warehouseId?: string, days = 30) {
    const params: any[] = [days];
    const where = ['s.last_movement_at IS NOT NULL', `s.last_movement_at < NOW() - ($1 || ' days')::interval`];
    if (warehouseId) { params.push(warehouseId); where.push('s.warehouse_id=$' + params.length); }
    const result = await this.db.query(
      `SELECT s.*, w.code AS warehouse_code, l.code AS location_code FROM stock_levels s JOIN warehouses w ON w.id=s.warehouse_id LEFT JOIN warehouse_locations l ON l.id=s.location_id WHERE ${where.join(' AND ')} ORDER BY s.last_movement_at ASC`,
      params,
    );
    return result.rows.map((row) => this.stock(row));
  }
}
