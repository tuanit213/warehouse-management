import { Body, Controller, Get, Post } from '@nestjs/common';
@Controller('inventory')
export class AppController {
  @Get()
  list() { return { service: 'inventory-service', message: 'Warehouses, locations, stock levels and stock alerts.', items: [] }; }

  @Post()
  create(@Body() body: Record<string, unknown>) { return { service: 'inventory-service', created: true, data: body }; }
}
