import { Body, Controller, Get, Post } from '@nestjs/common';
@Controller('transaction')
export class AppController {
  @Get()
  list() { return { service: 'transaction-service', message: 'Inbound/outbound stock vouchers, stock movement history and PDF exports.', items: [] }; }

  @Post()
  create(@Body() body: Record<string, unknown>) { return { service: 'transaction-service', created: true, data: body }; }
}
