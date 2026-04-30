const fs = require('fs');
const path = require('path');
const root = 'D:/ProjectCaNhan/warehouse-management-system';
function mkdir(p){ fs.mkdirSync(p,{recursive:true}); }
function write(p,s){ mkdir(path.dirname(p)); fs.writeFileSync(p, s.replace(/\n/g,'\r\n'), 'utf8'); }
function patchJson(file, fn){ const p=path.join(root,file); const j=JSON.parse(fs.readFileSync(p,'utf8')); fn(j); fs.writeFileSync(p, JSON.stringify(j,null,2).replace(/\n/g,'\r\n'), 'utf8'); }
patchJson('services/product-service/package.json', j => { j.devDependencies['@types/pg']='^8.11.10'; });
write(`${root}/services/product-service/src/database.ts`, `import { Global, Module } from '@nestjs/common';
import { Pool } from 'pg';

export const PG_POOL = 'PG_POOL';

@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      useFactory: () => new Pool({ connectionString: process.env.DATABASE_URL }),
    },
  ],
  exports: [PG_POOL],
})
export class DatabaseModule {}
`);
write(`${root}/services/product-service/src/dto.ts`, `import { IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateCategoryDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsUUID()
  parentId?: string;
}

export class UpdateCategoryDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsUUID()
  parentId?: string;
}

export class CreateProductDto {
  @IsString()
  sku!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  unit!: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  costPrice?: number;
}

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  sku?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  costPrice?: number;
}

export class ProductQueryDto {
  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number = 20;
}
`);
write(`${root}/services/product-service/src/product.service.ts`, `import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
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
`);
write(`${root}/services/product-service/src/product.controller.ts`, `import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CreateCategoryDto, CreateProductDto, ProductQueryDto, UpdateCategoryDto, UpdateProductDto } from './dto';
import { ProductService } from './product.service';

@Controller()
export class ProductController {
  constructor(private readonly products: ProductService) {}

  @Get('products')
  listProducts(@Query() query: ProductQueryDto) { return this.products.listProducts(query); }

  @Post('products')
  createProduct(@Body() dto: CreateProductDto) { return this.products.createProduct(dto); }

  @Get('products/:id')
  getProduct(@Param('id') id: string) { return this.products.getProduct(id); }

  @Patch('products/:id')
  updateProduct(@Param('id') id: string, @Body() dto: UpdateProductDto) { return this.products.updateProduct(id, dto); }

  @Delete('products/:id')
  deleteProduct(@Param('id') id: string) { return this.products.deleteProduct(id); }

  @Get('categories')
  listCategories() { return this.products.listCategories(); }

  @Post('categories')
  createCategory(@Body() dto: CreateCategoryDto) { return this.products.createCategory(dto); }

  @Patch('categories/:id')
  updateCategory(@Param('id') id: string, @Body() dto: UpdateCategoryDto) { return this.products.updateCategory(id, dto); }

  @Delete('categories/:id')
  deleteCategory(@Param('id') id: string) { return this.products.deleteCategory(id); }
}
`);
write(`${root}/services/product-service/src/app.module.ts`, `import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database';
import { HealthController } from './health.controller';
import { ProductController } from './product.controller';
import { ProductService } from './product.service';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), DatabaseModule],
  controllers: [ProductController, HealthController],
  providers: [ProductService],
})
export class AppModule {}
`);
write(`${root}/docs/PRODUCT_SERVICE.md`, `# Product Service

Product Service dùng PostgreSQL riêng: \`product_db\`.

## Endpoints qua Gateway

Tất cả route dưới đây cần Bearer token vì đi qua API Gateway.

### Categories

- GET /api/categories
- POST /api/categories
- PATCH /api/categories/:id
- DELETE /api/categories/:id

### Products

- GET /api/products?keyword=&categoryId=&page=1&limit=20
- POST /api/products
- GET /api/products/:id
- PATCH /api/products/:id
- DELETE /api/products/:id

## Ví dụ tạo sản phẩm

\`\`\`json
{
  "sku": "SKU-001",
  "name": "Thùng carton A4",
  "description": "Thùng đóng gói chuẩn A4",
  "unit": "cái",
  "categoryId": "uuid",
  "costPrice": 12000
}
\`\`\`
`);
console.log('Implemented Product Service PostgreSQL CRUD');
