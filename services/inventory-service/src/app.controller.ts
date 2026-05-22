import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, Query } from '@nestjs/common';
import { AdjustStockDto, ApproveStocktakeDto, CreateLocationDto, CreateReservationDto, CreateStocktakeDto, CreateWarehouseDto, ReleaseReservationDto, ReservationQueryDto, TransferStockDto, UpdateLocationDto, UpdateStocktakeCountsDto, UpdateWarehouseDto, UpsertStockDto } from './dto';
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
  upsertStock(@Body() dto: UpsertStockDto, @Headers('x-user-id') userId?: string, @Headers('x-user-email') userEmail?: string) {
    return this.inventory.upsertStock(dto, { userId, userEmail });
  }

  @Post('stock-levels/adjust')
  adjustStock(@Body() dto: AdjustStockDto, @Headers('x-user-id') userId?: string, @Headers('x-user-email') userEmail?: string) {
    return this.inventory.adjustStock(dto, { userId, userEmail });
  }

  @Post('stock-transfers')
  transferStock(@Body() dto: TransferStockDto, @Headers('x-user-id') userId?: string, @Headers('x-user-email') userEmail?: string) {
    return this.inventory.transferStock(dto, { userId, userEmail });
  }

  @Get('stock-reservations')
  listReservations(@Query() query: ReservationQueryDto) { return this.inventory.listReservations(query); }

  @Post('stock-reservations')
  createReservation(@Body() dto: CreateReservationDto, @Headers('x-user-id') userId?: string, @Headers('x-user-email') userEmail?: string) {
    return this.inventory.createReservation(dto, { userId, userEmail });
  }

  @Post('stock-reservations/:id/release')
  releaseReservation(@Param('id') id: string, @Body() dto: ReleaseReservationDto, @Headers('x-user-id') userId?: string, @Headers('x-user-email') userEmail?: string) {
    return this.inventory.releaseReservation(id, dto, { userId, userEmail });
  }

  @Post('stock-reservations/release-reference/:referenceType/:referenceId')
  releaseReservationsForReference(@Param('referenceType') referenceType: string, @Param('referenceId') referenceId: string, @Body() dto: ReleaseReservationDto) {
    return this.inventory.releaseReservationsForReference(referenceType, referenceId, dto?.reason);
  }

  @Post('stock-reservations/consume-reference/:referenceType/:referenceId')
  consumeReservationsForReference(@Param('referenceType') referenceType: string, @Param('referenceId') referenceId: string, @Body() dto: ReleaseReservationDto) {
    return this.inventory.consumeReservationsForReference(referenceType, referenceId, dto?.reason);
  }

  @Get('stocktakes')
  listStocktakes() { return this.inventory.listStocktakes(); }

  @Get('stocktakes/:id')
  getStocktake(@Param('id') id: string) { return this.inventory.getStocktake(id); }

  @Post('stocktakes')
  createStocktake(@Body() dto: CreateStocktakeDto, @Headers('x-user-id') userId?: string, @Headers('x-user-email') userEmail?: string) {
    return this.inventory.createStocktake(dto, { userId, userEmail });
  }

  @Patch('stocktakes/:id/counts')
  updateStocktakeCounts(@Param('id') id: string, @Body() dto: UpdateStocktakeCountsDto, @Headers('x-user-id') userId?: string, @Headers('x-user-email') userEmail?: string) {
    return this.inventory.updateStocktakeCounts(id, dto, { userId, userEmail });
  }

  @Post('stocktakes/:id/approve')
  approveStocktake(@Param('id') id: string, @Body() dto: ApproveStocktakeDto, @Headers('x-user-id') userId?: string, @Headers('x-user-email') userEmail?: string) {
    return this.inventory.approveStocktake(id, dto, { userId, userEmail });
  }
}
