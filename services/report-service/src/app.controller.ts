import { Body, Controller, Get, Post } from '@nestjs/common';
@Controller('report')
export class AppController {
  @Get()
  list() { return { service: 'report-service', message: 'Dashboards, inventory valuation, charts and Excel/PDF reporting.', items: [] }; }

  @Post()
  create(@Body() body: Record<string, unknown>) { return { service: 'report-service', created: true, data: body }; }
}
