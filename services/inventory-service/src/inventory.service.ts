import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from './database';
import { AdjustStockDto, CreateLocationDto, CreateWarehouseDto, UpdateLocationDto, UpdateWarehouseDto, UpsertStockDto } from './dto';

@Injectable()
export class InventoryService {
  constructor(@Inject(PG_POOL) private readonly db: Pool) {}

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
    try {
      const result = await this.db.query(
        `INSERT INTO stock_levels(product_id,warehouse_id,location_id,quantity,min_quantity,last_movement_at)
         VALUES($1,$2,$3,$4,$5,NOW())
         ON CONFLICT (product_id, warehouse_id, location_id)
         DO UPDATE SET quantity=EXCLUDED.quantity,min_quantity=EXCLUDED.min_quantity,last_movement_at=NOW()
         RETURNING id`,
        [dto.productId, dto.warehouseId, dto.locationId || null, dto.quantity, dto.minQuantity || 0],
      );
      return (await this.listStock(dto.productId, dto.warehouseId)).find((item) => item.id === result.rows[0].id);
    } catch (error: any) {
      if (error?.code === '23503') throw new NotFoundException('Warehouse or location not found');
      throw error;
    }
  }

  async adjustStock(dto: AdjustStockDto) {
    const current = await this.db.query('SELECT * FROM stock_levels WHERE product_id=$1 AND warehouse_id=$2 AND location_id IS NOT DISTINCT FROM $3', [dto.productId, dto.warehouseId, dto.locationId || null]);
    if (!current.rowCount) {
      return this.upsertStock({ productId: dto.productId, warehouseId: dto.warehouseId, locationId: dto.locationId, quantity: dto.delta, minQuantity: 0 });
    }
    const nextQuantity = Number(current.rows[0].quantity) + dto.delta;
    if (nextQuantity < 0) throw new ConflictException('Stock quantity cannot be negative');
    await this.db.query('UPDATE stock_levels SET quantity=$1,last_movement_at=NOW() WHERE id=$2', [nextQuantity, current.rows[0].id]);
    return (await this.listStock(dto.productId, dto.warehouseId)).find((item) => item.id === current.rows[0].id);
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
