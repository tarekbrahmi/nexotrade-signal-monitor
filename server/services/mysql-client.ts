import mysql from "mysql2/promise";
import { TradeSignal, InsertTradeSignal } from "@shared/schema";
import { IStorage } from "../storage";
import { logger } from "./logger";

export class MySQLClient implements IStorage {
  private pool: mysql.Pool;

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

  async createTradeSignal(signal: InsertTradeSignal): Promise<TradeSignal> {
    const connection = await this.pool.getConnection();
    await connection.beginTransaction();

    try {
      // First check if signal already exists
      const [existing] = await connection.execute(
        "SELECT uuid FROM trade_signals WHERE uuid = ?",
        [signal.uuid],
      );

      if (Array.isArray(existing) && existing.length > 0) {
        logger.info(
          `Trade signal ${signal.uuid} already exists, skipping creation`,
        );
        await connection.rollback();
        return signal as TradeSignal;
      }

      // Insert new signal with all fields from updated schema including ID from Kafka
      // Keep created_at as ISO string (VARCHAR field stores it directly)
      const [result] = await connection.execute(
        `INSERT INTO trade_signals 
         (id, uuid, trader_id, channel_id, channel_uuid, visibility, signal_type, asset_symbol, 
          leverage, entry_price, target_price, stop_loss_price, trade_price, ttl, 
          performance_rating, created_at, status) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          signal.id, // Add ID from Kafka data
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
          signal.created_at, // Keep as ISO string
          signal.status,
        ],
      );

      await connection.commit();
      logger.info(
        `Trade signal ${signal.uuid} successfully created in database`,
      );
      return signal as TradeSignal;
    } catch (error) {
      await connection.rollback();
      logger.error(`Failed to create trade signal ${signal.uuid}:`, error);
      throw error;
    } finally {
      connection.release();
    }
  }

  async getTradeSignal(uuid: string): Promise<TradeSignal | undefined> {
    const connection = await this.pool.getConnection();
    try {
      const [rows] = await connection.execute(
        "SELECT * FROM trade_signals WHERE uuid = ?",
        [uuid],
      );
      const signals = rows as TradeSignal[];
      return signals.length > 0 ? signals[0] : undefined;
    } finally {
      connection.release();
    }
  }

  async updateTradeSignal(
    uuid: string,
    updates: Partial<TradeSignal>,
  ): Promise<void> {
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

  async updateTradeSignalStatus(
    uuid: string,
    status: "active" | "sl_hit" | "tp_hit" | "expired",
  ): Promise<void> {
    const connection = await this.pool.getConnection();
    try {
      await connection.execute(
        "UPDATE trade_signals SET status = ?, updatedAt = CURRENT_TIMESTAMP WHERE uuid = ?",
        [status, uuid],
      );
    } finally {
      connection.release();
    }
  }

  async getActiveTradeSignals(): Promise<TradeSignal[]> {
    const connection = await this.pool.getConnection();
    try {
      const [rows] = await connection.execute(
        'SELECT * FROM trade_signals WHERE status = "active"',
      );
      return rows as TradeSignal[];
    } finally {
      connection.release();
    }
  }

  async getTradeSignalsByChannel(channelId: number): Promise<TradeSignal[]> {
    const connection = await this.pool.getConnection();
    try {
      const [rows] = await connection.execute(
        "SELECT * FROM trade_signals WHERE channel_id = ?",
        [channelId],
      );
      return rows as TradeSignal[];
    } finally {
      connection.release();
    }
  }

  async disconnect(): Promise<void> {
    await this.pool.end();
  }
}
