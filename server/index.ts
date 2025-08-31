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
import { logger } from "./services/logger";
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
      logger.info("MySQL client initialized");
    } catch (error) {
      logger.error(
        "CRITICAL: MySQL client initialization failed!",
        (error as Error).message,
      );
      process.exit(1);
    }

    // Initialize Redis client - CRITICAL
    let redisClient: RedisClient | null = null;
    try {
      redisClient = new RedisClient();
      await redisClient.connect();
      logger.info("Redis client connected successfully");
    } catch (error) {
      logger.error(
        "CRITICAL: Redis connection failed!",
        (error as Error).message,
      );
      process.exit(1);
    }

    // Initialize Kafka producer - NON-CRITICAL (optional service)
    logger.info("Connecting to Kafka producer...");
    let kafkaProducer: KafkaProducer | null = null;
    try {
      kafkaProducer = new KafkaProducer();
      await kafkaProducer.connect();
      logger.info("Kafka producer connected and ready to publish events");
    } catch (error) {
      logger.warn(
        "WARNING: Kafka producer connection failed - continuing without event publishing:",
        (error as Error).message,
      );
      logger.info(
        "System will continue to work but SIGNAL_CLOSED events won't be published to Kafka",
      );
      kafkaProducer = null;
    }

    // Initialize signal monitor with MySQL storage and Kafka producer
    logger.info("Initializing signal monitor...");
    const signalMonitor = new SignalMonitor(
      mysqlClient,
      redisClient,
      kafkaProducer,
    );

    // Initialize WebSocket server
    logger.info("Initializing WebSocket server...");
    const wsServer = new WebSocketServer(httpServer, signalMonitor);
    logger.info("WebSocket server initialized");

    // Initialize market data client - CRITICAL
    logger.info("Connecting to market data WebSocket...");
    const marketDataClient = new MarketDataClient(signalMonitor);
    try {
      await marketDataClient.connect();
      logger.info("Market data client connected");
    } catch (error) {
      logger.error(
        "CRITICAL: Market data WebSocket connection failed!",
        (error as Error).message,
      );
      process.exit(1);
    }

    // Initialize Kafka consumer with MySQL storage - NON-CRITICAL (optional service)
    logger.info("Connecting to Kafka...");
    let kafkaConsumer: KafkaConsumer | null = null;
    try {
      kafkaConsumer = new KafkaConsumer(mysqlClient, redisClient);
      await kafkaConsumer.connect();
      logger.info(
        "Kafka consumer connected and listening for SIGNAL_CREATED events",
      );
    } catch (error) {
      logger.warn(
        "WARNING: Kafka consumer connection failed - continuing without external signal events:",
        (error as Error).message,
      );
      logger.info(
        "System will continue to work but won't receive external SIGNAL_CREATED events",
      );
      kafkaConsumer = null;
    }

    // Start the HTTP server (with Socket.IO attached)
    httpServer.listen(Number(PORT), "0.0.0.0", () => {
      logger.info(`Trade Signal Monitor Backend is running on port ${PORT}!`);
    });

    // Keep the process running
    process.on("SIGINT", async () => {
      logger.info("Shutting down gracefully...");

      if (redisClient) {
        await redisClient.disconnect();
        logger.info("Redis disconnected");
      }

      if (mysqlClient) {
        await mysqlClient.disconnect();
        logger.info("MySQL disconnected");
      }

      marketDataClient.disconnect();
      logger.info("Market data client disconnected");

      if (kafkaConsumer) {
        await kafkaConsumer.disconnect();
        logger.info("Kafka consumer disconnected");
      }

      if (kafkaProducer) {
        await kafkaProducer.disconnect();
        logger.info("Kafka producer disconnected");
      }

      logger.info("Shutdown complete");
      process.exit(0);
    });

    // Kafka consumer is now set up to listen for events automatically
    // No need for periodic polling - events are processed as they arrive
  } catch (error) {
    logger.error("Failed to start Trade Signal Monitor Backend:", error);
    process.exit(1);
  }
})();
