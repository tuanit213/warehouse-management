import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from './database';

const amqp = require('amqplib');

type OutboxRow = {
  id: string;
  event_type: string;
  aggregate_id: string;
  payload: Record<string, unknown>;
  attempts: number;
};

@Injectable()
export class TransactionOutboxPublisher implements OnModuleInit, OnModuleDestroy {
  constructor(@Inject(PG_POOL) private readonly db: Pool) {}

  private readonly enabled = process.env.TRANSACTION_OUTBOX_PUBLISHER_ENABLED !== 'false';
  private readonly rabbitUrl = process.env.RABBITMQ_URL || 'amqp://rabbitmq:5672';
  private readonly exchange = process.env.TRANSACTION_OUTBOX_EXCHANGE || 'wms.transaction.events';
  private readonly deadExchange = process.env.TRANSACTION_OUTBOX_DEAD_EXCHANGE || 'wms.transaction.events.dead';
  private readonly deadQueue = process.env.TRANSACTION_OUTBOX_DEAD_QUEUE || 'wms.transaction.events.dead';
  private readonly pollMs = Number(process.env.TRANSACTION_OUTBOX_POLL_MS || 2000);
  private readonly batchSize = Number(process.env.TRANSACTION_OUTBOX_BATCH_SIZE || 25);
  private readonly maxAttempts = Number(process.env.TRANSACTION_OUTBOX_MAX_ATTEMPTS || 10);
  private readonly stalePublishingMinutes = Number(process.env.TRANSACTION_OUTBOX_STALE_MINUTES || 5);

  private timer?: NodeJS.Timeout;
  private running = false;
  private connection: any;
  private channel: any;

  async onModuleInit() {
    if (!this.enabled) {
      this.log('info', 'outbox_publisher_disabled');
      return;
    }
    await this.releaseStalePublishingEvents();
    this.timer = setInterval(() => void this.drain(), this.pollMs);
    void this.drain();
  }

  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    await this.closeRabbit();
  }

  async drain() {
    if (this.running) return;
    this.running = true;
    try {
      for (let index = 0; index < this.batchSize; index += 1) {
        const row = await this.claimNext();
        if (!row) break;
        await this.publishRow(row);
      }
    } catch (error) {
      this.log('warn', 'outbox_drain_failed', { message: this.errorMessage(error) });
      await this.closeRabbit();
    } finally {
      this.running = false;
    }
  }

  private async claimNext(): Promise<OutboxRow | null> {
    const result = await this.db.query(
      `UPDATE transaction_outbox_events
       SET status='PUBLISHING', updated_at=NOW()
       WHERE id = (
         SELECT id
         FROM transaction_outbox_events
         WHERE (
           status='PENDING'
           AND next_attempt_at <= NOW()
           AND attempts < $1
         ) OR (
           status='PUBLISHING'
           AND updated_at < NOW() - ($2 || ' minutes')::interval
         )
         ORDER BY created_at ASC
         FOR UPDATE SKIP LOCKED
         LIMIT 1
       )
       RETURNING id, event_type, aggregate_id, payload, attempts`,
      [this.maxAttempts, this.stalePublishingMinutes],
    );
    return result.rows[0] || null;
  }

  private async publishRow(row: OutboxRow) {
    try {
      const channel = await this.ensureChannel();
      const body = Buffer.from(JSON.stringify({
        id: row.id,
        eventType: row.event_type,
        aggregateId: row.aggregate_id,
        payload: row.payload,
        occurredAt: new Date().toISOString(),
      }));
      await new Promise<void>((resolve, reject) => {
        channel.publish(this.exchange, row.event_type, body, {
          contentType: 'application/json',
          deliveryMode: 2,
          messageId: row.id,
          timestamp: Math.floor(Date.now() / 1000),
        }, (error: Error | null) => error ? reject(error) : resolve());
      });
      await this.db.query(
        `UPDATE transaction_outbox_events
         SET status='PUBLISHED', published_at=NOW(), updated_at=NOW()
         WHERE id=$1`,
        [row.id],
      );
      this.log('info', 'outbox_event_published', { eventId: row.id, eventType: row.event_type });
    } catch (error) {
      await this.markFailed(row, error);
      throw error;
    }
  }

  private async ensureChannel() {
    if (this.channel) return this.channel;
    this.connection = await amqp.connect(this.rabbitUrl);
    this.connection.on('error', (error: Error) => this.log('warn', 'rabbitmq_connection_error', { message: this.errorMessage(error) }));
    this.connection.on('close', () => {
      this.log('warn', 'rabbitmq_connection_closed');
      this.channel = undefined;
      this.connection = undefined;
    });
    this.channel = await this.connection.createConfirmChannel();
    await this.channel.assertExchange(this.exchange, 'topic', { durable: true });
    await this.channel.assertExchange(this.deadExchange, 'topic', { durable: true });
    await this.channel.assertQueue(this.deadQueue, { durable: true });
    await this.channel.bindQueue(this.deadQueue, this.deadExchange, '#');
    return this.channel;
  }

  private async markFailed(row: OutboxRow, error: unknown) {
    const nextAttempts = Number(row.attempts || 0) + 1;
    const permanentlyFailed = nextAttempts >= this.maxAttempts;
    const delaySeconds = Math.min(300, Math.max(5, nextAttempts * nextAttempts * 5));
    await this.db.query(
      `UPDATE transaction_outbox_events
       SET status=$1,
           attempts=$2,
           next_attempt_at=NOW() + ($3 || ' seconds')::interval,
           updated_at=NOW(),
           payload = payload || jsonb_build_object('lastPublishError', $4::text)
       WHERE id=$5`,
      [permanentlyFailed ? 'FAILED' : 'PENDING', nextAttempts, delaySeconds, this.errorMessage(error), row.id],
    );
    if (permanentlyFailed) await this.publishDeadLetter(row, error);
  }

  private async publishDeadLetter(row: OutboxRow, error: unknown) {
    try {
      const channel = await this.ensureChannel();
      await new Promise<void>((resolve, reject) => {
        channel.publish(this.deadExchange, row.event_type, Buffer.from(JSON.stringify({
          id: row.id,
          eventType: row.event_type,
          aggregateId: row.aggregate_id,
          payload: row.payload,
          error: this.errorMessage(error),
          failedAt: new Date().toISOString(),
        })), {
          contentType: 'application/json',
          deliveryMode: 2,
          messageId: `${row.id}:failed`,
          timestamp: Math.floor(Date.now() / 1000),
        }, (publishError: Error | null) => publishError ? reject(publishError) : resolve());
      });
    } catch (deadLetterError) {
      this.log('warn', 'outbox_dead_letter_publish_failed', { eventId: row.id, message: this.errorMessage(deadLetterError) });
    }
  }

  private async releaseStalePublishingEvents() {
    await this.db.query(
      `UPDATE transaction_outbox_events
       SET status='PENDING', next_attempt_at=NOW(), updated_at=NOW()
       WHERE status='PUBLISHING'
         AND updated_at < NOW() - ($1 || ' minutes')::interval`,
      [this.stalePublishingMinutes],
    );
  }

  private async closeRabbit() {
    try { if (this.channel) await this.channel.close(); } catch {}
    try { if (this.connection) await this.connection.close(); } catch {}
    this.channel = undefined;
    this.connection = undefined;
  }

  private errorMessage(error: unknown) {
    return (error instanceof Error ? error.message : String(error || 'Unknown error')).slice(0, 500);
  }

  private log(level: 'info' | 'warn' | 'error', event: string, fields: Record<string, unknown> = {}) {
    console.log(JSON.stringify({ service: 'transaction-service', level, event, timestamp: new Date().toISOString(), ...fields }));
  }
}
