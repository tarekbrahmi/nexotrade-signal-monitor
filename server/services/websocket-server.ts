import { SignalUpdateMessage, traderConnectionSchema } from "@shared/schema";
import { Server as HTTPServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import { verifyJWT } from "../utils/jwt";
import { logger } from "./logger";
import { SignalMonitor } from "./signal-monitor";

interface ConnectedTrader {
  id: string;
  channelId: number;
  socket: any;
}

export class WebSocketServer {
  private io: SocketIOServer;
  private connectedTraders = new Map<string, ConnectedTrader>();
  private channelConnections = new Map<number, Set<string>>();

  constructor(
    httpServer: HTTPServer,
    private signalMonitor: SignalMonitor,
  ) {
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"],
      },
    });

    this.setupEventHandlers();
    this.signalMonitor.onSignalUpdate(this.handleSignalUpdate.bind(this));
  }

  private setupEventHandlers(): void {
    this.io.on("connection", (socket) => {
      logger.info("New WebSocket connection:", socket.id);

      socket.on("authenticate", async (data) => {
        try {
          const connectionData = traderConnectionSchema.parse(data);
          const decoded = await verifyJWT(connectionData.jwt);

          if (decoded) {
            const trader: ConnectedTrader = {
              id: socket.id,
              channelId: connectionData.channel_id,
              socket,
            };

            this.connectedTraders.set(socket.id, trader);

            if (!this.channelConnections.has(connectionData.channel_id)) {
              this.channelConnections.set(connectionData.channel_id, new Set());
            }
            this.channelConnections
              .get(connectionData.channel_id)!
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

  private handleSignalUpdate(message: SignalUpdateMessage): void {
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

  getConnectionCount(): number {
    return this.connectedTraders.size;
  }

  async getActiveChannels(): Promise<
    Array<{
      id: number;
      connected_traders: number;
      active_signals: number;
      last_signal: string | null;
      status: string;
    }>
  > {
    const channels: Array<{
      id: number;
      connected_traders: number;
      active_signals: number;
      last_signal: string | null;
      status: string;
    }> = [];

    // Get all active signals from storage to calculate real data
    const activeSignals = await this.signalMonitor.getActiveTradeSignals();

    this.channelConnections.forEach((connections, channelId) => {
      // Calculate actual active signals for this channel
      const channelActiveSignals = activeSignals.filter(
        (signal) => signal.channel_id === channelId,
      );

      // Calculate last signal timestamp for this channel
      let lastSignalTime: string | null = null;
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
        const minutes = Math.floor(timeDiff / (1000 * 60));
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
}
