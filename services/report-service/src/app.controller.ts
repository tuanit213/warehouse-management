import { Controller, Get, Header, Query, Res } from '@nestjs/common';
import { ReportService } from './report.service';

@Controller('reports')
export class AppController {
  constructor(private readonly reports: ReportService) {}

  @Get('dashboard')
  dashboard() {
    return this.reports.dashboard();
  }

  @Get('summary')
  summary() {
    return this.reports.operationalSummary();
  }

  @Get('inventory-value')
  inventoryValue(@Query('productId') productId?: string, @Query('warehouseId') warehouseId?: string) {
    return this.reports.inventoryValue(productId, warehouseId);
  }

  @Get('low-stock')
  lowStock(@Query('productId') productId?: string, @Query('warehouseId') warehouseId?: string) {
    return this.reports.lowStock(productId, warehouseId);
  }

  @Get('stock-movements')
  stockMovements(@Query('productId') productId?: string, @Query('warehouseId') warehouseId?: string) {
    return this.reports.stockMovements(productId, warehouseId);
  }

  @Get('inout-chart')
  inoutChart(@Query('from') from?: string, @Query('to') to?: string) {
    return this.reports.inoutChart(from, to);
  }

  @Get('export/excel')
  async exportExcel(
    @Query('kind') kind: 'inventory' | 'low-stock' | 'movements' | undefined,
    @Query('productId') productId: string | undefined,
    @Query('warehouseId') warehouseId: string | undefined,
    @Res() res: any,
  ) {
    const reportKind = kind || 'inventory';
    const xlsx = await this.reports.exportXlsx(reportKind, productId, warehouseId);
    res.setHeader('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('content-disposition', `attachment; filename="wms-${reportKind}.xlsx"`);
    return res.send(xlsx);
  }

  @Get('export/pdf')
  async exportPdf(@Query('productId') productId: string | undefined, @Query('warehouseId') warehouseId: string | undefined, @Res() res: any) {
    const pdf = await this.reports.exportPdfBuffer(productId, warehouseId);
    res.setHeader('content-type', 'application/pdf');
    res.setHeader('content-disposition', 'attachment; filename="wms-report.pdf"');
    return res.send(pdf);
  }
}
