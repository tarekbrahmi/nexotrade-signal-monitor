import { io, Socket } from 'socket.io-client';

export class WebSocketClient {
  private socket: Socket | null = null;
  private connected = false;
  private messageHandlers = new Map<string, Set<(data: any) => void>>();

  constructor(private url: string = window.location.origin) {}

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.socket?.connected) {
        resolve();
        return;
      }

      this.socket = io(this.url, {
        transports: ['websocket'],
        timeout: 10000,
      });

      this.socket.on('connect', () => {
        this.connected = true;
        console.log('WebSocket connected');
        resolve();
      });

      this.socket.on('connect_error', (error) => {
        console.error('WebSocket connection error:', error);
        reject(error);
      });

      this.socket.on('disconnect', () => {
        this.connected = false;
        console.log('WebSocket disconnected');
      });

      // Handle all incoming messages
      this.socket.onAny((eventName, data) => {
        const handlers = this.messageHandlers.get(eventName);
        if (handlers) {
          handlers.forEach(handler => {
            try {
              handler(data);
            } catch (error) {
              console.error(`Error in message handler for ${eventName}:`, error);
            }
          });
        }
      });
    });
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.connected = false;
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  emit(eventName: string, data: any): void {
    if (this.socket?.connected) {
      this.socket.emit(eventName, data);
    } else {
      console.warn('Cannot emit - WebSocket not connected');
    }
  }

  on(eventName: string, handler: (data: any) => void): void {
    if (!this.messageHandlers.has(eventName)) {
      this.messageHandlers.set(eventName, new Set());
    }
    this.messageHandlers.get(eventName)!.add(handler);
  }

  off(eventName: string, handler: (data: any) => void): void {
    const handlers = this.messageHandlers.get(eventName);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.messageHandlers.delete(eventName);
      }
    }
  }

  authenticate(jwt: string, channelId: number): void {
    this.emit('authenticate', { jwt, channel_id: channelId });
  }
}

export const wsClient = new WebSocketClient();
