import { Controller, Get } from '@nestjs/common';
@Controller('health')
export class HealthController {
  @Get()
  health() { return { service: 'transaction-service', status: 'ok', timestamp: new Date().toISOString() }; }
}
