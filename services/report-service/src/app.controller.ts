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
  inventoryValue() {
    return this.reports.inventoryValue();
  }

  @Get('low-stock')
  lowStock() {
    return this.reports.lowStock();
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
  @Header('content-type', 'text/csv; charset=utf-8')
  exportExcel(@Query('kind') kind?: 'inventory' | 'low-stock' | 'movements') {
    return this.reports.exportCsv(kind || 'inventory');
  }

  @Get('export/pdf')
  async exportPdf(@Res() res: any) {
    const pdf = await this.reports.exportPdfBuffer();
    res.setHeader('content-type', 'application/pdf');
    res.setHeader('content-disposition', 'attachment; filename="wms-report.pdf"');
    return res.send(pdf);
  }
}
