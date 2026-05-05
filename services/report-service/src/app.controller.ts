import { Controller, Get, Header, Query } from '@nestjs/common';
import { ReportService } from './report.service';

@Controller('reports')
export class AppController {
  constructor(private readonly reports: ReportService) {}

  @Get('dashboard')
  dashboard() {
    return this.reports.dashboard();
  }

  @Get('inventory-value')
  inventoryValue() {
    return this.reports.inventoryValue();
  }

  @Get('inout-chart')
  inoutChart(@Query('from') from?: string, @Query('to') to?: string) {
    return this.reports.inoutChart(from, to);
  }

  @Get('export/excel')
  @Header('content-type', 'text/csv; charset=utf-8')
  @Header('content-disposition', 'attachment; filename="wms-inventory-report.csv"')
  exportExcel() {
    return this.reports.exportCsv();
  }

  @Get('export/pdf')
  @Header('content-type', 'application/pdf')
  @Header('content-disposition', 'attachment; filename="wms-report.pdf"')
  exportPdf() {
    return this.reports.exportPdfText();
  }
}
