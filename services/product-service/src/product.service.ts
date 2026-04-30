import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from './database';
import { CreateCategoryDto, CreateProductDto, ProductQueryDto, UpdateCategoryDto, UpdateProductDto } from './dto';

@Injectable()
export class ProductService {
  constructor(@Inject(PG_POOL) private readonly db: Pool) {}

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
      where.push('(lower(p.sku) LIKE $' + params.length + ' OR lower(p.name) LIKE $' + params.length + ')');
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
        'INSERT INTO products(sku,name,description,unit,category_id,cost_price) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',
        [dto.sku, dto.name, dto.description || null, dto.unit, dto.categoryId || null, dto.costPrice || 0],
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
        'UPDATE products SET sku=$1,name=$2,description=$3,unit=$4,category_id=$5,cost_price=$6 WHERE id=$7 RETURNING id',
        [next.sku, next.name, next.description || null, next.unit, next.categoryId || null, next.costPrice || 0, id],
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
