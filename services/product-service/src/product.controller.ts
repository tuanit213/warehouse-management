import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
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
