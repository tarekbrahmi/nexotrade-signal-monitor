import { Server as SocketIOServer } from "socket.io";
import { Server as HTTPServer } from "http";
import {
  TraderConnection,
  traderConnectionSchema,
  SignalUpdateMessage,
} from "@shared/schema";
import { verifyJWT } from "../utils/jwt";
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
      console.log("New WebSocket connection:", socket.id);

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
            console.log(
              `Trader authenticated for channel ${connectionData.channel_id}`,
            );
          } else {
            socket.emit("authentication_failed", {
              error: "Invalid JWT token",
            });
            socket.disconnect();
          }
        } catch (error) {
          console.error("Authentication error:", error);
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
        console.log("WebSocket disconnected:", socket.id);
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

  getActiveChannels(): Array<{
    id: number;
    connectedTraders: number;
    activeSignals: number;
    lastSignal: string;
    status: string;
  }> {
    const channels: Array<{
      id: number;
      connectedTraders: number;
      activeSignals: number;
      lastSignal: string;
      status: string;
    }> = [];

    this.channelConnections.forEach((connections, channelId) => {
      channels.push({
        id: channelId,
        connectedTraders: connections.size,
        activeSignals: 0, // This would be calculated from actual signal data
        lastSignal: "2 minutes ago", // This would be calculated from actual signal data
        status: connections.size > 0 ? "active" : "idle",
      });
    });

    return channels;
  }
}
