// server/index.ts
import "dotenv/config";
import express from "express";
import { createServer } from "http";

// server/services/kafka-consumer.ts
import { Kafka } from "kafkajs";

// server/services/logger.ts
import winston from "winston";
import path from "path";
var logsDir = path.join(process.cwd(), "logs");
var logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json(),
  ),
  defaultMeta: { service: "trade-signal-monitor" },
  transports: [
    // Error log file - only errors
    new winston.transports.File({
      filename: path.join(logsDir, "error.log"),
      level: "error",
    }),
    // Combined log file - all levels
    new winston.transports.File({
      filename: path.join(logsDir, "combined.log"),
    }),
  ],
});

// server/services/startup-sync.ts
var StartupSyncService = class {
  constructor(storage, redisClient) {
    this.storage = storage;
    this.redisClient = redisClient;
  }
  async synchronizeSignals() {
    logger.info("Starting signal synchronization at microservice startup...");
    try {
      const activeSignals = await this.storage.getActiveTradeSignals();
      logger.info(`Found ${activeSignals.length} active signals in database`);
      let addedToRedis = 0;
      let expiredSignals = 0;
      for (const signal of activeSignals) {
        const createdAt = new Date(signal.created_at);
        const ttlHours = parseInt(signal.ttl.replace("h", ""));
        const expiryTime = new Date(
          createdAt.getTime() + ttlHours * 60 * 60 * 1e3,
        );
        const now = /* @__PURE__ */ new Date();
        if (now > expiryTime) {
          await this.storage.updateTradeSignalStatus(signal.uuid, "expired");
          logger.info(
            `Expired signal ${signal.uuid} (created: ${signal.created_at}, ttl: ${signal.ttl})`,
          );
          expiredSignals++;
          continue;
        }
        const redisKey = `${signal.channel_id}:${signal.asset_symbol}:${signal.uuid}`;
        const existingSignal = await this.redisClient.getSignal(redisKey);
        if (!existingSignal) {
          const remainingTtlSeconds = Math.floor(
            (expiryTime.getTime() - now.getTime()) / 1e3,
          );
          if (remainingTtlSeconds > 0) {
            await this.redisClient.setSignal(
              redisKey,
              {
                signal_type: signal.signal_type,
                entry_price: signal.entry_price,
                target_price: signal.target_price,
                stop_loss_price: signal.stop_loss_price,
                leverage: signal.leverage,
                ttl: signal.ttl,
                created_at: signal.created_at,
                status: "active",
              },
              remainingTtlSeconds,
            );
            logger.info(
              `Added missing signal ${signal.uuid} to Redis (TTL: ${Math.floor(remainingTtlSeconds / 3600)}h remaining)`,
            );
            addedToRedis++;
          }
        }
      }
      logger.info(
        `Synchronization complete: ${addedToRedis} signals added to Redis, ${expiredSignals} signals expired`,
      );
    } catch (error) {
      logger.error("Failed to synchronize signals at startup:", error);
      throw error;
    }
  }
};

// server/services/kafka-consumer.ts
var KAFKA_TOPICS = {
  TRADE_SIGNAL_EVENTS: "TRADE_SIGNAL_EVENTS",
};
var TRADE_SIGNAL_EVENTS = {
  SIGNAL_CREATED: "SIGNAL_CREATED",
};
var KafkaConsumer = class {
  constructor(storage, redisClient) {
    this.storage = storage;
    this.redisClient = redisClient;
    const brokerUrl = process.env.KAFKA_BROKER_URL || "51.79.84.45:9092";
    this.kafka = new Kafka({
      clientId: "trade-signal-monitor",
      brokers: [brokerUrl],
    });
    this._loadSchemas();
  }
  kafka;
  consumer = null;
  running = false;
  schemas = {};
  _loadSchemas() {
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
    logger.info("Event schemas loaded successfully");
  }
  async connect() {
    if (this.running) {
      logger.warn("Kafka consumer is already running");
      return;
    }
    const startupSync = new StartupSyncService(this.storage, this.redisClient);
    await startupSync.synchronizeSignals();
    await this._consumerLoop();
  }
  async _consumerLoop() {
    try {
      const topics = [KAFKA_TOPICS.TRADE_SIGNAL_EVENTS];
      this.consumer = this.kafka.consumer({
        groupId: "signal-monitor-group",
        sessionTimeout: 3e4,
        heartbeatInterval: 3e3,
      });
      await this.consumer.connect();
      for (const topic of topics) {
        await this.consumer.subscribe({ topic, fromBeginning: false });
      }
      logger.info(
        `Kafka consumer connected to ${process.env.KAFKA_BROKER_URL || "51.79.84.45:9092"}`,
      );
      logger.info(`Subscribed to topics: ${topics.join(", ")}`);
      this.running = true;
      await this.consumer.run({
        eachMessage: async ({ topic, partition, message }) => {
          if (!this.running) return;
          await this._processMessage(message);
        },
      });
    } catch (error) {
      logger.error("Failed to start Kafka consumer:", error);
      throw error;
    }
  }
  async _processMessage(message) {
    try {
      if (!message.value) return;
      const eventData = JSON.parse(message.value.toString());
      if (!this._validateEvent(eventData)) {
        return;
      }
      const eventType = eventData.eventType || eventData.event_type;
      logger.info(`Processing ${eventType} event`);
      if (eventType === TRADE_SIGNAL_EVENTS.SIGNAL_CREATED) {
        await this._handleSignalCreated(eventData);
      } else {
        logger.warn(`Unknown event type: ${eventType}`);
      }
    } catch (error) {
      if (error instanceof SyntaxError) {
        logger.error("Failed to parse JSON message:", error.message);
      } else {
        logger.error("Failed to process message:", error);
      }
    }
  }
  _validateEvent(eventData) {
    try {
      const eventType = eventData.eventType || eventData.event_type;
      if (!eventType) {
        logger.error("Missing event type in message");
        return false;
      }
      const schema = this.schemas[eventType];
      if (!schema) {
        logger.error(`Unknown event type: ${eventType}`);
        return false;
      }
      for (const field of schema.required) {
        if (!eventData[field]) {
          logger.error(`Missing required field: ${field}`);
          return false;
        }
      }
      if (eventData.data && schema.dataRequired) {
        for (const field of schema.dataRequired) {
          if (eventData.data[field] === void 0) {
            logger.error(`Missing required data field: ${field}`);
            return false;
          }
        }
      }
      return true;
    } catch (error) {
      logger.error("Validation error:", error);
      return false;
    }
  }
  async _handleSignalCreated(eventData) {
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
      logger.info(`Created trade signal ${data.uuid} from external event`);
    } catch (error) {
      logger.error("Failed to handle SIGNAL_CREATED event:", error);
    }
  }
  async disconnect() {
    if (!this.running) {
      return;
    }
    this.running = false;
    if (this.consumer) {
      await this.consumer.disconnect();
      this.consumer = null;
    }
    logger.info("Kafka consumer stopped");
  }
  isConnected() {
    return this.running && this.consumer !== null;
  }
};

// server/services/kafka-producer.ts
import { Kafka as Kafka2 } from "kafkajs";
var KAFKA_TOPICS2 = {
  TRADE_SIGNAL_EVENTS: "TRADE_SIGNAL_EVENTS",
};
var KafkaProducer = class {
  kafka;
  producer = null;
  isConnected = false;
  constructor() {
    this.kafka = new Kafka2({
      clientId: "trade-signal-producer",
      brokers: [process.env.KAFKA_BROKER || "localhost:9092"],
      connectionTimeout: 3e4,
      requestTimeout: 3e4,
      retry: {
        initialRetryTime: 100,
        retries: 8,
      },
    });
  }
  async connect() {
    try {
      if (this.isConnected) {
        logger.info("Kafka producer already connected");
        return;
      }
      this.producer = this.kafka.producer({
        maxInFlightRequests: 1,
        idempotent: true,
        transactionTimeout: 3e4,
      });
      await this.producer.connect();
      this.isConnected = true;
      logger.info("Kafka producer connected successfully");
    } catch (error) {
      logger.error("Failed to connect Kafka producer:", error);
      throw error;
    }
  }
  async disconnect() {
    try {
      if (this.producer && this.isConnected) {
        await this.producer.disconnect();
        this.isConnected = false;
        logger.info("Kafka producer disconnected");
      }
    } catch (error) {
      logger.error("Failed to disconnect Kafka producer:", error);
    }
  }
  async publishSignalClosed(eventData) {
    try {
      if (!this.producer || !this.isConnected) {
        throw new Error("Kafka producer not connected");
      }
      const signalClosedEvent = {
        version: "1.0.0",
        eventType: "SIGNAL_CLOSED",
        timestamp: /* @__PURE__ */ new Date().toISOString(),
        data: {
          uuid: eventData.uuid,
          trader_id: eventData.trader_id,
          channel_id: eventData.channel_id,
          execution_price: eventData.execution_price,
          closed_at: eventData.closed_at.toISOString(),
          performance: eventData.performance,
          risk_reward_ratio: eventData.risk_reward_ratio,
          signal_strength: eventData.signal_strength,
          status: eventData.status,
        },
      };
      const message = {
        topic: KAFKA_TOPICS2.TRADE_SIGNAL_EVENTS,
        messages: [
          {
            key: eventData.uuid,
            value: JSON.stringify(signalClosedEvent),
            timestamp: Date.now().toString(),
          },
        ],
      };
      await this.producer.send(message);
      logger.info(
        `Published SIGNAL_CLOSED event for signal ${eventData.uuid} with status ${eventData.status}`,
      );
    } catch (error) {
      logger.error("Failed to publish SIGNAL_CLOSED event:", error);
      throw error;
    }
  }
  isProducerConnected() {
    return this.isConnected;
  }
};

// server/services/market-data-client.ts
import { io } from "socket.io-client";
var MarketDataClient = class {
  constructor(signalMonitor) {
    this.signalMonitor = signalMonitor;
  }
  socket = null;
  connected = false;
  reconnectAttempts = 0;
  maxReconnectAttempts = 5;
  async connect() {
    try {
      const wsUrl =
        process.env.MARKET_DATA_WEBSOCKET_URL || "wss://www.demo.nexotrade.net";
      this.socket = io(wsUrl, {
        path: "/nexotrade-blockchain/ws/socket.io",
        transports: ["websocket", "polling"],
        upgrade: true,
        rememberUpgrade: true,
        timeout: 1e4,
        forceNew: true,
        withCredentials: false,
      });
      this.socket.on("connect", () => {
        this.connected = true;
        this.reconnectAttempts = 0;
      });
      this.socket.on("disconnect", () => {
        this.connected = false;
        this.attemptReconnect();
      });
      this.socket.on("connect_error", (error) => {
        this.connected = false;
        this.attemptReconnect();
      });
      this.socket.onAny((eventName, ...args) => {
        if (eventName === "nxt_price_update" && args.length > 0) {
          const data = args[0];
          if (data && data.s && data.c) {
            this.processPriceUpdate(data);
          }
        }
      });
    } catch (error) {
      logger.error("Failed to connect to market data WebSocket:", error);
      throw error;
    }
  }
  // Remove duplicate handlers and unnecessary methods
  processPriceUpdate(data) {
    try {
      if (data && data.s && data.c) {
        this.signalMonitor.onPriceUpdate(data.s, parseFloat(data.c));
      }
    } catch (error) {
      logger.error("Error processing price update:", error);
    }
  }
  attemptReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.min(1e3 * Math.pow(2, this.reconnectAttempts), 3e4);
      setTimeout(() => {
        this.connect().catch(() => {});
      }, delay);
    }
  }
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.connected = false;
  }
  isConnected() {
    return this.connected;
  }
};

// server/services/mysql-client.ts
import mysql from "mysql2/promise";
var MySQLClient = class {
  pool;
  constructor() {
    const dbConfig = {
      host: process.env.DB_HOST || "51.79.84.45",
      user: process.env.DB_USER || "nexotrade",
      password: process.env.DB_PASS || "P@SSw0rd",
      database: process.env.DB_NAME || "trade_signals",
      port: parseInt(process.env.DB_PORT || "3306"),
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    };
    this.pool = mysql.createPool(dbConfig);
  }
  async createTradeSignal(signal) {
    const connection = await this.pool.getConnection();
    await connection.beginTransaction();
    try {
      const [existing] = await connection.execute(
        "SELECT uuid FROM trade_signals WHERE uuid = ?",
        [signal.uuid],
      );
      if (Array.isArray(existing) && existing.length > 0) {
        logger.info(
          `Trade signal ${signal.uuid} already exists, skipping creation`,
        );
        await connection.rollback();
        return signal;
      }
      const [result] = await connection.execute(
        `INSERT INTO trade_signals 
         (id, uuid, trader_id, channel_id, channel_uuid, visibility, signal_type, asset_symbol, 
          leverage, entry_price, target_price, stop_loss_price, trade_price, ttl, 
          performance_rating, created_at, status) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          signal.id,
          // Add ID from Kafka data
          signal.uuid,
          signal.trader_id,
          signal.channel_id,
          signal.channel_uuid || null,
          signal.visibility || null,
          signal.signal_type,
          signal.asset_symbol,
          signal.leverage,
          signal.entry_price,
          signal.target_price || null,
          signal.stop_loss_price || null,
          signal.trade_price || null,
          signal.ttl || "24h",
          signal.performance_rating || null,
          signal.created_at,
          // Keep as ISO string
          signal.status,
        ],
      );
      await connection.commit();
      logger.info(
        `Trade signal ${signal.uuid} successfully created in database`,
      );
      return signal;
    } catch (error) {
      await connection.rollback();
      logger.error(`Failed to create trade signal ${signal.uuid}:`, error);
      throw error;
    } finally {
      connection.release();
    }
  }
  async getTradeSignal(uuid) {
    const connection = await this.pool.getConnection();
    try {
      const [rows] = await connection.execute(
        "SELECT * FROM trade_signals WHERE uuid = ?",
        [uuid],
      );
      const signals = rows;
      return signals.length > 0 ? signals[0] : void 0;
    } finally {
      connection.release();
    }
  }
  async updateTradeSignal(uuid, updates) {
    const connection = await this.pool.getConnection();
    try {
      const setClause = Object.keys(updates)
        .map((key) => `${key} = ?`)
        .join(", ");
      const values = Object.values(updates);
      await connection.execute(
        `UPDATE trade_signals SET ${setClause} WHERE uuid = ?`,
        [...values, uuid],
      );
    } finally {
      connection.release();
    }
  }
  async updateTradeSignalStatus(uuid, status) {
    const connection = await this.pool.getConnection();
    try {
      await connection.execute(
        "UPDATE trade_signals SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE uuid = ?",
        [status, uuid],
      );
    } finally {
      connection.release();
    }
  }
  async getActiveTradeSignals() {
    const connection = await this.pool.getConnection();
    try {
      const [rows] = await connection.execute(
        'SELECT * FROM trade_signals WHERE status = "active"',
      );
      return rows;
    } finally {
      connection.release();
    }
  }
  async getTradeSignalsByChannel(channelId) {
    const connection = await this.pool.getConnection();
    try {
      const [rows] = await connection.execute(
        "SELECT * FROM trade_signals WHERE channel_id = ?",
        [channelId],
      );
      return rows;
    } finally {
      connection.release();
    }
  }
  async disconnect() {
    await this.pool.end();
  }
};

// server/services/redis-client.ts
import { createClient } from "redis";
var RedisClient = class {
  client = null;
  connected = false;
  host;
  port;
  reconnectAttempts = 0;
  maxReconnectAttempts = 3;
  constructor(host = "localhost", port = 6379, db = 0, password = null) {
    this.host = host;
    this.port = port;
  }
  createClient() {
    if (this.client) return;
    this.client = createClient({
      socket: {
        host: this.host,
        port: this.port,
        connectTimeout: 1e4,
        reconnectStrategy: (retries) => {
          if (retries < this.maxReconnectAttempts) {
            return Math.min(retries * 1e3, 3e3);
          }
          return false;
        },
      },
    });
    this.client.on("error", (err) => {
      logger.error("Redis connection error:", err.message);
      logger.error("Application cannot continue without Redis. Exiting...");
      process.exit(1);
    });
    this.client.on("connect", () => {
      this.connected = true;
      this.reconnectAttempts = 0;
    });
    this.client.on("disconnect", () => {
      this.connected = false;
    });
  }
  async connect() {
    this.createClient();
    if (!this.client) {
      logger.error(
        "Failed to create Redis client. Application cannot continue without Redis. Exiting...",
      );
      process.exit(1);
    }
    try {
      await this.client.connect();
      this.connected = true;
      logger.info("Successfully connected to Redis");
    } catch (error) {
      logger.error("Failed to connect to Redis:", error.message);
      logger.error("Application cannot continue without Redis. Exiting...");
      process.exit(1);
    }
  }
  async disconnect() {
    if (this.client && this.connected) {
      await this.client.disconnect();
    }
    this.connected = false;
  }
  isConnected() {
    return this.connected;
  }
  async setSignal(key, value, ttlSeconds) {
    if (!this.client || !this.connected) {
      logger.error("Redis client not connected. Cannot set signal.");
      throw new Error("Redis connection required");
    }
    try {
      await this.client.setEx(key, ttlSeconds, JSON.stringify(value));
    } catch (error) {
      logger.error("Failed to set Redis key:", error.message);
      throw error;
    }
  }
  async getSignal(key) {
    if (!this.client || !this.connected) {
      logger.error("Redis client not connected. Cannot get signal.");
      throw new Error("Redis connection required");
    }
    try {
      const value = await this.client.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.error("Failed to get Redis key:", error.message);
      throw error;
    }
  }
  async deleteSignal(key) {
    if (!this.client || !this.connected) {
      logger.error("Redis client not connected. Cannot delete signal.");
      throw new Error("Redis connection required");
    }
    try {
      await this.client.del(key);
    } catch (error) {
      logger.error("Failed to delete Redis key:", error.message);
      throw error;
    }
  }
  async getKeysByPattern(pattern) {
    if (!this.client || !this.connected) {
      logger.error("Redis client not connected. Cannot get keys by pattern.");
      throw new Error("Redis connection required");
    }
    try {
      return await this.client.keys(pattern);
    } catch (error) {
      logger.error("Failed to get Redis keys by pattern:", error.message);
      throw error;
    }
  }
  async getMemoryUsage() {
    if (!this.client || !this.connected) {
      logger.error("Redis client not connected. Cannot get memory usage.");
      throw new Error("Redis connection required");
    }
    try {
      const info = await this.client.info("memory");
      const usedMemoryMatch = info.match(/used_memory_human:(.+)/);
      return usedMemoryMatch ? usedMemoryMatch[1].trim() : "0B";
    } catch (error) {
      logger.error("Failed to get Redis memory usage:", error.message);
      throw error;
    }
  }
};

// server/services/performance-metrics.ts
var PerformanceCalculator = class {
  constructor() {}
  /**
   * Calculate simple performance metrics for a trade signal
   */
  calculateMetrics(signal, currentPrice) {
    const entryPrice = parseFloat(signal.entry_price.toString());
    const targetPrice = parseFloat(signal.target_price.toString());
    const stopLossPrice = parseFloat(signal.stop_loss_price.toString());
    const leverage = parseFloat(signal.leverage.toString()) || 1;
    let currentPerformance = 0;
    if (signal.signal_type === "BUY" || signal.signal_type === "buy") {
      currentPerformance =
        ((currentPrice - entryPrice) / entryPrice) * leverage * 100;
    } else {
      currentPerformance =
        ((entryPrice - currentPrice) / entryPrice) * leverage * 100;
    }
    const riskRewardRatio = this.calculateRiskRewardRatio(
      entryPrice,
      targetPrice,
      stopLossPrice,
    );
    const signalStrength = this.calculateSignalStrength(
      riskRewardRatio,
      leverage,
    );
    return {
      currentPerformance,
      riskRewardRatio,
      signalStrength,
    };
  }
  /**
   * Calculate metrics for database storage
   */
  calculateMetricsForStorage(signal, currentPrice) {
    const entryPrice = parseFloat(signal.entry_price.toString());
    const targetPrice = parseFloat(signal.target_price.toString());
    const stopLossPrice = parseFloat(signal.stop_loss_price.toString());
    const leverage = parseFloat(signal.leverage.toString()) || 1;
    const riskRewardRatio = this.calculateRiskRewardRatio(
      entryPrice,
      targetPrice,
      stopLossPrice,
    );
    const signalStrength = this.calculateSignalStrength(
      riskRewardRatio,
      leverage,
    );
    const marketTrend = this.determineMarketTrend(signal.signal_type);
    return {
      riskRewardRatio,
      signalStrength,
      marketTrend,
    };
  }
  calculateRiskRewardRatio(entryPrice, targetPrice, stopLossPrice) {
    const potentialReward = Math.abs(targetPrice - entryPrice);
    const potentialRisk = Math.abs(entryPrice - stopLossPrice);
    if (potentialRisk === 0) return 0;
    return Math.round((potentialReward / potentialRisk) * 100) / 100;
  }
  calculateSignalStrength(riskRewardRatio, leverage) {
    let strength = 1;
    if (riskRewardRatio >= 3) strength += 2;
    else if (riskRewardRatio >= 2) strength += 1;
    else if (riskRewardRatio < 1) strength -= 1;
    if (leverage >= 10) strength += 1;
    else if (leverage >= 5) strength += 0.5;
    return Math.max(1, Math.min(5, Math.round(strength)));
  }
  determineMarketTrend(signalType) {
    if (signalType === "BUY" || signalType === "buy" || signalType === "LONG") {
      return "bullish";
    } else if (
      signalType === "SELL" ||
      signalType === "sell" ||
      signalType === "SHORT"
    ) {
      return "bearish";
    }
    return "neutral";
  }
};

// server/services/signal-monitor.ts
var SignalMonitor = class {
  constructor(storage, redisClient, kafkaProducer = null) {
    this.storage = storage;
    this.redisClient = redisClient;
    this.performanceCalculator = new PerformanceCalculator();
    this.kafkaProducer = kafkaProducer;
    this.initializePriceHistoryCleanup();
  }
  priceCache = /* @__PURE__ */ new Map();
  priceHistory = /* @__PURE__ */ new Map();
  updateCallbacks = /* @__PURE__ */ new Set();
  performanceCalculator;
  kafkaProducer;
  async onPriceUpdate(symbol, price) {
    this.priceCache.set(symbol, price);
    this.addPricePoint(symbol, price);
    await this.checkSignalsForAsset(symbol, price);
  }
  async checkSignalsForAsset(symbol, currentPrice) {
    try {
      const pattern = `*:${symbol}:*`;
      const keys = await this.redisClient.getKeysByPattern(pattern);
      const channelUpdates = /* @__PURE__ */ new Map();
      for (const key of keys) {
        const signalData = await this.redisClient.getSignal(key);
        if (!signalData) continue;
        const [channelId, assetSymbol, uuid] = key.split(":");
        const channelIdNum = parseInt(channelId);
        const entryPrice = parseFloat(signalData.entry_price);
        const targetPrice = parseFloat(signalData.target_price);
        const stopLossPrice = parseFloat(signalData.stop_loss_price);
        const leverage = parseFloat(signalData.leverage);
        let newStatus = signalData.status;
        let performance = 0;
        if (
          signalData.signal_type === "BUY" ||
          signalData.signal_type === "buy"
        ) {
          performance =
            ((currentPrice - entryPrice) / entryPrice) * leverage * 100;
          if (currentPrice >= targetPrice) {
            newStatus = "tp_hit";
          } else if (currentPrice <= stopLossPrice) {
            newStatus = "sl_hit";
          }
        } else if (
          signalData.signal_type === "SELL" ||
          signalData.signal_type === "sell"
        ) {
          performance =
            ((entryPrice - currentPrice) / entryPrice) * leverage * 100;
          if (currentPrice <= targetPrice) {
            newStatus = "tp_hit";
          } else if (currentPrice >= stopLossPrice) {
            newStatus = "sl_hit";
          }
        }
        const createdAt = new Date(signalData.created_at);
        const ttlHours = parseInt(signalData.ttl.replace("h", ""));
        const expiryTime = new Date(
          createdAt.getTime() + ttlHours * 60 * 60 * 1e3,
        );
        if (/* @__PURE__ */ new Date() > expiryTime && newStatus === "active") {
          newStatus = "expired";
        }
        if (newStatus !== signalData.status) {
          if (newStatus !== "active") {
            await this.closeSignalWithMetrics(
              uuid,
              symbol,
              currentPrice,
              newStatus,
              signalData,
            );
            await this.redisClient.deleteSignal(key);
          } else {
            await this.storage.updateTradeSignalStatus(uuid, newStatus);
          }
        }
        if (!channelUpdates.has(channelIdNum)) {
          channelUpdates.set(channelIdNum, {
            type: "TRADE_SIGNAL_UPDATE",
            channel_id: channelIdNum,
            asset: symbol,
            signals: [],
          });
        }
        const channelUpdate = channelUpdates.get(channelIdNum);
        const metrics = this.performanceCalculator.calculateMetricsForStorage(
          signalData,
          currentPrice,
        );
        const marketTrend = this.determineMarketTrend(symbol, currentPrice);
        channelUpdate.signals.push({
          uuid,
          signal_type: signalData.signal_type,
          current_price: currentPrice.toString(),
          performance: performance.toFixed(2),
          status: newStatus,
          risk_reward_ratio: metrics.riskRewardRatio,
          signal_strength: metrics.signalStrength,
          market_trend: marketTrend,
        });
      }
      for (const update of Array.from(channelUpdates.values())) {
        this.broadcastUpdate(update);
      }
    } catch (error) {
      logger.error("Error checking signals for asset:", error);
    }
  }
  broadcastUpdate(message) {
    this.updateCallbacks.forEach((callback) => {
      try {
        callback(message);
      } catch (error) {
        logger.error("Error in signal update callback:", error);
      }
    });
  }
  onSignalUpdate(callback) {
    this.updateCallbacks.add(callback);
  }
  async getActiveTradeSignals() {
    return await this.storage.getActiveTradeSignals();
  }
  removeSignalUpdateCallback(callback) {
    this.updateCallbacks.delete(callback);
  }
  getCurrentPrice(symbol) {
    return this.priceCache.get(symbol);
  }
  addPricePoint(symbol, price) {
    const timestamp = /* @__PURE__ */ new Date();
    const pricePoint = { timestamp, price };
    if (!this.priceHistory.has(symbol)) {
      this.priceHistory.set(symbol, []);
    }
    const history = this.priceHistory.get(symbol);
    history.push(pricePoint);
    if (history.length > 1e3) {
      history.shift();
    }
  }
  initializePriceHistoryCleanup() {
    setInterval(
      () => {
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1e3);
        for (const symbol of Array.from(this.priceHistory.keys())) {
          const history = this.priceHistory.get(symbol);
          const recentHistory = history.filter(
            (point) => point.timestamp > fiveMinutesAgo,
          );
          this.priceHistory.set(symbol, recentHistory);
        }
      },
      5 * 60 * 1e3,
    );
  }
  async closeSignalWithMetrics(
    uuid,
    symbol,
    currentPrice,
    newStatus,
    signalData,
  ) {
    try {
      const metrics = this.performanceCalculator.calculateMetrics(
        signalData,
        currentPrice,
      );
      const marketTrend = this.determineMarketTrend(symbol, currentPrice);
      await this.storage.updateTradeSignal(uuid, {
        status: newStatus,
        closed_at: /* @__PURE__ */ new Date(),
        execution_price: currentPrice,
        updated_at: /* @__PURE__ */ new Date(),
        risk_reward_ratio: metrics.riskRewardRatio,
        signal_strength: metrics.signalStrength,
        market_trend: marketTrend,
      });
      if (this.kafkaProducer) {
        try {
          const entryPrice =
            typeof signalData.entry_price === "string"
              ? parseFloat(signalData.entry_price)
              : signalData.entry_price;
          const leverage =
            (typeof signalData.leverage === "string"
              ? parseFloat(signalData.leverage)
              : signalData.leverage) || 1;
          let performance = 0;
          if (
            signalData.signal_type === "BUY" ||
            signalData.signal_type === "buy"
          ) {
            performance =
              ((currentPrice - entryPrice) / entryPrice) * leverage * 100;
          } else if (
            signalData.signal_type === "SELL" ||
            signalData.signal_type === "sell"
          ) {
            performance =
              ((entryPrice - currentPrice) / entryPrice) * leverage * 100;
          }
          await this.kafkaProducer.publishSignalClosed({
            uuid,
            trader_id: signalData.trader_id,
            channel_id: signalData.channel_id,
            execution_price: currentPrice,
            closed_at: /* @__PURE__ */ new Date(),
            performance: performance.toFixed(2) + "%",
            risk_reward_ratio: metrics.riskRewardRatio,
            signal_strength: metrics.signalStrength,
            status: newStatus,
          });
          logger.info(`Published SIGNAL_CLOSED event for ${uuid} to Kafka`);
        } catch (kafkaError) {
          logger.error(
            `Failed to publish SIGNAL_CLOSED event for ${uuid}:`,
            kafkaError,
          );
        }
      }
      logger.info(
        `Signal ${uuid} closed with status ${newStatus} and simple metrics calculated`,
      );
    } catch (error) {
      logger.error(`Error calculating metrics for signal ${uuid}:`, error);
      await this.storage.updateTradeSignal(uuid, {
        status: newStatus,
        closed_at: /* @__PURE__ */ new Date(),
        execution_price: currentPrice,
        updated_at: /* @__PURE__ */ new Date(),
      });
    }
  }
  determineMarketTrend(symbol, currentPrice) {
    const history = this.priceHistory.get(symbol) || [];
    if (history.length < 5) return "neutral";
    const recentHistory = history.slice(-5);
    const firstPrice = recentHistory[0].price;
    const lastPrice = recentHistory[recentHistory.length - 1].price;
    const changePercent = ((lastPrice - firstPrice) / firstPrice) * 100;
    if (changePercent > 0.5) return "bullish";
    if (changePercent < -0.5) return "bearish";
    return "neutral";
  }
};

// server/services/websocket-server.ts
import { Server as SocketIOServer } from "socket.io";

// shared/schema.ts
import { z } from "zod";
var insertTradeSignalSchema = z.object({
  id: z.number(),
  uuid: z.string(),
  trader_id: z.string(),
  channel_id: z.number(),
  channel_uuid: z.string(),
  visibility: z.enum(["public", "private"]),
  signal_type: z.enum(["buy", "sell", "BUY", "SELL"]),
  asset_symbol: z.string(),
  entry_price: z.union([z.number(), z.string()]),
  target_price: z.union([z.number(), z.string()]),
  stop_loss_price: z.union([z.number(), z.string()]),
  trade_price: z.union([z.number(), z.string()]),
  performance_rating: z.union([z.number(), z.string()]),
  leverage: z.union([z.number(), z.string()]),
  ttl: z.enum([
    "1h",
    "2h",
    "3h",
    "4h",
    "5h",
    "6h",
    "7h",
    "8h",
    "9h",
    "10h",
    "12h",
    "24h",
    "48h",
    "72h",
  ]),
  created_at: z.string(),
  status: z.enum(["active", "sl_hit", "tp_hit", "expired"]).default("active"),
});
var signalCreatedEventSchema = z.object({
  version: z.string(),
  eventType: z.literal("SIGNAL_CREATED"),
  timestamp: z.string(),
  data: z.object({
    id: z.number(),
    uuid: z.string(),
    trader_id: z.string(),
    channel_id: z.number(),
    channel_uuid: z.string(),
    visibility: z.string(),
    signal_type: z.enum(["BUY", "SELL", "LONG", "SHORT"]),
    asset_symbol: z.string(),
    leverage: z.number(),
    entry_price: z.number(),
    target_price: z.number().optional(),
    stop_loss_price: z.number().optional(),
    trade_price: z.number().optional(),
    performance_rating: z.number().optional(),
    ttl: z.string(),
    created_at: z.string(),
  }),
});
var signalClosedEventSchema = z.object({
  version: z.string(),
  eventType: z.literal("SIGNAL_CLOSED"),
  timestamp: z.string(),
  data: z.object({
    uuid: z.string(),
    trader_id: z.string(),
    channel_id: z.number(),
    execution_price: z.number(),
    closed_at: z.string(),
    performance: z.string(),
    risk_reward_ratio: z.number(),
    signal_strength: z.number(),
    status: z.enum(["tp_hit", "sl_hit", "expired"]),
  }),
});
var marketDataUpdateSchema = z.tuple([
  z.literal("nxt_price_update"),
  z.object({
    s: z.string(),
    // symbol
    c: z.string(),
    // current price
    P: z.string(),
    // percentage change
    h: z.string(),
    // high
    l: z.string(),
    // low
    q: z.string(),
    // quote volume
    t: z.number(),
    // timestamp
  }),
]);
var traderConnectionSchema = z.object({
  jwt: z.string(),
  channel_id: z.number(),
});
var signalUpdateMessageSchema = z.object({
  type: z.literal("TRADE_SIGNAL_UPDATE"),
  channel_id: z.number(),
  asset: z.string(),
  signals: z.array(
    z.object({
      uuid: z.string(),
      signal_type: z.enum(["BUY", "SELL", "LONG", "SHORT"]),
      current_price: z.string(),
      performance: z.string(),
      status: z.enum(["active", "sl_hit", "tp_hit", "expired"]),
      risk_reward_ratio: z.number().nullable().optional(),
      signal_strength: z.number().nullable().optional(),
      market_trend: z
        .enum(["bullish", "bearish", "neutral"])
        .nullable()
        .optional(),
    }),
  ),
});

// server/utils/jwt.ts
import jwt from "jsonwebtoken";
var JWT_SECRET = process.env.JWT_SECRET || "any";
async function verifyJWT(token) {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return decoded;
  } catch (error) {
    logger.error("JWT verification failed:", error);
    return null;
  }
}

// server/services/websocket-server.ts
var WebSocketServer = class {
  constructor(httpServer2, signalMonitor) {
    this.signalMonitor = signalMonitor;
    this.io = new SocketIOServer(httpServer2, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"],
      },
    });
    this.setupEventHandlers();
    this.signalMonitor.onSignalUpdate(this.handleSignalUpdate.bind(this));
  }
  io;
  connectedTraders = /* @__PURE__ */ new Map();
  channelConnections = /* @__PURE__ */ new Map();
  setupEventHandlers() {
    this.io.on("connection", (socket) => {
      logger.info("New WebSocket connection:", socket.id);
      socket.on("authenticate", async (data) => {
        try {
          const connectionData = traderConnectionSchema.parse(data);
          const decoded = await verifyJWT(connectionData.jwt);
          if (decoded) {
            const trader = {
              id: socket.id,
              channelId: connectionData.channel_id,
              socket,
            };
            this.connectedTraders.set(socket.id, trader);
            if (!this.channelConnections.has(connectionData.channel_id)) {
              this.channelConnections.set(
                connectionData.channel_id,
                /* @__PURE__ */ new Set(),
              );
            }
            this.channelConnections
              .get(connectionData.channel_id)
              .add(socket.id);
            socket.emit("authenticated", { success: true });
            logger.info(
              `Trader authenticated for channel ${connectionData.channel_id}`,
            );
          } else {
            socket.emit("authentication_failed", {
              error: "Invalid JWT token",
            });
            socket.disconnect();
          }
        } catch (error) {
          logger.error("Authentication error:", error);
          socket.emit("authentication_failed", {
            error: "Authentication failed",
          });
          socket.disconnect();
        }
      });
      socket.on("disconnect", () => {
        const trader = this.connectedTraders.get(socket.id);
        if (trader) {
          this.connectedTraders.delete(socket.id);
          const channelConnections = this.channelConnections.get(
            trader.channelId,
          );
          if (channelConnections) {
            channelConnections.delete(socket.id);
            if (channelConnections.size === 0) {
              this.channelConnections.delete(trader.channelId);
            }
          }
        }
        logger.info("WebSocket disconnected:", socket.id);
      });
    });
  }
  handleSignalUpdate(message) {
    const channelConnections = this.channelConnections.get(message.channel_id);
    if (channelConnections) {
      channelConnections.forEach((socketId) => {
        const trader = this.connectedTraders.get(socketId);
        if (trader) {
          trader.socket.emit("signal_update", message);
        }
      });
    }
  }
  getConnectionCount() {
    return this.connectedTraders.size;
  }
  async getActiveChannels() {
    const channels = [];
    const activeSignals = await this.signalMonitor.getActiveTradeSignals();
    this.channelConnections.forEach((connections, channelId) => {
      const channelActiveSignals = activeSignals.filter(
        (signal) => signal.channel_id === channelId,
      );
      let lastSignalTime = null;
      if (channelActiveSignals.length > 0) {
        const mostRecentSignal = channelActiveSignals.reduce(
          (latest, signal) => {
            const signalTime = new Date(signal.created_at);
            const latestTime = new Date(latest.created_at);
            return signalTime > latestTime ? signal : latest;
          },
        );
        const timeDiff =
          Date.now() - new Date(mostRecentSignal.created_at).getTime();
        const minutes = Math.floor(timeDiff / (1e3 * 60));
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        if (days > 0) {
          lastSignalTime = `${days} day${days > 1 ? "s" : ""} ago`;
        } else if (hours > 0) {
          lastSignalTime = `${hours} hour${hours > 1 ? "s" : ""} ago`;
        } else if (minutes > 0) {
          lastSignalTime = `${minutes} minute${minutes > 1 ? "s" : ""} ago`;
        } else {
          lastSignalTime = "Just now";
        }
      }
      channels.push({
        id: channelId,
        connected_traders: connections.size,
        active_signals: channelActiveSignals.length,
        last_signal: lastSignalTime,
        status: connections.size > 0 ? "active" : "idle",
      });
    });
    return channels;
  }
};

// server/index.ts
var app = express();
var httpServer = createServer(app);
var PORT = process.env.PORT || 5e3;
app.get("/", (req, res) => {
  res.json({
    status: "running",
    service: "Trade Signal Monitor Backend",
    timestamp: /* @__PURE__ */ new Date().toISOString(),
  });
});
(async () => {
  try {
    let mysqlClient = null;
    try {
      mysqlClient = new MySQLClient();
      logger.info("MySQL client initialized");
    } catch (error) {
      logger.error(
        "CRITICAL: MySQL client initialization failed!",
        error.message,
      );
      process.exit(1);
    }
    let redisClient = null;
    try {
      redisClient = new RedisClient();
      await redisClient.connect();
      logger.info("Redis client connected successfully");
    } catch (error) {
      logger.error("CRITICAL: Redis connection failed!", error.message);
      process.exit(1);
    }
    logger.info("Connecting to Kafka producer...");
    let kafkaProducer = null;
    try {
      kafkaProducer = new KafkaProducer();
      await kafkaProducer.connect();
      logger.info("Kafka producer connected and ready to publish events");
    } catch (error) {
      logger.warn(
        "WARNING: Kafka producer connection failed - continuing without event publishing:",
        error.message,
      );
      logger.info(
        "System will continue to work but SIGNAL_CLOSED events won't be published to Kafka",
      );
      kafkaProducer = null;
    }
    logger.info("Initializing signal monitor...");
    const signalMonitor = new SignalMonitor(
      mysqlClient,
      redisClient,
      kafkaProducer,
    );
    logger.info("Initializing WebSocket server...");
    const wsServer = new WebSocketServer(httpServer, signalMonitor);
    logger.info("WebSocket server initialized");
    logger.info("Connecting to market data WebSocket...");
    const marketDataClient = new MarketDataClient(signalMonitor);
    try {
      await marketDataClient.connect();
      logger.info("Market data client connected");
    } catch (error) {
      logger.error(
        "CRITICAL: Market data WebSocket connection failed!",
        error.message,
      );
      process.exit(1);
    }
    logger.info("Connecting to Kafka...");
    let kafkaConsumer = null;
    try {
      kafkaConsumer = new KafkaConsumer(mysqlClient, redisClient);
      await kafkaConsumer.connect();
      logger.info(
        "Kafka consumer connected and listening for SIGNAL_CREATED events",
      );
    } catch (error) {
      logger.warn(
        "WARNING: Kafka consumer connection failed - continuing without external signal events:",
        error.message,
      );
      logger.info(
        "System will continue to work but won't receive external SIGNAL_CREATED events",
      );
      kafkaConsumer = null;
    }
    httpServer.listen(Number(PORT), "0.0.0.0", () => {
      logger.info(`Trade Signal Monitor Backend is running on port ${PORT}!`);
    });
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
  } catch (error) {
    logger.error("Failed to start Trade Signal Monitor Backend:", error);
    process.exit(1);
  }
})();
