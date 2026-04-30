import { Controller, Get } from '@nestjs/common';
@Controller('health')
export class HealthController {
  @Get()
  health() { return { service: 'api-gateway', status: 'ok', timestamp: new Date().toISOString() }; }
}
