import { Kafka, Producer } from 'kafkajs';
import { SignalClosedEvent } from '@shared/schema';

const KAFKA_TOPICS = {
  TRADE_SIGNAL_EVENTS: 'TRADE_SIGNAL_EVENTS'
};

export class KafkaProducer {
  private kafka: Kafka;
  private producer: Producer | null = null;
  private isConnected: boolean = false;

  constructor() {
    this.kafka = new Kafka({
      clientId: 'trade-signal-producer',
      brokers: [process.env.KAFKA_BROKER || 'localhost:9092'],
      connectionTimeout: 30000,
      requestTimeout: 30000,
      retry: {
        initialRetryTime: 100,
        retries: 8
      }
    });
  }

  async connect(): Promise<void> {
    try {
      if (this.isConnected) {
        console.log('Kafka producer already connected');
        return;
      }

      this.producer = this.kafka.producer({
        maxInFlightRequests: 1,
        idempotent: true,
        transactionTimeout: 30000,
      });

      await this.producer.connect();
      this.isConnected = true;
      
      console.log('✓ Kafka producer connected successfully');
    } catch (error) {
      console.error('Failed to connect Kafka producer:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    try {
      if (this.producer && this.isConnected) {
        await this.producer.disconnect();
        this.isConnected = false;
        console.log('✓ Kafka producer disconnected');
      }
    } catch (error) {
      console.error('Failed to disconnect Kafka producer:', error);
    }
  }

  async publishSignalClosed(eventData: {
    uuid: string;
    trader_id: string;
    channel_id: number;
    execution_price: number;
    closed_at: Date;
    performance: string;
    riskRewardRatio: number;
    signalStrength: number;
    status: 'tp_hit' | 'sl_hit' | 'expired';
  }): Promise<void> {
    try {
      if (!this.producer || !this.isConnected) {
        throw new Error('Kafka producer not connected');
      }

      const signalClosedEvent: SignalClosedEvent = {
        version: '1.0.0',
        eventType: "SIGNAL_CLOSED",
        timestamp: new Date().toISOString(),
        data: {
          uuid: eventData.uuid,
          trader_id: eventData.trader_id,
          channel_id: eventData.channel_id,
          execution_price: eventData.execution_price,
          closed_at: eventData.closed_at.toISOString(),
          performance: eventData.performance,
          riskRewardRatio: eventData.riskRewardRatio,
          signalStrength: eventData.signalStrength,
          status: eventData.status
        }
      };

      const message = {
        topic: KAFKA_TOPICS.TRADE_SIGNAL_EVENTS,
        messages: [
          {
            key: eventData.uuid,
            value: JSON.stringify(signalClosedEvent),
            timestamp: Date.now().toString()
          }
        ]
      };

      await this.producer.send(message);
      
      console.log(`✓ Published SIGNAL_CLOSED event for signal ${eventData.uuid} with status ${eventData.status}`);
      
    } catch (error) {
      console.error('Failed to publish SIGNAL_CLOSED event:', error);
      throw error;
    }
  }

  isProducerConnected(): boolean {
    return this.isConnected;
  }
}