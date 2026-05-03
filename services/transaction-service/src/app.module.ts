import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { databaseProvider } from './database';
import { HealthController } from './health.controller';
import { TransactionService } from './transaction.service';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  controllers: [AppController, HealthController],
  providers: [databaseProvider, TransactionService],
})
export class AppModule {}
