import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { databaseProvider } from './database';
import { HealthController } from './health.controller';
import { InventoryService } from './inventory.service';
import { TransactionEventConsumer } from './transaction-event.consumer';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  controllers: [AppController, HealthController],
  providers: [databaseProvider, InventoryService, TransactionEventConsumer],
})
export class AppModule {}
