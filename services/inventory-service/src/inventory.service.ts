import { ConflictException, Inject, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Pool } from 'pg';
import { PG_POOL } from './database';
import { AdjustStockDto, ApproveStocktakeDto, CreateLocationDto, CreateReservationDto, CreateStocktakeDto, CreateWarehouseDto, ReleaseReservationDto, ReservationQueryDto, TransferStockDto, UpdateLocationDto, UpdateStocktakeCountsDto, UpdateWarehouseDto, UpsertStockDto } from './dto';

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
      CREATE TABLE IF NOT EXISTS stocktake_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
        status VARCHAR(30) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'APPROVED', 'CANCELLED')),
        note TEXT,
        approved_reason TEXT,
        approved_by TEXT,
        approved_at TIMESTAMPTZ,
        created_by TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS stocktake_lines (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        stocktake_id UUID NOT NULL REFERENCES stocktake_sessions(id) ON DELETE CASCADE,
        product_id UUID NOT NULL,
        warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
        location_id UUID NULL REFERENCES warehouse_locations(id) ON DELETE SET NULL,
        system_quantity NUMERIC(14,2) NOT NULL DEFAULT 0,
        counted_quantity NUMERIC(14,2) NOT NULL CHECK (counted_quantity >= 0),
        variance_quantity NUMERIC(14,2) NOT NULL DEFAULT 0,
        note TEXT
      );
      CREATE UNIQUE INDEX IF NOT EXISTS ux_stocktake_lines_stock_product_location
        ON stocktake_lines(stocktake_id, product_id, location_id) NULLS NOT DISTINCT;
      CREATE INDEX IF NOT EXISTS idx_stocktake_sessions_warehouse_created ON stocktake_sessions(warehouse_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_stocktake_lines_stocktake ON stocktake_lines(stocktake_id);
      CREATE TABLE IF NOT EXISTS stock_reservations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        product_id UUID NOT NULL,
        warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
        location_id UUID NULL REFERENCES warehouse_locations(id) ON DELETE SET NULL,
        quantity NUMERIC(14,2) NOT NULL CHECK (quantity > 0),
        status VARCHAR(30) NOT NULL DEFAULT 'RESERVED' CHECK (status IN ('RESERVED', 'RELEASED', 'CONSUMED')),
        reference_type VARCHAR(50),
        reference_id UUID,
        reason TEXT,
        created_by TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        released_at TIMESTAMPTZ,
        release_reason TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_stock_reservations_stock_status ON stock_reservations(product_id, warehouse_id, location_id, status);
      CREATE INDEX IF NOT EXISTS idx_stock_reservations_reference ON stock_reservations(reference_type, reference_id);
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
      reservedQuantity: Number(row.reserved_quantity || 0),
      availableQuantity: Number(row.available_quantity ?? row.quantity ?? 0),
      lastMovementAt: row.last_movement_at,
    };
  }

  private stocktake(row: any, lines: any[] = []) {
    return {
      id: row.id,
      warehouseId: row.warehouse_id,
      warehouseCode: row.warehouse_code,
      status: row.status,
      note: row.note,
      approvedReason: row.approved_reason,
      approvedBy: row.approved_by,
      approvedAt: row.approved_at,
      createdBy: row.created_by,
      createdAt: row.created_at,
      lines: lines.map((line) => ({
        id: line.id,
        productId: line.product_id,
        warehouseId: line.warehouse_id,
        locationId: line.location_id,
        locationCode: line.location_code,
        systemQuantity: Number(line.system_quantity || 0),
        countedQuantity: Number(line.counted_quantity || 0),
        varianceQuantity: Number(line.variance_quantity || 0),
        note: line.note,
      })),
    };
  }

  private reservation(row: any) {
    return {
      id: row.id,
      productId: row.product_id,
      warehouseId: row.warehouse_id,
      warehouseCode: row.warehouse_code,
      locationId: row.location_id,
      locationCode: row.location_code,
      quantity: Number(row.quantity || 0),
      status: row.status,
      referenceType: row.reference_type,
      referenceId: row.reference_id,
      reason: row.reason,
      createdBy: row.created_by,
      createdAt: row.created_at,
      releasedAt: row.released_at,
      releaseReason: row.release_reason,
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

  private async reservedQuantity(client: any, productId: string, warehouseId: string, locationId?: string | null) {
    const result = await client.query(
      `SELECT COALESCE(SUM(quantity), 0) AS reserved
       FROM stock_reservations
       WHERE status='RESERVED'
         AND product_id=$1
         AND warehouse_id=$2
         AND location_id IS NOT DISTINCT FROM $3`,
      [productId, warehouseId, locationId || null],
    );
    return Number(result.rows[0]?.reserved || 0);
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
      `SELECT
         s.*,
         w.code AS warehouse_code,
         l.code AS location_code,
         COALESCE(r.reserved_quantity, 0) AS reserved_quantity,
         s.quantity - COALESCE(r.reserved_quantity, 0) AS available_quantity
       FROM stock_levels s
       JOIN warehouses w ON w.id=s.warehouse_id
       LEFT JOIN warehouse_locations l ON l.id=s.location_id
       LEFT JOIN (
         SELECT product_id, warehouse_id, location_id, SUM(quantity) AS reserved_quantity
         FROM stock_reservations
         WHERE status='RESERVED'
         GROUP BY product_id, warehouse_id, location_id
       ) r ON r.product_id=s.product_id
          AND r.warehouse_id=s.warehouse_id
          AND r.location_id IS NOT DISTINCT FROM s.location_id
       ${whereSql}
       ORDER BY w.code ASC, l.code ASC NULLS FIRST`,
      params,
    );
    return result.rows.map((row) => this.stock(row));
  }

  async upsertStock(dto: UpsertStockDto, actor: { userId?: string; userEmail?: string } = {}) {
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
      const reserved = await this.reservedQuantity(client, dto.productId, dto.warehouseId, locationId);
      if (dto.quantity < reserved) throw new ConflictException('Stock quantity cannot be lower than reserved quantity');
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
          [dto.productId, dto.warehouseId, locationId, 'ADJUSTMENT', afterQuantity - beforeQuantity, afterQuantity, 'manual', null, dto.reason],
        );
      }
      await this.audit('manual_stock_upsert', { productId: dto.productId, warehouseId: dto.warehouseId, locationId, beforeQuantity, afterQuantity, reason: dto.reason, ...actor });
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

  async adjustStock(dto: AdjustStockDto, actor: { userId?: string; userEmail?: string } = {}) {
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

      const reserved = dto.delta < 0 ? await this.reservedQuantity(client, dto.productId, dto.warehouseId, locationId) : 0;
      const updated = await client.query(
        `UPDATE stock_levels
         SET quantity = quantity + $1, last_movement_at=NOW()
         WHERE id=$2 AND quantity + $1 >= 0 AND quantity + $1 >= $3
         RETURNING id, quantity`,
        [dto.delta, current.rows[0].id, reserved],
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
      await this.audit('stock_adjusted', { productId: dto.productId, warehouseId: dto.warehouseId, locationId, delta: dto.delta, referenceId: dto.referenceId || null, note: dto.note || null, ...actor });
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

  async transferStock(dto: TransferStockDto, actor: { userId?: string; userEmail?: string } = {}) {
    if (dto.fromWarehouseId === dto.toWarehouseId && (dto.fromLocationId || null) === (dto.toLocationId || null)) {
      throw new ConflictException('Source and destination stock locations must be different');
    }
    await this.assertLocationBelongsToWarehouse(dto.fromWarehouseId, dto.fromLocationId);
    await this.assertLocationBelongsToWarehouse(dto.toWarehouseId, dto.toLocationId);

    const transferId = randomUUID();
    const fromLocationId = dto.fromLocationId || null;
    const toLocationId = dto.toLocationId || null;
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const lockKeys = [
        `stock:${dto.productId}:${dto.fromWarehouseId}:${fromLocationId || 'NO_LOCATION'}`,
        `stock:${dto.productId}:${dto.toWarehouseId}:${toLocationId || 'NO_LOCATION'}`,
      ].sort();
      for (const key of lockKeys) await client.query('SELECT pg_advisory_xact_lock(hashtext($1)::bigint)', [key]);

      const source = await client.query(
        'SELECT * FROM stock_levels WHERE product_id=$1 AND warehouse_id=$2 AND location_id IS NOT DISTINCT FROM $3 FOR UPDATE',
        [dto.productId, dto.fromWarehouseId, fromLocationId],
      );
      const sourceReserved = await this.reservedQuantity(client, dto.productId, dto.fromWarehouseId, fromLocationId);
      if (!source.rowCount || Number(source.rows[0].quantity || 0) - sourceReserved < dto.quantity) throw new ConflictException('Insufficient available stock for transfer');

      const sourceUpdated = await client.query(
        `UPDATE stock_levels
         SET quantity = quantity - $1, last_movement_at=NOW()
         WHERE id=$2 AND quantity - $1 >= $3
         RETURNING quantity`,
        [dto.quantity, source.rows[0].id, sourceReserved],
      );
      if (!sourceUpdated.rowCount) throw new ConflictException('Insufficient available stock for transfer');

      let destination = await client.query(
        'SELECT * FROM stock_levels WHERE product_id=$1 AND warehouse_id=$2 AND location_id IS NOT DISTINCT FROM $3 FOR UPDATE',
        [dto.productId, dto.toWarehouseId, toLocationId],
      );
      if (!destination.rowCount) {
        await client.query(
          `INSERT INTO stock_levels(product_id,warehouse_id,location_id,quantity,min_quantity,last_movement_at)
           VALUES($1,$2,$3,0,0,NOW())`,
          [dto.productId, dto.toWarehouseId, toLocationId],
        );
        destination = await client.query(
          'SELECT * FROM stock_levels WHERE product_id=$1 AND warehouse_id=$2 AND location_id IS NOT DISTINCT FROM $3 FOR UPDATE',
          [dto.productId, dto.toWarehouseId, toLocationId],
        );
      }

      const destinationUpdated = await client.query(
        `UPDATE stock_levels
         SET quantity = quantity + $1, last_movement_at=NOW()
         WHERE id=$2
         RETURNING quantity`,
        [dto.quantity, destination.rows[0].id],
      );

      await client.query(
        `INSERT INTO stock_movements(product_id, warehouse_id, location_id, movement_type, quantity_delta, quantity_after, reference_type, reference_id, note)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [dto.productId, dto.fromWarehouseId, fromLocationId, 'OUTBOUND', -dto.quantity, Number(sourceUpdated.rows[0].quantity || 0), 'transfer', transferId, dto.reason],
      );
      await client.query(
        `INSERT INTO stock_movements(product_id, warehouse_id, location_id, movement_type, quantity_delta, quantity_after, reference_type, reference_id, note)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [dto.productId, dto.toWarehouseId, toLocationId, 'INBOUND', dto.quantity, Number(destinationUpdated.rows[0].quantity || 0), 'transfer', transferId, dto.reason],
      );
      await client.query('COMMIT');
      await this.audit('stock_transferred', { transferId, ...dto, ...actor });
      return {
        transferId,
        productId: dto.productId,
        quantity: dto.quantity,
        reason: dto.reason,
        source: { warehouseId: dto.fromWarehouseId, locationId: fromLocationId, quantityAfter: Number(sourceUpdated.rows[0].quantity || 0) },
        destination: { warehouseId: dto.toWarehouseId, locationId: toLocationId, quantityAfter: Number(destinationUpdated.rows[0].quantity || 0) },
      };
    } catch (error: any) {
      await client.query('ROLLBACK');
      if (error?.code === '23503') throw new NotFoundException('Warehouse or location not found');
      throw error;
    } finally {
      client.release();
    }
  }

  async listReservations(query: ReservationQueryDto = {}) {
    const where: string[] = [];
    const params: any[] = [];
    if (query.productId) { params.push(query.productId); where.push('r.product_id=$' + params.length); }
    if (query.warehouseId) { params.push(query.warehouseId); where.push('r.warehouse_id=$' + params.length); }
    if (query.status) { params.push(query.status); where.push('r.status=$' + params.length); }
    const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const result = await this.db.query(
      `SELECT r.*, w.code AS warehouse_code, l.code AS location_code
       FROM stock_reservations r
       JOIN warehouses w ON w.id=r.warehouse_id
       LEFT JOIN warehouse_locations l ON l.id=r.location_id
       ${whereSql}
       ORDER BY r.created_at DESC
       LIMIT 200`,
      params,
    );
    return result.rows.map((row) => this.reservation(row));
  }

  async createReservation(dto: CreateReservationDto, actor: { userId?: string; userEmail?: string } = {}) {
    await this.assertLocationBelongsToWarehouse(dto.warehouseId, dto.locationId);
    const locationId = dto.locationId || null;
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      await this.lockStockKey(client, dto.productId, dto.warehouseId, locationId);
      const current = await client.query(
        'SELECT * FROM stock_levels WHERE product_id=$1 AND warehouse_id=$2 AND location_id IS NOT DISTINCT FROM $3 FOR UPDATE',
        [dto.productId, dto.warehouseId, locationId],
      );
      const quantity = current.rowCount ? Number(current.rows[0].quantity || 0) : 0;
      const reserved = await this.reservedQuantity(client, dto.productId, dto.warehouseId, locationId);
      if (quantity - reserved < dto.quantity) throw new ConflictException('Insufficient available stock for reservation');
      const result = await client.query(
        `INSERT INTO stock_reservations(product_id, warehouse_id, location_id, quantity, reference_type, reference_id, reason, created_by)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING *`,
        [dto.productId, dto.warehouseId, locationId, dto.quantity, dto.referenceType || null, dto.referenceId || null, dto.reason || null, actor.userEmail || actor.userId || null],
      );
      await client.query('COMMIT');
      await this.audit('stock_reserved', { reservationId: result.rows[0].id, ...dto, ...actor });
      return (await this.listReservations({ status: 'RESERVED' })).find((item) => item.id === result.rows[0].id);
    } catch (error: any) {
      await client.query('ROLLBACK');
      if (error?.code === '23503') throw new NotFoundException('Warehouse or location not found');
      throw error;
    } finally {
      client.release();
    }
  }

  async releaseReservation(id: string, dto: ReleaseReservationDto = {}, actor: { userId?: string; userEmail?: string } = {}) {
    const result = await this.db.query(
      `UPDATE stock_reservations
       SET status='RELEASED', released_at=NOW(), release_reason=$1
       WHERE id=$2 AND status='RESERVED'
       RETURNING *`,
      [dto.reason || null, id],
    );
    if (!result.rowCount) throw new NotFoundException('Active reservation not found');
    await this.audit('stock_reservation_released', { reservationId: id, reason: dto.reason || null, ...actor });
    return this.reservation(result.rows[0]);
  }

  async releaseReservationsForReference(referenceType: string, referenceId: string, reason = 'Reference cancelled') {
    const result = await this.db.query(
      `UPDATE stock_reservations
       SET status='RELEASED', released_at=NOW(), release_reason=$1
       WHERE status='RESERVED' AND reference_type=$2 AND reference_id=$3
       RETURNING id`,
      [reason, referenceType, referenceId],
    );
    if (result.rowCount) await this.audit('stock_reservations_released_for_reference', { referenceType, referenceId, count: result.rowCount });
    return { released: result.rowCount || 0 };
  }

  async consumeReservationsForReference(referenceType: string, referenceId: string, reason = 'Reference confirmed') {
    const result = await this.db.query(
      `UPDATE stock_reservations
       SET status='CONSUMED', released_at=NOW(), release_reason=$1
       WHERE status='RESERVED' AND reference_type=$2 AND reference_id=$3
       RETURNING id`,
      [reason, referenceType, referenceId],
    );
    if (result.rowCount) await this.audit('stock_reservations_consumed_for_reference', { referenceType, referenceId, count: result.rowCount });
    return { consumed: result.rowCount || 0 };
  }

  async listStocktakes() {
    const sessions = await this.db.query(
      `SELECT s.*, w.code AS warehouse_code
       FROM stocktake_sessions s
       JOIN warehouses w ON w.id=s.warehouse_id
       ORDER BY s.created_at DESC
       LIMIT 100`,
    );
    return sessions.rows.map((row) => this.stocktake(row));
  }

  async getStocktake(id: string) {
    const session = await this.db.query(
      `SELECT s.*, w.code AS warehouse_code
       FROM stocktake_sessions s
       JOIN warehouses w ON w.id=s.warehouse_id
       WHERE s.id=$1`,
      [id],
    );
    if (!session.rowCount) throw new NotFoundException('Stocktake not found');
    const lines = await this.db.query(
      `SELECT l.*, wl.code AS location_code
       FROM stocktake_lines l
       LEFT JOIN warehouse_locations wl ON wl.id=l.location_id
       WHERE l.stocktake_id=$1
       ORDER BY wl.code ASC NULLS FIRST, l.product_id ASC`,
      [id],
    );
    return this.stocktake(session.rows[0], lines.rows);
  }

  async createStocktake(dto: CreateStocktakeDto, actor: { userId?: string; userEmail?: string } = {}) {
    const warehouse = await this.db.query('SELECT id FROM warehouses WHERE id=$1', [dto.warehouseId]);
    if (!warehouse.rowCount) throw new NotFoundException('Warehouse not found');
    const result = await this.db.query(
      `INSERT INTO stocktake_sessions(warehouse_id, note, created_by)
       VALUES($1,$2,$3)
       RETURNING *`,
      [dto.warehouseId, dto.note || null, actor.userEmail || actor.userId || null],
    );
    if (dto.items?.length) await this.replaceStocktakeCounts(result.rows[0].id, dto.warehouseId, dto.items);
    await this.audit('stocktake_created', { stocktakeId: result.rows[0].id, warehouseId: dto.warehouseId, itemCount: dto.items?.length || 0, ...actor });
    return this.getStocktake(result.rows[0].id);
  }

  async updateStocktakeCounts(id: string, dto: UpdateStocktakeCountsDto, actor: { userId?: string; userEmail?: string } = {}) {
    const session = await this.db.query('SELECT * FROM stocktake_sessions WHERE id=$1', [id]);
    if (!session.rowCount) throw new NotFoundException('Stocktake not found');
    if (session.rows[0].status !== 'DRAFT') throw new ConflictException('Only DRAFT stocktakes can be counted');
    await this.replaceStocktakeCounts(id, session.rows[0].warehouse_id, dto.items);
    await this.audit('stocktake_counted', { stocktakeId: id, itemCount: dto.items.length, ...actor });
    return this.getStocktake(id);
  }

  private async replaceStocktakeCounts(stocktakeId: string, warehouseId: string, items: Array<{ productId: string; locationId?: string; countedQuantity: number; note?: string }>) {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      for (const item of items) {
        const locationId = item.locationId || null;
        await this.assertLocationBelongsToWarehouse(warehouseId, locationId);
        const stock = await client.query(
          'SELECT quantity FROM stock_levels WHERE product_id=$1 AND warehouse_id=$2 AND location_id IS NOT DISTINCT FROM $3',
          [item.productId, warehouseId, locationId],
        );
        const systemQuantity = stock.rowCount ? Number(stock.rows[0].quantity || 0) : 0;
        const variance = item.countedQuantity - systemQuantity;
        await client.query(
          `INSERT INTO stocktake_lines(stocktake_id, product_id, warehouse_id, location_id, system_quantity, counted_quantity, variance_quantity, note)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8)
           ON CONFLICT (stocktake_id, product_id, location_id)
           DO UPDATE SET system_quantity=EXCLUDED.system_quantity, counted_quantity=EXCLUDED.counted_quantity, variance_quantity=EXCLUDED.variance_quantity, note=EXCLUDED.note`,
          [stocktakeId, item.productId, warehouseId, locationId, systemQuantity, item.countedQuantity, variance, item.note || null],
        );
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async approveStocktake(id: string, dto: ApproveStocktakeDto, actor: { userId?: string; userEmail?: string } = {}) {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const session = await client.query('SELECT * FROM stocktake_sessions WHERE id=$1 FOR UPDATE', [id]);
      if (!session.rowCount) throw new NotFoundException('Stocktake not found');
      if (session.rows[0].status !== 'DRAFT') throw new ConflictException('Only DRAFT stocktakes can be approved');
      const lines = await client.query('SELECT * FROM stocktake_lines WHERE stocktake_id=$1 ORDER BY product_id', [id]);
      if (!lines.rowCount) throw new ConflictException('Stocktake has no counted lines');
      for (const line of lines.rows) {
        const locationId = line.location_id || null;
        await this.lockStockKey(client, line.product_id, line.warehouse_id, locationId);
        let current = await client.query(
          'SELECT * FROM stock_levels WHERE product_id=$1 AND warehouse_id=$2 AND location_id IS NOT DISTINCT FROM $3 FOR UPDATE',
          [line.product_id, line.warehouse_id, locationId],
        );
        if (!current.rowCount) {
          await client.query(
            `INSERT INTO stock_levels(product_id,warehouse_id,location_id,quantity,min_quantity,last_movement_at)
             VALUES($1,$2,$3,0,0,NOW())`,
            [line.product_id, line.warehouse_id, locationId],
          );
          current = await client.query(
            'SELECT * FROM stock_levels WHERE product_id=$1 AND warehouse_id=$2 AND location_id IS NOT DISTINCT FROM $3 FOR UPDATE',
            [line.product_id, line.warehouse_id, locationId],
          );
        }
        const before = Number(current.rows[0].quantity || 0);
        const counted = Number(line.counted_quantity || 0);
        const delta = counted - before;
        const reserved = await this.reservedQuantity(client, line.product_id, line.warehouse_id, locationId);
        if (counted < reserved) throw new ConflictException('Counted quantity cannot be lower than reserved quantity');
        if (delta !== 0) {
          await client.query('UPDATE stock_levels SET quantity=$1, last_movement_at=NOW() WHERE id=$2', [counted, current.rows[0].id]);
          await client.query(
            `INSERT INTO stock_movements(product_id, warehouse_id, location_id, movement_type, quantity_delta, quantity_after, reference_type, reference_id, note)
             VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
            [line.product_id, line.warehouse_id, locationId, 'ADJUSTMENT', delta, counted, 'stocktake', id, dto.reason],
          );
        }
        await client.query('UPDATE stocktake_lines SET system_quantity=$1, variance_quantity=$2 WHERE id=$3', [before, delta, line.id]);
      }
      await client.query(
        `UPDATE stocktake_sessions
         SET status='APPROVED', approved_reason=$1, approved_by=$2, approved_at=NOW()
         WHERE id=$3`,
        [dto.reason, actor.userEmail || actor.userId || null, id],
      );
      await client.query('COMMIT');
      await this.audit('stocktake_approved', { stocktakeId: id, reason: dto.reason, ...actor });
      return this.getStocktake(id);
    } catch (error) {
      await client.query('ROLLBACK');
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
