import { ConflictException, Inject, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from './database';
import { CreateCategoryDto, CreateProductDto, ProductQueryDto, UpdateCategoryDto, UpdateProductDto } from './dto';

@Injectable()
export class ProductService implements OnModuleInit {
  constructor(@Inject(PG_POOL) private readonly db: Pool) {}

  async onModuleInit() {
    await this.db.query(`
      ALTER TABLE products
        ADD COLUMN IF NOT EXISTS barcode VARCHAR(120),
        ADD COLUMN IF NOT EXISTS color VARCHAR(80),
        ADD COLUMN IF NOT EXISTS size VARCHAR(80),
        ADD COLUMN IF NOT EXISTS sale_price NUMERIC(14,2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS warehouse_id UUID,
        ADD COLUMN IF NOT EXISTS location_id UUID,
        ADD COLUMN IF NOT EXISTS quantity_imported NUMERIC(14,2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS supplier_id UUID,
        ADD COLUMN IF NOT EXISTS imported_at DATE,
        ADD COLUMN IF NOT EXISTS note TEXT,
        ADD COLUMN IF NOT EXISTS image_url TEXT
    `);
    await this.db.query('CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode)');
  }

  private product(row: any) {
    if (!row) return null;
    return {
      id: row.id,
      sku: row.sku,
      name: row.name,
      description: row.description,
      unit: row.unit,
      categoryId: row.category_id,
      categoryName: row.category_name,
      costPrice: Number(row.cost_price || 0),
      barcode: row.barcode,
      color: row.color,
      size: row.size,
      salePrice: Number(row.sale_price || 0),
      warehouseId: row.warehouse_id,
      locationId: row.location_id,
      quantityImported: Number(row.quantity_imported || 0),
      supplierId: row.supplier_id,
      importedAt: row.imported_at,
      note: row.note,
      imageUrl: row.image_url,
      createdAt: row.created_at,
    };
  }

  private category(row: any) {
    if (!row) return null;
    return { id: row.id, name: row.name, parentId: row.parent_id };
  }

  async listProducts(query: ProductQueryDto) {
    const page = Number(query.page || 1);
    const limit = Math.min(Number(query.limit || 20), 100);
    const offset = (page - 1) * limit;
    const where: string[] = [];
    const params: any[] = [];
    if (query.keyword) {
      params.push('%' + query.keyword.toLowerCase() + '%');
      where.push('(lower(p.sku) LIKE $' + params.length + ' OR lower(p.name) LIKE $' + params.length + ' OR lower(coalesce(p.barcode, \'\')) LIKE $' + params.length + ')');
    }
    if (query.categoryId) {
      params.push(query.categoryId);
      where.push('p.category_id = $' + params.length);
    }
    const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const count = await this.db.query('SELECT COUNT(*)::int AS total FROM products p ' + whereSql, params);
    params.push(limit, offset);
    const result = await this.db.query(
      'SELECT p.*, c.name AS category_name FROM products p LEFT JOIN categories c ON c.id = p.category_id ' +
        whereSql +
        ' ORDER BY p.created_at DESC LIMIT $' + (params.length - 1) + ' OFFSET $' + params.length,
      params,
    );
    return { data: result.rows.map((r) => this.product(r)), meta: { page, limit, total: count.rows[0].total } };
  }

  async getProduct(id: string) {
    const result = await this.db.query('SELECT p.*, c.name AS category_name FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE p.id=$1', [id]);
    if (!result.rowCount) throw new NotFoundException('Product not found');
    return this.product(result.rows[0]);
  }

  async createProduct(dto: CreateProductDto) {
    try {
      const result = await this.db.query(
        `INSERT INTO products(
          sku,name,description,unit,category_id,cost_price,barcode,color,size,sale_price,
          warehouse_id,location_id,quantity_imported,supplier_id,imported_at,note,image_url
        ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *`,
        [
          dto.sku,
          dto.name,
          dto.description || null,
          dto.unit,
          dto.categoryId || null,
          dto.costPrice || 0,
          dto.barcode || null,
          dto.color || null,
          dto.size || null,
          dto.salePrice || 0,
          dto.warehouseId || null,
          dto.locationId || null,
          dto.quantityImported || 0,
          dto.supplierId || null,
          dto.importedAt || null,
          dto.note || null,
          dto.imageUrl || null,
        ],
      );
      return this.getProduct(result.rows[0].id);
    } catch (error: any) {
      if (error?.code === '23505') throw new ConflictException('SKU already exists');
      throw error;
    }
  }

  async updateProduct(id: string, dto: UpdateProductDto) {
    const current = await this.getProduct(id);
    const next = { ...current, ...dto } as any;
    try {
      const result = await this.db.query(
        `UPDATE products SET
          sku=$1,name=$2,description=$3,unit=$4,category_id=$5,cost_price=$6,
          barcode=$7,color=$8,size=$9,sale_price=$10,warehouse_id=$11,location_id=$12,
          quantity_imported=$13,supplier_id=$14,imported_at=$15,note=$16,image_url=$17
        WHERE id=$18 RETURNING id`,
        [
          next.sku,
          next.name,
          next.description || null,
          next.unit,
          next.categoryId || null,
          next.costPrice || 0,
          next.barcode || null,
          next.color || null,
          next.size || null,
          next.salePrice || 0,
          next.warehouseId || null,
          next.locationId || null,
          next.quantityImported || 0,
          next.supplierId || null,
          next.importedAt || null,
          next.note || null,
          next.imageUrl || null,
          id,
        ],
      );
      if (!result.rowCount) throw new NotFoundException('Product not found');
      return this.getProduct(id);
    } catch (error: any) {
      if (error?.code === '23505') throw new ConflictException('SKU already exists');
      throw error;
    }
  }

  async deleteProduct(id: string) {
    const result = await this.db.query('DELETE FROM products WHERE id=$1 RETURNING id', [id]);
    if (!result.rowCount) throw new NotFoundException('Product not found');
    return { deleted: true, id };
  }

  async listCategories() {
    const result = await this.db.query('SELECT * FROM categories ORDER BY name ASC');
    return result.rows.map((r) => this.category(r));
  }

  async createCategory(dto: CreateCategoryDto) {
    const result = await this.db.query('INSERT INTO categories(name,parent_id) VALUES($1,$2) RETURNING *', [dto.name, dto.parentId || null]);
    return this.category(result.rows[0]);
  }

  async updateCategory(id: string, dto: UpdateCategoryDto) {
    const current = await this.db.query('SELECT * FROM categories WHERE id=$1', [id]);
    if (!current.rowCount) throw new NotFoundException('Category not found');
    const next = { name: dto.name ?? current.rows[0].name, parentId: dto.parentId ?? current.rows[0].parent_id };
    const result = await this.db.query('UPDATE categories SET name=$1,parent_id=$2 WHERE id=$3 RETURNING *', [next.name, next.parentId || null, id]);
    return this.category(result.rows[0]);
  }

  async deleteCategory(id: string) {
    const result = await this.db.query('DELETE FROM categories WHERE id=$1 RETURNING id', [id]);
    if (!result.rowCount) throw new NotFoundException('Category not found');
    return { deleted: true, id };
  }
}
