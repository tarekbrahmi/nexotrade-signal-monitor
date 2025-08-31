import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';

interface UseWebSocketOptions {
  url?: string;
  autoConnect?: boolean;
}

export function useWebSocket(options: UseWebSocketOptions = {}) {
  const { url = window.location.origin, autoConnect = true } = options;
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<any>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (autoConnect) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [url, autoConnect]);

  const connect = () => {
    if (socketRef.current?.connected) {
      return;
    }

    socketRef.current = io(url, {
      transports: ['websocket'],
    });

    socketRef.current.on('connect', () => {
      setIsConnected(true);
    });

    socketRef.current.on('disconnect', () => {
      setIsConnected(false);
    });

    socketRef.current.onAny((eventName, data) => {
      setLastMessage({ eventName, data, timestamp: Date.now() });
    });
  };

  const disconnect = () => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
      setIsConnected(false);
    }
  };

  const emit = (eventName: string, data: any) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit(eventName, data);
    }
  };

  const on = (eventName: string, callback: (data: any) => void) => {
    if (socketRef.current) {
      socketRef.current.on(eventName, callback);
    }
  };

  const off = (eventName: string, callback?: (data: any) => void) => {
    if (socketRef.current) {
      socketRef.current.off(eventName, callback);
    }
  };

  return {
    isConnected,
    lastMessage,
    connect,
    disconnect,
    emit,
    on,
    off,
  };
}
