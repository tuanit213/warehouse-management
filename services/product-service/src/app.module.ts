import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database';
import { HealthController } from './health.controller';
import { ProductController } from './product.controller';
import { ProductService } from './product.service';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), DatabaseModule],
  controllers: [ProductController, HealthController],
  providers: [ProductService],
})
export class AppModule {}
