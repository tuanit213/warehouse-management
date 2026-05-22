import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Res } from '@nestjs/common';
import { CreateCategoryDto, CreateProductDto, ImportProductCsvDto, ProductQueryDto, UpdateCategoryDto, UpdateProductDto, UploadProductImageDto } from './dto';
import { ProductService } from './product.service';

@Controller()
export class ProductController {
  constructor(private readonly products: ProductService) {}

  @Get('products')
  listProducts(@Query() query: ProductQueryDto) { return this.products.listProducts(query); }

  @Post('products')
  createProduct(@Body() dto: CreateProductDto) { return this.products.createProduct(dto); }

  @Post('products/images')
  uploadProductImage(@Body() dto: UploadProductImageDto) { return this.products.uploadProductImage(dto); }

  @Get('products/export/csv')
  async exportProductsCsv(@Res() res: any) {
    const csv = await this.products.exportProductsCsv();
    res.setHeader('content-type', 'text/csv; charset=utf-8');
    res.setHeader('content-disposition', 'attachment; filename="wms-products.csv"');
    return res.send(csv);
  }

  @Post('products/import/csv')
  importProductsCsv(@Body() dto: ImportProductCsvDto) { return this.products.importProductsCsv(dto.csv, Boolean(dto.dryRun)); }

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

  @Get('uploads/products/:fileName')
  async productImage(@Param('fileName') fileName: string, @Res() res: any) {
    const file = await this.products.productImagePath(fileName);
    res.setHeader('cache-control', 'public, max-age=31536000, immutable');
    res.type(file.contentType);
    return res.sendFile(file.path);
  }
}
