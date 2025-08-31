import 'dotenv/config';
import express from 'express';
// Removed memory storage import - now using MySQL + Redis
import { KafkaConsumer } from "./services/kafka-consumer";
import { MarketDataClient } from "./services/market-data-client";
import { SignalMonitor } from "./services/signal-monitor";
import { RedisClient } from "./services/redis-client";
import { MySQLClient } from "./services/mysql-client";
import { setupDatabase } from "./database-setup";

console.log("Starting Trade Signal Monitor Backend...");

// Create express app for health checks
const app = express();
const PORT = process.env.PORT || 5000;

app.get('/', (req, res) => {
  res.json({ 
    status: 'running', 
    service: 'Trade Signal Monitor Backend',
    timestamp: new Date().toISOString()
  });
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    services: {
      mysql: 'checking...',
      redis: 'checking...',
      kafka: 'checking...',
      websocket: 'checking...'
    }
  });
});

(async () => {
  try {
    // Setup database first - CRITICAL
    console.log("Setting up database...");
    const dbSetupSuccess = await setupDatabase();
    if (!dbSetupSuccess) {
      console.error("💥 CRITICAL: Database setup failed! Exiting...");
      process.exit(1);
    }
    
    console.log("Initializing storage...");
    
    // Initialize MySQL client - CRITICAL
    let mysqlClient: MySQLClient | null = null;
    try {
      mysqlClient = new MySQLClient();
      console.log("✓ MySQL client initialized");
    } catch (error) {
      console.error("💥 CRITICAL: MySQL client initialization failed!", (error as Error).message);
      process.exit(1);
    }
    
    // Initialize Redis client - CRITICAL
    let redisClient: RedisClient | null = null;
    try {
      redisClient = new RedisClient();
      await redisClient.connect();
      console.log("✓ Redis client connected successfully");
    } catch (error) {
      console.error("💥 CRITICAL: Redis connection failed!", (error as Error).message);
      process.exit(1);
    }

    // Initialize signal monitor with MySQL storage
    console.log("Initializing signal monitor...");
    const signalMonitor = new SignalMonitor(mysqlClient, redisClient);

    // Initialize market data client - CRITICAL
    console.log("Connecting to market data WebSocket...");
    const marketDataClient = new MarketDataClient(signalMonitor);
    try {
      await marketDataClient.connect();
      console.log("✓ Market data client connected");
    } catch (error) {
      console.error("💥 CRITICAL: Market data WebSocket connection failed!", (error as Error).message);
      process.exit(1);
    }

    // Initialize Kafka consumer with MySQL storage - CRITICAL
    console.log("Connecting to Kafka...");
    let kafkaConsumer: KafkaConsumer | null = null;
    try {
      kafkaConsumer = new KafkaConsumer(mysqlClient, redisClient, signalMonitor);
      await kafkaConsumer.connect();
      console.log("✓ Kafka consumer connected and listening for SIGNAL_CREATED events");
    } catch (error) {
      console.error("💥 CRITICAL: Kafka connection failed!", (error as Error).message);
      process.exit(1);
    }

    // Start the Express server
    app.listen(Number(PORT), '0.0.0.0', () => {
      console.log(`\n🚀 Trade Signal Monitor Backend is running on port ${PORT}!`);
      console.log("- Listening for SIGNAL_CREATED events on Kafka");
      console.log("- Processing real-time market data from WebSocket");
      console.log("- Monitoring active trade signals");
      console.log(`- Health check available at http://localhost:${PORT}/health`);
    });
    
    // Keep the process running
    process.on('SIGINT', async () => {
      console.log('\nShutting down gracefully...');
      
      if (redisClient) {
        await redisClient.disconnect();
        console.log('✓ Redis disconnected');
      }
      
      if (mysqlClient) {
        await mysqlClient.disconnect();
        console.log('✓ MySQL disconnected');
      }
      
      marketDataClient.disconnect();
      console.log('✓ Market data client disconnected');
      
      if (kafkaConsumer) {
        await kafkaConsumer.disconnect();
        console.log('✓ Kafka consumer disconnected');
      }
      
      console.log('✓ Shutdown complete');
      process.exit(0);
    });

    // Kafka consumer is now set up to listen for events automatically
    // No need for periodic polling - events are processed as they arrive

  } catch (error) {
    console.error("❌ Failed to start Trade Signal Monitor Backend:", error);
    process.exit(1);
  }
})();
