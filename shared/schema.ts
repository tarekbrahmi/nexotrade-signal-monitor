import { z } from "zod";

// Trade Signal interface - EXACTLY matching external Kafka event schema
export interface TradeSignal {
  id: number; // From external event (required)
  uuid: string; // From external event (required)
  trader_id: string; // From external event (required) - UUID string
  channel_id: number; // From external event (required)
  channel_uuid: string; // From external event (required) - UUID string
  visibility: "public" | "private"; // From external event (required)
  signal_type: "buy" | "sell" | "BUY" | "SELL"; // From external event (required)
  asset_symbol: string; // From external event (required)
  entry_price: number | string; // From external event (required) - number or string
  target_price: number | string; // From external event (required) - number or string
  stop_loss_price: number | string; // From external event (required) - number or string
  trade_price: number | string; // From external event (required) - number or string
  performance_rating: number | string; // From external event (required) - number or string
  leverage: number | string; // From external event (required) - number or string
  ttl:
    | "1h"
    | "2h"
    | "3h"
    | "4h"
    | "5h"
    | "6h"
    | "7h"
    | "8h"
    | "9h"
    | "10h"
    | "12h"
    | "24h"
    | "48h"
    | "72h"; // From external event (required)
  created_at: string; // From external event (required) - ISO date string
  status: "active" | "sl_hit" | "tp_hit" | "expired"; // Internal status tracking
  closed_at?: Date | null; // Internal field
  execution_price?: number | null; // Internal field
  updated_at?: Date; // Internal field

  // Simple Performance Metrics (no historical data dependency)
  risk_reward_ratio?: number | null; // TP distance / SL distance (calculated from signal data)
  signal_strength?: number | null; // 1-5 signal strength rating
  market_trend?: "bullish" | "bearish" | "neutral" | null; // Current market direction
}

// Insert schema - EXACTLY matching external event data structure
export interface InsertTradeSignal {
  id: number;
  uuid: string;
  trader_id: string;
  channel_id: number;
  channel_uuid: string;
  visibility: "public" | "private";
  signal_type: "buy" | "sell" | "BUY" | "SELL";
  asset_symbol: string;
  entry_price: number | string;
  target_price: number | string;
  stop_loss_price: number | string;
  trade_price: number | string;
  performance_rating: number | string;
  leverage: number | string;
  ttl:
    | "1h"
    | "2h"
    | "3h"
    | "4h"
    | "5h"
    | "6h"
    | "7h"
    | "8h"
    | "9h"
    | "10h"
    | "12h"
    | "24h"
    | "48h"
    | "72h";
  created_at: string;
  status: "active" | "sl_hit" | "tp_hit" | "expired";
}

// Zod schemas - EXACTLY matching external event schema
export const insertTradeSignalSchema = z.object({
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

// Simple Performance Metrics Interface (no historical data dependency)
export interface PerformanceMetrics {
  // Core Real-time Metrics
  currentPerformance: number; // Current P&L percentage
  riskRewardRatio: number; // TP distance / SL distance (keep camelCase for internal calculations)
  signalStrength: number; // 1-5 signal strength rating (keep camelCase for internal calculations)
}

export const signalCreatedEventSchema = z.object({
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

export const signalClosedEventSchema = z.object({
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

export const marketDataUpdateSchema = z.tuple([
  z.literal("nxt_price_update"),
  z.object({
    s: z.string(), // symbol
    c: z.string(), // current price
    P: z.string(), // percentage change
    h: z.string(), // high
    l: z.string(), // low
    q: z.string(), // quote volume
    t: z.number(), // timestamp
  }),
]);

export const traderConnectionSchema = z.object({
  jwt: z.string(),
  channel_id: z.number(),
});

export const signalUpdateMessageSchema = z.object({
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

// Export type definitions
export type SignalCreatedEvent = z.infer<typeof signalCreatedEventSchema>;
export type SignalClosedEvent = z.infer<typeof signalClosedEventSchema>;
export type MarketDataUpdate = z.infer<typeof marketDataUpdateSchema>;
export type TraderConnection = z.infer<typeof traderConnectionSchema>;
export type SignalUpdateMessage = z.infer<typeof signalUpdateMessageSchema>;

// PricePoint interface for tracking price history
export interface PricePoint {
  timestamp: Date;
  price: number;
}
