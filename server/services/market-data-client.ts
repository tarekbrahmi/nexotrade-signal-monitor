import { io, Socket } from "socket.io-client";
import { SignalMonitor } from "./signal-monitor";
import { logger } from "./logger";

export class MarketDataClient {
  private socket: Socket | null = null;
  private connected = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  constructor(private signalMonitor: SignalMonitor) {}

  async connect(): Promise<void> {
    try {
      const wsUrl =
        process.env.MARKET_DATA_WEBSOCKET_URL || "wss://www.demo.nexotrade.net";

      this.socket = io(wsUrl, {
        path: "/nexotrade-blockchain/ws/socket.io",
        transports: ["websocket", "polling"],
        upgrade: true,
        rememberUpgrade: true,
        timeout: 10000,
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

      // Listen ONLY for the specific array format: ["nxt_price_update", {...}]
      this.socket.onAny((eventName, ...args) => {
        // Handle only if it's the nxt_price_update event with proper array format
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

  private processPriceUpdate(data: any): void {
    try {
      // The data comes as an object with properties: s, c, P, h, l, q, t
      if (data && data.s && data.c) {
        this.signalMonitor.onPriceUpdate(data.s, parseFloat(data.c));
      }
    } catch (error) {
      logger.error("Error processing price update:", error);
    }
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);

      setTimeout(() => {
        this.connect().catch(() => {
          // Connection failed, will try again
        });
      }, delay);
    }
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }
}
