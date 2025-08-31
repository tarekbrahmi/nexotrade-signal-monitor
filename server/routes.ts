import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { WebSocketServer } from "./services/websocket-server";
import { KafkaConsumer } from "./services/kafka-consumer";
import { MarketDataClient } from "./services/market-data-client";
import { SignalMonitor } from "./services/signal-monitor";
import { RedisClient } from "./services/redis-client";

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);

  // Initialize Redis client
  const redisClient = new RedisClient();
  await redisClient.connect();

  // Initialize signal monitor
  const signalMonitor = new SignalMonitor(storage, redisClient);

  // Initialize WebSocket server
  const wsServer = new WebSocketServer(httpServer, signalMonitor);

  // Initialize market data client
  const marketDataClient = new MarketDataClient(signalMonitor);
  await marketDataClient.connect();

  // Initialize Kafka consumer
  const kafkaConsumer = new KafkaConsumer(storage, redisClient, signalMonitor);
  await kafkaConsumer.connect();

  // Dashboard API endpoints
  app.get("/api/dashboard/stats", async (req, res) => {
    try {
      const activeSignals = await storage.getActiveTradeSignals();
      const activeConnections = wsServer.getConnectionCount();
      
      res.json({
        activeConnections,
        activeSignals: activeSignals.length,
        kafkaMessagesProcessed: kafkaConsumer.getMessageCount(),
        redisMemoryUsage: await redisClient.getMemoryUsage(),
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch dashboard stats" });
    }
  });

  app.get("/api/dashboard/signals/recent", async (req, res) => {
    try {
      const signals = await storage.getActiveTradeSignals();
      const recentSignals = signals
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 10);
      
      res.json(recentSignals);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch recent signals" });
    }
  });

  app.get("/api/dashboard/connections", async (req, res) => {
    try {
      const connections = [
        {
          name: "Market Data WebSocket",
          host: "nexotrade.net",
          status: marketDataClient.isConnected() ? "connected" : "disconnected",
          type: "websocket"
        },
        {
          name: "Kafka Event Bus",
          host: "SIGNAL_CREATED topic",
          status: kafkaConsumer.isConnected() ? "subscribed" : "disconnected",
          type: "kafka"
        },
        {
          name: "Redis Cache",
          host: "Signal monitoring store",
          status: redisClient.isConnected() ? "online" : "offline",
          type: "redis"
        },
        {
          name: "MySQL Database",
          host: "Signal persistence",
          status: "connected", // Using memory storage for now
          type: "mysql"
        }
      ];
      
      res.json(connections);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch connection status" });
    }
  });

  app.get("/api/dashboard/channels", async (req, res) => {
    try {
      const channels = wsServer.getActiveChannels();
      res.json(channels);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch active channels" });
    }
  });

  app.get("/api/dashboard/config", async (req, res) => {
    try {
      const config = {
        marketDataWebsocketUrl: process.env.MARKET_DATA_WEBSOCKET_URL || "ws://www.demo.nexotrade.net/nexotrade-blockchain/ws/socket.io/",
        kafkaBrokerUrl: process.env.KAFKA_BROKER_URL || "kafka://localhost:9092",
        redisUrl: process.env.REDIS_URL || "redis://localhost:6379",
        mysqlDatabase: process.env.DATABASE_URL || "mysql://localhost:3306/trade_signals"
      };
      
      res.json(config);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch configuration" });
    }
  });

  return httpServer;
}
