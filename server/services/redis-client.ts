import { createClient, RedisClientType } from "redis";
import { logger } from "./logger";

export class RedisClient {
  private client: RedisClientType | null = null;
  private connected = false;
  private host: string;
  private port: number;
  private fallbackStorage = new Map();
  private usingFallback = false;
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
      this.connected = false;
      this.enableFallback();
    });

    this.client.on("connect", () => {
      this.connected = true;
      this.usingFallback = false;
      this.reconnectAttempts = 0;
    });

    this.client.on("disconnect", () => {
      this.connected = false;
    });
  }

  async connect(): Promise<void> {
    this.createClient();

    if (!this.client) {
      throw new Error("Failed to create Redis client");
    }

    try {
      await this.client.connect();
      this.connected = true;
      this.usingFallback = false;
    } catch (error: any) {
      this.connected = false;
      this.enableFallback();
      // Don't throw error, use fallback instead
    }
  }

  private enableFallback(): void {
    this.usingFallback = true;
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
    if (this.usingFallback || !this.client || !this.connected) {
      // Use fallback storage with TTL simulation
      this.fallbackStorage.set(key, {
        value,
        expires: Date.now() + ttlSeconds * 1000,
      });
      return;
    }

    try {
      await this.client.setEx(key, ttlSeconds, JSON.stringify(value));
    } catch (error: any) {
      logger.warn("Failed to set Redis key, using fallback:", error.message);
      this.fallbackStorage.set(key, {
        value,
        expires: Date.now() + ttlSeconds * 1000,
      });
    }
  }

  async getSignal(key: string): Promise<any | null> {
    if (this.usingFallback || !this.client || !this.connected) {
      const item = this.fallbackStorage.get(key);
      if (item && item.expires > Date.now()) {
        return item.value;
      }
      if (item) {
        this.fallbackStorage.delete(key); // Remove expired
      }
      return null;
    }

    try {
      const value = await this.client.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error: any) {
      logger.warn("Failed to get Redis key, checking fallback:", error.message);
      const item = this.fallbackStorage.get(key);
      if (item && item.expires > Date.now()) {
        return item.value;
      }
      return null;
    }
  }

  async deleteSignal(key: string): Promise<void> {
    if (this.usingFallback || !this.client || !this.connected) {
      this.fallbackStorage.delete(key);
      return;
    }

    try {
      await this.client.del(key);
      this.fallbackStorage.delete(key); // Also remove from fallback
    } catch (error: any) {
      logger.warn("Failed to delete Redis key:", error.message);
      this.fallbackStorage.delete(key);
    }
  }

  async getKeysByPattern(pattern: string): Promise<string[]> {
    if (this.usingFallback || !this.client || !this.connected) {
      // Simple pattern matching for fallback
      const keys = Array.from(this.fallbackStorage.keys());
      const regex = new RegExp(pattern.replace(/\*/g, ".*"));
      return keys.filter((key) => regex.test(key));
    }

    try {
      return await this.client.keys(pattern);
    } catch (error: any) {
      logger.warn("Failed to get Redis keys by pattern:", error.message);
      const keys = Array.from(this.fallbackStorage.keys());
      const regex = new RegExp(pattern.replace(/\*/g, ".*"));
      return keys.filter((key) => regex.test(key));
    }
  }

  async getMemoryUsage(): Promise<string> {
    if (this.usingFallback || !this.client || !this.connected) {
      const itemCount = this.fallbackStorage.size;
      return `Fallback: ${itemCount} items`;
    }

    try {
      const info = await this.client.info("memory");
      const usedMemoryMatch = info.match(/used_memory_human:(.+)/);
      return usedMemoryMatch ? usedMemoryMatch[1].trim() : "0B";
    } catch (error: any) {
      logger.warn("Failed to get Redis memory usage:", error.message);
      const itemCount = this.fallbackStorage.size;
      return `Fallback: ${itemCount} items`;
    }
  }
}
