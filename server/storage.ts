import { type TradeSignal, type InsertTradeSignal } from "@shared/schema";

export interface IStorage {
  // Trade Signal methods
  createTradeSignal(signal: InsertTradeSignal): Promise<TradeSignal>;
  getTradeSignal(uuid: string): Promise<TradeSignal | undefined>;
  updateTradeSignal(uuid: string, updates: Partial<TradeSignal>): Promise<void>;
  updateTradeSignalStatus(uuid: string, status: "active" | "sl_hit" | "tp_hit" | "expired"): Promise<void>;
  getActiveTradeSignals(): Promise<TradeSignal[]>;
  getTradeSignalsByChannel(channelId: number): Promise<TradeSignal[]>;
}

// Memory storage removed - now using MySQL + Redis
// MySQL handles persistent storage via MySQLClient
// Redis handles temporary signal monitoring data with TTL
