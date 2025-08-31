import { IStorage } from '../storage';
import { RedisClient } from './redis-client';
import { SignalUpdateMessage } from '@shared/schema';

export class SignalMonitor {
  private priceCache = new Map<string, number>();
  private updateCallbacks = new Set<(message: SignalUpdateMessage) => void>();

  constructor(
    private storage: IStorage,
    private redisClient: RedisClient
  ) {}

  async onPriceUpdate(symbol: string, price: number): Promise<void> {
    this.priceCache.set(symbol, price);
    await this.checkSignalsForAsset(symbol, price);
  }

  private async checkSignalsForAsset(symbol: string, currentPrice: number): Promise<void> {
    try {
      // Get all Redis keys for this asset symbol
      const pattern = `*:${symbol}:*`;
      const keys = await this.redisClient.getKeysByPattern(pattern);

      const channelUpdates = new Map<number, SignalUpdateMessage>();

      for (const key of keys) {
        const signalData = await this.redisClient.getSignal(key);
        if (!signalData) continue;

        const [channelId, assetSymbol, uuid] = key.split(':');
        const channelIdNum = parseInt(channelId);

        // Calculate performance using Binance futures formula
        const entryPrice = parseFloat(signalData.entry_price);
        const targetPrice = parseFloat(signalData.target_price);
        const stopLossPrice = parseFloat(signalData.stop_loss_price);
        const leverage = parseFloat(signalData.leverage) || 1; // Default to 1x if no leverage

        let newStatus = signalData.status;
        let performance = 0;

        // Binance futures performance calculation: PnL% = ((Price_Change / Entry_Price) × Leverage × 100%)
        if (signalData.signal_type === 'BUY' || signalData.signal_type === 'LONG') {
          // LONG: PnL% = ((Current_Price - Entry_Price) / Entry_Price) × Leverage × 100%
          performance = ((currentPrice - entryPrice) / entryPrice) * leverage * 100;
          if (currentPrice >= targetPrice) {
            newStatus = 'tp_hit';
          } else if (currentPrice <= stopLossPrice) {
            newStatus = 'sl_hit';
          }
        } else if (signalData.signal_type === 'SELL' || signalData.signal_type === 'SHORT') {
          // SHORT: PnL% = ((Entry_Price - Current_Price) / Entry_Price) × Leverage × 100%
          performance = ((entryPrice - currentPrice) / entryPrice) * leverage * 100;
          if (currentPrice <= targetPrice) {
            newStatus = 'tp_hit';
          } else if (currentPrice >= stopLossPrice) {
            newStatus = 'sl_hit';
          }
        }

        // Check TTL expiry
        const createdAt = new Date(signalData.created_at);
        const ttlHours = parseInt(signalData.ttl.replace('h', ''));
        const expiryTime = new Date(createdAt.getTime() + ttlHours * 60 * 60 * 1000);
        
        if (new Date() > expiryTime && newStatus === 'active') {
          newStatus = 'expired';
        }

        // Update status if changed
        if (newStatus !== signalData.status) {
          // If signal is being closed (not active anymore), set closure fields
          if (newStatus !== 'active') {
            await this.storage.updateTradeSignal(uuid, {
              status: newStatus,
              closedAt: new Date(),
              executionPrice: currentPrice,
              updatedAt: new Date()
            });
            await this.redisClient.deleteSignal(key);
          } else {
            // Just update status if still active
            await this.storage.updateTradeSignalStatus(uuid, newStatus);
          }
        }

        // Prepare channel update
        if (!channelUpdates.has(channelIdNum)) {
          channelUpdates.set(channelIdNum, {
            type: 'TRADE_SIGNAL_UPDATE',
            channel_id: channelIdNum,
            asset: symbol,
            signals: []
          });
        }

        const channelUpdate = channelUpdates.get(channelIdNum)!;
        channelUpdate.signals.push({
          uuid,
          signal_type: signalData.signal_type,
          current_price: currentPrice.toString(),
          performance: performance.toFixed(2),
          status: newStatus
        });
      }

      // Broadcast updates to connected clients
      for (const update of Array.from(channelUpdates.values())) {
        this.broadcastUpdate(update);
      }

    } catch (error) {
      console.error('Error checking signals for asset:', error);
    }
  }

  private broadcastUpdate(message: SignalUpdateMessage): void {
    this.updateCallbacks.forEach(callback => {
      try {
        callback(message);
      } catch (error) {
        console.error('Error in signal update callback:', error);
      }
    });
  }

  onSignalUpdate(callback: (message: SignalUpdateMessage) => void): void {
    this.updateCallbacks.add(callback);
  }

  removeSignalUpdateCallback(callback: (message: SignalUpdateMessage) => void): void {
    this.updateCallbacks.delete(callback);
  }

  getCurrentPrice(symbol: string): number | undefined {
    return this.priceCache.get(symbol);
  }
}
