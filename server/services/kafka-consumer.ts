import { Consumer, Kafka } from "kafkajs";
import { IStorage } from "../storage";
import { RedisClient } from "./redis-client";
import { StartupSyncService } from "./startup-sync";

// Topics configuration
const KAFKA_TOPICS = {
  TRADE_SIGNAL_EVENTS: "TRADE_SIGNAL_EVENTS",
};

// Event types
const TRADE_SIGNAL_EVENTS = {
  SIGNAL_CREATED: "SIGNAL_CREATED",
};

export class KafkaConsumer {
  private kafka: Kafka;
  private consumer: Consumer | null = null;
  private running = false;
  private schemas: { [key: string]: any } = {};

  constructor(
    private storage: IStorage,
    private redisClient: RedisClient,
  ) {
    const brokerUrl = process.env.KAFKA_BROKER_URL || "51.79.84.45:9092";

    this.kafka = new Kafka({
      clientId: "trade-signal-monitor",
      brokers: [brokerUrl],
    });

    this._loadSchemas();
  }

  private _loadSchemas(): void {
    // For now, we'll use basic validation instead of loading JSON schemas
    // This matches the concept from Python but simplified for TypeScript
    this.schemas[TRADE_SIGNAL_EVENTS.SIGNAL_CREATED] = {
      required: ["eventType", "data"],
      dataRequired: [
        "uuid",
        "trader_id",
        "channel_id",
        "asset_symbol",
        "entry_price",
        "target_price",
        "signal_type",
      ],
    };
    console.log("✓ Event schemas loaded successfully");
  }

  async connect(): Promise<void> {
    if (this.running) {
      console.warn("Kafka consumer is already running");
      return;
    }

    // Run startup synchronization before starting consumer
    const startupSync = new StartupSyncService(this.storage, this.redisClient);
    await startupSync.synchronizeSignals();

    await this._consumerLoop();
  }

  private async _consumerLoop(): Promise<void> {
    try {
      // Subscribe to topics
      const topics = [KAFKA_TOPICS.TRADE_SIGNAL_EVENTS];

      this.consumer = this.kafka.consumer({
        groupId: "signal-monitor-group",
        sessionTimeout: 30000,
        heartbeatInterval: 3000,
      });

      await this.consumer.connect();

      // Subscribe to all relevant topics
      for (const topic of topics) {
        await this.consumer.subscribe({ topic, fromBeginning: false });
      }

      console.log(
        `✓ Kafka consumer connected to ${process.env.KAFKA_BROKER_URL || "51.79.84.45:9092"}`,
      );
      console.log(`✓ Subscribed to topics: ${topics.join(", ")}`);

      this.running = true;

      await this.consumer.run({
        eachMessage: async ({ topic, partition, message }) => {
          if (!this.running) return;
          await this._processMessage(message);
        },
      });
    } catch (error) {
      console.error("Failed to start Kafka consumer:", error);
      throw error;
    }
  }

  private async _processMessage(message: any): Promise<void> {
    try {
      if (!message.value) return;

      // Parse message
      const eventData = JSON.parse(message.value.toString());

      // Validate against schema
      if (!this._validateEvent(eventData)) {
        return;
      }

      const eventType = eventData.eventType || eventData.event_type;
      console.log(`Processing ${eventType} event`);

      // Route to appropriate handler
      if (eventType === TRADE_SIGNAL_EVENTS.SIGNAL_CREATED) {
        await this._handleSignalCreated(eventData);
      } else {
        console.warn(`Unknown event type: ${eventType}`);
      }
    } catch (error) {
      if (error instanceof SyntaxError) {
        console.error("Failed to parse JSON message:", error.message);
      } else {
        console.error("Failed to process message:", error);
      }
    }
  }

  private _validateEvent(eventData: any): boolean {
    try {
      // Support both eventType and event_type formats
      const eventType = eventData.eventType || eventData.event_type;
      if (!eventType) {
        console.error("Missing event type in message");
        return false;
      }

      const schema = this.schemas[eventType];
      if (!schema) {
        console.error(`Unknown event type: ${eventType}`);
        return false;
      }

      // Basic validation - check required fields
      for (const field of schema.required) {
        if (!eventData[field]) {
          console.error(`Missing required field: ${field}`);
          return false;
        }
      }

      // Validate data fields if present
      if (eventData.data && schema.dataRequired) {
        for (const field of schema.dataRequired) {
          if (eventData.data[field] === undefined) {
            console.error(`Missing required data field: ${field}`);
            return false;
          }
        }
      }

      return true;
    } catch (error) {
      console.error("Validation error:", error);
      return false;
    }
  }

  private async _handleSignalCreated(eventData: any): Promise<void> {
    try {
      const data = eventData.data || eventData;
      const tradeSignal = await this.storage.createTradeSignal({
        id: data.id,
        uuid: data.uuid,
        trader_id: data.trader_id,
        channel_id: data.channel_id,
        channel_uuid: data.channel_uuid,
        visibility: data.visibility,
        signal_type: data.signal_type,
        asset_symbol: data.asset_symbol,
        entry_price: data.entry_price,
        target_price: data.target_price,
        stop_loss_price: data.stop_loss_price,
        trade_price: data.trade_price,
        performance_rating: data.performance_rating,
        leverage: data.leverage,
        ttl: data.ttl,
        created_at: data.created_at,
        status: "active",
      });

      const redisKey = `${data.channel_id}:${data.asset_symbol}:${data.uuid}`;
      const ttl = data.ttl || "24h";
      const hours = parseInt(ttl.replace("h", ""));
      const ttlSeconds = hours * 3600;

      if (this.redisClient) {
        await this.redisClient.setSignal(
          redisKey,
          {
            signal_type: data.signal_type,
            entry_price: data.entry_price,
            target_price: data.target_price,
            stop_loss_price: data.stop_loss_price,
            leverage: data.leverage,
            ttl: data.ttl,
            created_at: data.created_at,
            status: "active",
          },
          ttlSeconds,
        );
      }

      console.log(`✓ Created trade signal ${data.uuid} from external event`);
    } catch (error) {
      console.error("Failed to handle SIGNAL_CREATED event:", error);
    }
  }

  async disconnect(): Promise<void> {
    if (!this.running) {
      return;
    }

    this.running = false;
    if (this.consumer) {
      await this.consumer.disconnect();
      this.consumer = null;
    }
    console.log("✓ Kafka consumer stopped");
  }

  isConnected(): boolean {
    return this.running && this.consumer !== null;
  }
}
