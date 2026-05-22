import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InventoryService } from './inventory.service';

const amqp = require('amqplib');

type TransactionConfirmedEvent = {
  id: string;
  eventType: string;
  aggregateId: string;
  payload: {
    transactionId: string;
    type: 'INBOUND' | 'OUTBOUND';
    warehouseId: string;
    items?: Array<{
      id: string;
      productId: string;
      locationId?: string | null;
      quantity: number;
      unitPrice?: number;
    }>;
  };
};

@Injectable()
export class TransactionEventConsumer implements OnModuleInit, OnModuleDestroy {
  constructor(private readonly inventory: InventoryService) {}

  private readonly enabled = process.env.INVENTORY_TRANSACTION_CONSUMER_ENABLED !== 'false';
  private readonly rabbitUrl = process.env.RABBITMQ_URL || 'amqp://rabbitmq:5672';
  private readonly exchange = process.env.TRANSACTION_OUTBOX_EXCHANGE || 'wms.transaction.events';
  private readonly queue = process.env.INVENTORY_TRANSACTION_EVENTS_QUEUE || 'wms.inventory.transaction-events';
  private readonly deadExchange = process.env.INVENTORY_TRANSACTION_DEAD_EXCHANGE || 'wms.inventory.transaction-events.dead';
  private readonly deadQueue = process.env.INVENTORY_TRANSACTION_DEAD_QUEUE || 'wms.inventory.transaction-events.dead';

  private connection: any;
  private channel: any;

  async onModuleInit() {
    if (!this.enabled) {
      this.log('info', 'transaction_event_consumer_disabled');
      return;
    }
    await this.connect();
  }

  async onModuleDestroy() {
    try { if (this.channel) await this.channel.close(); } catch {}
    try { if (this.connection) await this.connection.close(); } catch {}
  }

  private async connect() {
    try {
      this.connection = await amqp.connect(this.rabbitUrl);
      this.connection.on('error', (error: Error) => this.log('warn', 'rabbitmq_connection_error', { message: this.errorMessage(error) }));
      this.connection.on('close', () => {
        this.log('warn', 'rabbitmq_connection_closed');
        this.channel = undefined;
        this.connection = undefined;
      });
      this.channel = await this.connection.createChannel();
      await this.channel.assertExchange(this.exchange, 'topic', { durable: true });
      await this.channel.assertExchange(this.deadExchange, 'topic', { durable: true });
      await this.channel.assertQueue(this.deadQueue, { durable: true });
      await this.channel.bindQueue(this.deadQueue, this.deadExchange, '#');
      await this.channel.assertQueue(this.queue, { durable: true, deadLetterExchange: this.deadExchange });
      await this.channel.bindQueue(this.queue, this.exchange, 'transaction.confirmed');
      await this.channel.prefetch(Number(process.env.INVENTORY_TRANSACTION_CONSUMER_PREFETCH || 10));
      await this.channel.consume(this.queue, (message: any) => void this.handleMessage(message), { noAck: false });
      this.log('info', 'transaction_event_consumer_started', { queue: this.queue, exchange: this.exchange });
    } catch (error) {
      this.log('warn', 'transaction_event_consumer_start_failed', { message: this.errorMessage(error) });
      setTimeout(() => void this.connect(), Number(process.env.INVENTORY_TRANSACTION_CONSUMER_RECONNECT_MS || 5000));
    }
  }

  private async handleMessage(message: any) {
    if (!message) return;
    try {
      const event = JSON.parse(message.content.toString('utf8')) as TransactionConfirmedEvent;
      if (event.eventType !== 'transaction.confirmed') {
        this.channel.ack(message);
        return;
      }
      const items = event.payload.items || [];
      if (!event.payload.transactionId || !event.payload.warehouseId || !items.length) {
        throw new Error('Invalid transaction.confirmed event payload');
      }
      for (const item of items) {
        const delta = event.payload.type === 'INBOUND' ? Number(item.quantity || 0) : -Number(item.quantity || 0);
        await this.inventory.adjustStock({
          productId: item.productId,
          warehouseId: event.payload.warehouseId,
          locationId: item.locationId || undefined,
          delta,
          referenceId: item.id,
          note: `Transaction event ${event.payload.transactionId} item ${item.id} stock adjustment`,
        }, { userEmail: 'transaction-event-consumer' });
      }
      this.channel.ack(message);
      this.log('info', 'transaction_confirmed_event_consumed', { eventId: event.id, transactionId: event.payload.transactionId, itemCount: items.length });
    } catch (error) {
      this.log('error', 'transaction_event_consume_failed', { message: this.errorMessage(error) });
      this.channel.nack(message, false, false);
    }
  }

  private errorMessage(error: unknown) {
    return (error instanceof Error ? error.message : String(error || 'Unknown error')).slice(0, 500);
  }

  private log(level: 'info' | 'warn' | 'error', event: string, fields: Record<string, unknown> = {}) {
    console.log(JSON.stringify({ service: 'inventory-service', level, event, timestamp: new Date().toISOString(), ...fields }));
  }
}
