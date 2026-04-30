import { Controller, Get } from '@nestjs/common';
@Controller('health')
export class HealthController {
  @Get()
  health() { return { service: 'auth-service', status: 'ok', timestamp: new Date().toISOString() }; }
}
