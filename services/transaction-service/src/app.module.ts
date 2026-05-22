import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { databaseProvider } from './database';
import { HealthController } from './health.controller';
import { TransactionOutboxPublisher } from './transaction-outbox.publisher';
import { TransactionService } from './transaction.service';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  controllers: [AppController, HealthController],
  providers: [databaseProvider, TransactionService, TransactionOutboxPublisher],
})
export class AppModule {}
