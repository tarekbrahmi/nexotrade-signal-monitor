import { IStorage } from "../storage";
import { RedisClient } from "./redis-client";

export class StartupSyncService {
  constructor(
    private storage: IStorage,
    private redisClient: RedisClient,
  ) {}

  async synchronizeSignals(): Promise<void> {
    console.log(
      "🔄 Starting signal synchronization at microservice startup...",
    );

    try {
      // Get all active signals from database
      const activeSignals = await this.storage.getActiveTradeSignals();
      console.log(`Found ${activeSignals.length} active signals in database`);

      let addedToRedis = 0;
      let expiredSignals = 0;

      for (const signal of activeSignals) {
        // Check if signal should be expired
        const createdAt = new Date(signal.created_at);
        const ttlHours = parseInt(signal.ttl.replace("h", ""));
        const expiryTime = new Date(
          createdAt.getTime() + ttlHours * 60 * 60 * 1000,
        );
        const now = new Date();

        if (now > expiryTime) {
          // Signal is expired, update status in database
          await this.storage.updateTradeSignalStatus(signal.uuid, "expired");
          console.log(
            `❌ Expired signal ${signal.uuid} (created: ${signal.created_at}, ttl: ${signal.ttl})`,
          );
          expiredSignals++;
          continue;
        }

        // Check if signal exists in Redis
        const redisKey = `${signal.channel_id}:${signal.asset_symbol}:${signal.uuid}`;
        const existingSignal = await this.redisClient.getSignal(redisKey);

        if (!existingSignal) {
          // Signal missing from Redis, add it
          const remainingTtlSeconds = Math.floor(
            (expiryTime.getTime() - now.getTime()) / 1000,
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

            console.log(
              `✅ Added missing signal ${signal.uuid} to Redis (TTL: ${Math.floor(remainingTtlSeconds / 3600)}h remaining)`,
            );
            addedToRedis++;
          }
        }
      }

      console.log(
        `✓ Synchronization complete: ${addedToRedis} signals added to Redis, ${expiredSignals} signals expired`,
      );
    } catch (error) {
      console.error("❌ Failed to synchronize signals at startup:", error);
      throw error;
    }
  }
}
