import { Body, Controller, Get, Post } from '@nestjs/common';
@Controller('auth')
export class AppController {
  @Get()
  list() { return { service: 'auth-service', message: 'Authentication, user accounts, roles and JWT issuing.', items: [] }; }

  @Post()
  create(@Body() body: Record<string, unknown>) { return { service: 'auth-service', created: true, data: body }; }
}
