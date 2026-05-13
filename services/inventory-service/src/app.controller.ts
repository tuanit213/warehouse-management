import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { AdjustStockDto, CreateLocationDto, CreateWarehouseDto, UpdateLocationDto, UpdateWarehouseDto, UpsertStockDto } from './dto';
import { InventoryService } from './inventory.service';

@Controller()
export class AppController {
  constructor(private readonly inventory: InventoryService) {}

  @Get('inventory')
  summary() { return { service: 'inventory-service', message: 'Warehouses, locations and stock levels API.' }; }

  @Get('warehouses')
  listWarehouses() { return this.inventory.listWarehouses(); }

  @Post('warehouses')
  createWarehouse(@Body() dto: CreateWarehouseDto) { return this.inventory.createWarehouse(dto); }

  @Patch('warehouses/:id')
  updateWarehouse(@Param('id') id: string, @Body() dto: UpdateWarehouseDto) { return this.inventory.updateWarehouse(id, dto); }

  @Delete('warehouses/:id')
  deleteWarehouse(@Param('id') id: string) { return this.inventory.deleteWarehouse(id); }

  @Get('warehouses/:id/locations')
  listWarehouseLocations(@Param('id') id: string) { return this.inventory.listLocations(id); }

  @Post('warehouses/:id/locations')
  createWarehouseLocation(@Param('id') id: string, @Body() dto: Omit<CreateLocationDto, 'warehouseId'>) { return this.inventory.createLocation({ ...dto, warehouseId: id }); }

  @Patch('warehouses/:warehouseId/locations/:id')
  updateWarehouseLocation(@Param('warehouseId') warehouseId: string, @Param('id') id: string, @Body() dto: UpdateLocationDto) { return this.inventory.updateLocation(id, { ...dto, warehouseId }); }

  @Delete('warehouses/:warehouseId/locations/:id')
  deleteWarehouseLocation(@Param('id') id: string) { return this.inventory.deleteLocation(id); }

  @Get('locations')
  listLocations(@Query('warehouseId') warehouseId?: string) { return this.inventory.listLocations(warehouseId); }

  @Post('locations')
  createLocation(@Body() dto: CreateLocationDto) { return this.inventory.createLocation(dto); }

  @Patch('locations/:id')
  updateLocation(@Param('id') id: string, @Body() dto: UpdateLocationDto) { return this.inventory.updateLocation(id, dto); }

  @Delete('locations/:id')
  deleteLocation(@Param('id') id: string) { return this.inventory.deleteLocation(id); }

  @Get('stock-levels')
  listStock(@Query('productId') productId?: string, @Query('warehouseId') warehouseId?: string) { return this.inventory.listStock(productId, warehouseId); }

  @Get('stock-alerts/low-stock')
  lowStockAlerts(@Query('warehouseId') warehouseId?: string, @Query('productId') productId?: string) { return this.inventory.lowStockAlerts(productId, warehouseId); }

  @Get('stock-alerts/aging')
  agingAlerts(@Query('warehouseId') warehouseId?: string, @Query('days') days?: string) { return this.inventory.agingAlerts(warehouseId, days ? Number(days) : undefined); }

  @Get('stock-movements')
  listMovements(@Query('productId') productId?: string, @Query('warehouseId') warehouseId?: string) { return this.inventory.listMovements(productId, warehouseId); }

  @Post('stock-levels')
  upsertStock(@Body() dto: UpsertStockDto) { return this.inventory.upsertStock(dto); }

  @Post('stock-levels/adjust')
  adjustStock(@Body() dto: AdjustStockDto) { return this.inventory.adjustStock(dto); }
}
