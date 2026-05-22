import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';
import { Pool } from 'pg';
import { PG_POOL } from './database';
import { CreateCategoryDto, CreateProductDto, ProductQueryDto, UpdateCategoryDto, UpdateProductDto, UploadProductImageDto } from './dto';

@Injectable()
export class ProductService implements OnModuleInit {
  constructor(@Inject(PG_POOL) private readonly db: Pool) {}

  private readonly imageTypes: Record<string, { extension: string; signature?: Buffer }> = {
    'image/jpeg': { extension: '.jpg', signature: Buffer.from([0xff, 0xd8, 0xff]) },
    'image/png': { extension: '.png', signature: Buffer.from([0x89, 0x50, 0x4e, 0x47]) },
    'image/webp': { extension: '.webp' },
    'image/gif': { extension: '.gif', signature: Buffer.from('GIF') },
  };

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
    await this.db.query('CREATE UNIQUE INDEX IF NOT EXISTS ux_categories_name_lower ON categories(lower(name))');
    await this.db.query('CREATE UNIQUE INDEX IF NOT EXISTS ux_products_barcode_not_null ON products(barcode) WHERE barcode IS NOT NULL');
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

  private uploadDir() {
    return process.env.PRODUCT_UPLOAD_DIR || path.resolve(process.cwd(), 'uploads', 'products');
  }

  private maxImageBytes() {
    const value = Number(process.env.PRODUCT_IMAGE_MAX_BYTES || 2 * 1024 * 1024);
    return Number.isFinite(value) && value > 0 ? value : 2 * 1024 * 1024;
  }

  async uploadProductImage(dto: UploadProductImageDto) {
    const type = this.imageTypes[dto.contentType];
    if (!type) throw new BadRequestException('Unsupported image type');
    const base64 = dto.dataBase64.replace(/^data:[^;]+;base64,/, '');
    const data = Buffer.from(base64, 'base64');
    if (!data.length) throw new BadRequestException('Image is empty');
    if (data.length > this.maxImageBytes()) throw new BadRequestException(`Image exceeds ${this.maxImageBytes()} bytes`);
    if (type.signature && !data.subarray(0, type.signature.length).equals(type.signature)) {
      throw new BadRequestException('Image content does not match declared type');
    }
    await fs.mkdir(this.uploadDir(), { recursive: true });
    const fileName = `${Date.now()}-${randomUUID()}${type.extension}`;
    const filePath = path.join(this.uploadDir(), fileName);
    await fs.writeFile(filePath, data, { flag: 'wx' });
    const publicBase = (process.env.PRODUCT_PUBLIC_BASE_URL || '').replace(/\/$/, '');
    return { fileName, imageUrl: `${publicBase}/uploads/products/${fileName}` };
  }

  async productImagePath(fileName: string) {
    const safeName = path.basename(fileName);
    if (safeName !== fileName || !/^[A-Za-z0-9._-]+$/.test(safeName)) throw new NotFoundException('Image not found');
    const extension = path.extname(safeName).toLowerCase();
    const contentType = Object.entries(this.imageTypes).find(([, type]) => type.extension === extension)?.[0] || 'application/octet-stream';
    const filePath = path.join(this.uploadDir(), safeName);
    try {
      await fs.access(filePath);
      return { path: filePath, contentType };
    } catch {
      throw new NotFoundException('Image not found');
    }
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
    const sku = dto.sku.trim().toUpperCase();
    const barcode = dto.barcode?.trim() || null;
    try {
      const result = await this.db.query(
        `INSERT INTO products(
          sku,name,description,unit,category_id,cost_price,barcode,color,size,sale_price,
          warehouse_id,location_id,quantity_imported,supplier_id,imported_at,note,image_url
        ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *`,
        [
          sku,
          dto.name,
          dto.description || null,
          dto.unit,
          dto.categoryId || null,
          dto.costPrice || 0,
          barcode,
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
      if (error?.code === '23505') throw new ConflictException('SKU or barcode already exists');
      throw error;
    }
  }

  async updateProduct(id: string, dto: UpdateProductDto) {
    const current = await this.getProduct(id);
    const next = { ...current, ...dto } as any;
    if (next.sku) next.sku = String(next.sku).trim().toUpperCase();
    if (next.barcode) next.barcode = String(next.barcode).trim();
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
      if (error?.code === '23505') throw new ConflictException('SKU or barcode already exists');
      throw error;
    }
  }

  async deleteProduct(id: string) {
    const result = await this.db.query('DELETE FROM products WHERE id=$1 RETURNING id', [id]);
    if (!result.rowCount) throw new NotFoundException('Product not found');
    return { deleted: true, id };
  }

  async exportProductsCsv() {
    const result = await this.db.query(
      `SELECT p.sku, p.name, p.unit, p.cost_price, p.sale_price, p.barcode, c.name AS category_name, p.description
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       ORDER BY p.sku ASC`,
    );
    const header = ['sku', 'name', 'unit', 'costPrice', 'salePrice', 'barcode', 'categoryName', 'description'];
    const lines = result.rows.map((row) => header.map((key) => this.csvCell(row[this.snakeKey(key)] ?? row[key] ?? '')).join(','));
    return `\uFEFF${[header.join(','), ...lines].join('\n')}`;
  }

  async importProductsCsv(csv: string, dryRun = false) {
    const rows = this.parseCsv(csv);
    if (rows.length < 2) throw new BadRequestException('CSV must include a header and at least one product row');
    const header = rows[0].map((cell) => cell.trim());
    const required = ['sku', 'name', 'unit'];
    for (const column of required) {
      if (!header.includes(column)) throw new BadRequestException(`Missing required CSV column: ${column}`);
    }
    const summary = { dryRun, created: 0, updated: 0, failed: 0, rows: [] as Array<{ row: number; sku: string; action: 'create' | 'update' | 'skip'; name?: string }>, errors: [] as Array<{ row: number; message: string }> };
    const seen = new Set<string>();
    for (let index = 1; index < rows.length; index += 1) {
      const values = Object.fromEntries(header.map((key, columnIndex) => [key, rows[index][columnIndex] ?? '']));
      const sku = String(values.sku || '').trim().toUpperCase();
      if (!sku && rows[index].every((cell) => !cell.trim())) continue;
      try {
        if (!sku) throw new BadRequestException('SKU is required');
        if (seen.has(sku)) throw new BadRequestException(`Duplicate SKU in CSV: ${sku}`);
        seen.add(sku);
        const categoryId = values.categoryName
          ? dryRun
            ? await this.findCategoryByName(String(values.categoryName))
            : await this.ensureCategoryByName(String(values.categoryName))
          : undefined;
        const dto: CreateProductDto = {
          sku,
          name: String(values.name || '').trim(),
          unit: String(values.unit || '').trim(),
          costPrice: this.csvNumber(values.costPrice),
          salePrice: this.csvNumber(values.salePrice),
          barcode: String(values.barcode || '').trim() || undefined,
          categoryId,
          description: String(values.description || '').trim() || undefined,
        };
        const existing = await this.db.query('SELECT id FROM products WHERE sku=$1', [sku]);
        if (existing.rowCount) {
          if (!dryRun) await this.updateProduct(existing.rows[0].id, dto);
          summary.updated += 1;
          summary.rows.push({ row: index + 1, sku, action: 'update', name: dto.name });
        } else {
          if (!dryRun) await this.createProduct(dto);
          summary.created += 1;
          summary.rows.push({ row: index + 1, sku, action: 'create', name: dto.name });
        }
      } catch (error) {
        summary.failed += 1;
        summary.errors.push({ row: index + 1, message: error instanceof Error ? error.message : 'Import failed' });
      }
    }
    return summary;
  }

  async listCategories() {
    const result = await this.db.query('SELECT * FROM categories ORDER BY name ASC');
    return result.rows.map((r) => this.category(r));
  }

  private async ensureCategoryByName(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return undefined;
    const existing = await this.findCategoryByName(trimmed);
    if (existing) return existing;
    const created = await this.createCategory({ name: trimmed });
    return created?.id;
  }

  private async findCategoryByName(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return undefined;
    const existing = await this.db.query('SELECT id FROM categories WHERE lower(name)=lower($1)', [trimmed]);
    return existing.rowCount ? existing.rows[0].id : undefined;
  }

  private snakeKey(key: string) {
    return key.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`);
  }

  private csvCell(value: unknown) {
    const text = String(value ?? '');
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  private csvNumber(value: unknown) {
    const normalized = String(value ?? '').replace(/[^\d.-]/g, '');
    const parsed = Number(normalized || 0);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  }

  private parseCsv(csv: string) {
    const rows: string[][] = [];
    let row: string[] = [];
    let cell = '';
    let quoted = false;
    const text = csv.replace(/^\uFEFF/, '');
    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];
      const next = text[index + 1];
      if (quoted) {
        if (char === '"' && next === '"') {
          cell += '"';
          index += 1;
        } else if (char === '"') {
          quoted = false;
        } else {
          cell += char;
        }
      } else if (char === '"') {
        quoted = true;
      } else if (char === ',') {
        row.push(cell);
        cell = '';
      } else if (char === '\n') {
        row.push(cell);
        rows.push(row);
        row = [];
        cell = '';
      } else if (char !== '\r') {
        cell += char;
      }
    }
    row.push(cell);
    if (row.some((value) => value.length > 0)) rows.push(row);
    return rows;
  }

  async createCategory(dto: CreateCategoryDto) {
    try {
      const result = await this.db.query('INSERT INTO categories(name,parent_id) VALUES($1,$2) RETURNING *', [dto.name.trim(), dto.parentId || null]);
      return this.category(result.rows[0]);
    } catch (error: any) {
      if (error?.code === '23505') throw new ConflictException('Category name already exists');
      throw error;
    }
  }

  async updateCategory(id: string, dto: UpdateCategoryDto) {
    const current = await this.db.query('SELECT * FROM categories WHERE id=$1', [id]);
    if (!current.rowCount) throw new NotFoundException('Category not found');
    const next = { name: dto.name?.trim() ?? current.rows[0].name, parentId: dto.parentId ?? current.rows[0].parent_id };
    try {
      const result = await this.db.query('UPDATE categories SET name=$1,parent_id=$2 WHERE id=$3 RETURNING *', [next.name, next.parentId || null, id]);
      return this.category(result.rows[0]);
    } catch (error: any) {
      if (error?.code === '23505') throw new ConflictException('Category name already exists');
      throw error;
    }
  }

  async deleteCategory(id: string) {
    const used = await this.db.query('SELECT id FROM products WHERE category_id=$1 LIMIT 1', [id]);
    if (used.rowCount) throw new ConflictException('Category is used by products');
    const result = await this.db.query('DELETE FROM categories WHERE id=$1 RETURNING id', [id]);
    if (!result.rowCount) throw new NotFoundException('Category not found');
    return { deleted: true, id };
  }
}
