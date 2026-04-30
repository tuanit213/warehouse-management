import { Body, Controller, Get, Post } from '@nestjs/common';
@Controller('products')
export class AppController {
  @Get()
  list() { return { service: 'product-service', message: 'Product catalog, SKU, categories, search and pagination.', items: [] }; }

  @Post()
  create(@Body() body: Record<string, unknown>) { return { service: 'product-service', created: true, data: body }; }
}
