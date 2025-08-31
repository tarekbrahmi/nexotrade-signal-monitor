import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { KafkaConsumer } from "./services/kafka-consumer";
import { KafkaProducer } from "./services/kafka-producer";
import { MarketDataClient } from "./services/market-data-client";
import { MySQLClient } from "./services/mysql-client";
import { RedisClient } from "./services/redis-client";
import { SignalMonitor } from "./services/signal-monitor";
import { WebSocketServer } from "./services/websocket-server";
const app = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 5000;

app.get("/", (req, res) => {
  res.json({
    status: "running",
    service: "Trade Signal Monitor Backend",
    timestamp: new Date().toISOString(),
  });
});

(async () => {
  try {
    // Initialize MySQL client - CRITICAL
    let mysqlClient: MySQLClient | null = null;
    try {
      mysqlClient = new MySQLClient();
      console.log("✓ MySQL client initialized");
    } catch (error) {
      console.error(
        "💥 CRITICAL: MySQL client initialization failed!",
        (error as Error).message,
      );
      process.exit(1);
    }

    // Initialize Redis client - CRITICAL
    let redisClient: RedisClient | null = null;
    try {
      redisClient = new RedisClient();
      await redisClient.connect();
      console.log("✓ Redis client connected successfully");
    } catch (error) {
      console.error(
        "💥 CRITICAL: Redis connection failed!",
        (error as Error).message,
      );
      process.exit(1);
    }

    // Initialize Kafka producer - NON-CRITICAL (optional service)
    console.log("Connecting to Kafka producer...");
    let kafkaProducer: KafkaProducer | null = null;
    try {
      kafkaProducer = new KafkaProducer();
      await kafkaProducer.connect();
      console.log("✓ Kafka producer connected and ready to publish events");
    } catch (error) {
      console.warn(
        "⚠️  WARNING: Kafka producer connection failed - continuing without event publishing:",
        (error as Error).message,
      );
      console.log(
        "System will continue to work but SIGNAL_CLOSED events won't be published to Kafka",
      );
      kafkaProducer = null;
    }

    // Initialize signal monitor with MySQL storage and Kafka producer
    console.log("Initializing signal monitor...");
    const signalMonitor = new SignalMonitor(
      mysqlClient,
      redisClient,
      kafkaProducer,
    );

    // Initialize WebSocket server
    console.log("Initializing WebSocket server...");
    const wsServer = new WebSocketServer(httpServer, signalMonitor);
    console.log("✓ WebSocket server initialized");

    // Initialize market data client - CRITICAL
    console.log("Connecting to market data WebSocket...");
    const marketDataClient = new MarketDataClient(signalMonitor);
    try {
      await marketDataClient.connect();
      console.log("✓ Market data client connected");
    } catch (error) {
      console.error(
        "💥 CRITICAL: Market data WebSocket connection failed!",
        (error as Error).message,
      );
      process.exit(1);
    }

    // Initialize Kafka consumer with MySQL storage - NON-CRITICAL (optional service)
    console.log("Connecting to Kafka...");
    let kafkaConsumer: KafkaConsumer | null = null;
    try {
      kafkaConsumer = new KafkaConsumer(mysqlClient, redisClient);
      await kafkaConsumer.connect();
      console.log(
        "✓ Kafka consumer connected and listening for SIGNAL_CREATED events",
      );
    } catch (error) {
      console.warn(
        "⚠️  WARNING: Kafka consumer connection failed - continuing without external signal events:",
        (error as Error).message,
      );
      console.log(
        "System will continue to work but won't receive external SIGNAL_CREATED events",
      );
      kafkaConsumer = null;
    }

    // Start the HTTP server (with Socket.IO attached)
    httpServer.listen(Number(PORT), "0.0.0.0", () => {
      console.log(
        `\n🚀 Trade Signal Monitor Backend is running on port ${PORT}!`,
      );
      console.log("- Listening for SIGNAL_CREATED events on Kafka");
      console.log("- Publishing SIGNAL_CLOSED events to Kafka");
      console.log("- Processing real-time market data from WebSocket");
      console.log("- Monitoring active trade signals");
      console.log("- WebSocket server ready for trader connections");
      console.log(
        `- Health check available at http://localhost:${PORT}/health`,
      );
    });

    // Keep the process running
    process.on("SIGINT", async () => {
      console.log("\nShutting down gracefully...");

      if (redisClient) {
        await redisClient.disconnect();
        console.log("✓ Redis disconnected");
      }

      if (mysqlClient) {
        await mysqlClient.disconnect();
        console.log("✓ MySQL disconnected");
      }

      marketDataClient.disconnect();
      console.log("✓ Market data client disconnected");

      if (kafkaConsumer) {
        await kafkaConsumer.disconnect();
        console.log("✓ Kafka consumer disconnected");
      }

      if (kafkaProducer) {
        await kafkaProducer.disconnect();
        console.log("✓ Kafka producer disconnected");
      }

      console.log("✓ Shutdown complete");
      process.exit(0);
    });

    // Kafka consumer is now set up to listen for events automatically
    // No need for periodic polling - events are processed as they arrive
  } catch (error) {
    console.error("❌ Failed to start Trade Signal Monitor Backend:", error);
    process.exit(1);
  }
})();
