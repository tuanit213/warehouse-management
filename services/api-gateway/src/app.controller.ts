import { Body, Controller, Get, Post } from '@nestjs/common';
@Controller('gateway')
export class AppController {
  @Get('routes')
  routes() { return {
    auth: 'http://auth-service:3001/api', product: 'http://product-service:3002/api', inventory: 'http://inventory-service:3003/api', transaction: 'http://transaction-service:3004/api', report: 'http://report-service:3005/api'
  }; }
}
