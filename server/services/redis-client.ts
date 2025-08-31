import { createClient, RedisClientType } from "redis";
import { logger } from "./logger";

export class RedisClient {
  private client: RedisClientType | null = null;
  private connected = false;
  private host: string;
  private port: number;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 3;

  constructor(
    host = "localhost",
    port = 6379,
    db = 0,
    password: string | null = null,
  ) {
    this.host = host;
    this.port = port;
  }

  private createClient() {
    if (this.client) return;

    this.client = createClient({
      socket: {
        host: this.host,
        port: this.port,
        connectTimeout: 10000,
        reconnectStrategy: (retries) => {
          if (retries < this.maxReconnectAttempts) {
            return Math.min(retries * 1000, 3000);
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

  async connect(): Promise<void> {
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
      logger.error("Failed to connect to Redis:", (error as Error).message);
      logger.error("Application cannot continue without Redis. Exiting...");
      process.exit(1);
    }
  }

  async disconnect(): Promise<void> {
    if (this.client && this.connected) {
      await this.client.disconnect();
    }
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  async setSignal(key: string, value: any, ttlSeconds: number): Promise<void> {
    if (!this.client || !this.connected) {
      logger.error("Redis client not connected. Cannot set signal.");
      throw new Error("Redis connection required");
    }

    try {
      await this.client.setEx(key, ttlSeconds, JSON.stringify(value));
    } catch (error) {
      logger.error("Failed to set Redis key:", (error as Error).message);
      throw error;
    }
  }

  async getSignal(key: string): Promise<any | null> {
    if (!this.client || !this.connected) {
      logger.error("Redis client not connected. Cannot get signal.");
      throw new Error("Redis connection required");
    }

    try {
      const value = await this.client.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.error("Failed to get Redis key:", (error as Error).message);
      throw error;
    }
  }

  async deleteSignal(key: string): Promise<void> {
    if (!this.client || !this.connected) {
      logger.error("Redis client not connected. Cannot delete signal.");
      throw new Error("Redis connection required");
    }

    try {
      await this.client.del(key);
    } catch (error) {
      logger.error("Failed to delete Redis key:", (error as Error).message);
      throw error;
    }
  }

  async getKeysByPattern(pattern: string): Promise<string[]> {
    if (!this.client || !this.connected) {
      logger.error("Redis client not connected. Cannot get keys by pattern.");
      throw new Error("Redis connection required");
    }

    try {
      return await this.client.keys(pattern);
    } catch (error) {
      logger.error(
        "Failed to get Redis keys by pattern:",
        (error as Error).message,
      );
      throw error;
    }
  }

  async getMemoryUsage(): Promise<string> {
    if (!this.client || !this.connected) {
      logger.error("Redis client not connected. Cannot get memory usage.");
      throw new Error("Redis connection required");
    }

    try {
      const info = await this.client.info("memory");
      const usedMemoryMatch = info.match(/used_memory_human:(.+)/);
      return usedMemoryMatch ? usedMemoryMatch[1].trim() : "0B";
    } catch (error) {
      logger.error(
        "Failed to get Redis memory usage:",
        (error as Error).message,
      );
      throw error;
    }
  }
}
