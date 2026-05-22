import { Controller, Get, Res } from '@nestjs/common';

@Controller()
export class HealthController {
  @Get('health')
  health() { return { service: 'inventory-service', status: 'ok', timestamp: new Date().toISOString() }; }

  @Get('metrics')
  metrics(@Res() res: any) {
    res.type('text/plain');
    return res.send([
      `wms_inventory_service_uptime_seconds ${Math.floor(process.uptime())}`,
      `wms_inventory_service_memory_rss_bytes ${process.memoryUsage().rss}`,
    ].join('\n') + '\n');
  }
}
