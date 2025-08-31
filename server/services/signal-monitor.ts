import { IStorage } from '../storage';
import { RedisClient } from './redis-client';
import { SignalUpdateMessage, PricePoint, TradeSignal } from '@shared/schema';
import { PerformanceCalculator } from './performance-metrics';
import { KafkaProducer } from './kafka-producer';

export class SignalMonitor {
  private priceCache = new Map<string, number>();
  private priceHistory = new Map<string, PricePoint[]>();
  private updateCallbacks = new Set<(message: SignalUpdateMessage) => void>();
  private performanceCalculator: PerformanceCalculator;
  private kafkaProducer: KafkaProducer | null;

  constructor(
    private storage: IStorage,
    private redisClient: RedisClient,
    kafkaProducer: KafkaProducer | null = null
  ) {
    this.performanceCalculator = new PerformanceCalculator();
    this.kafkaProducer = kafkaProducer;
    this.initializePriceHistoryCleanup();
  }

  async onPriceUpdate(symbol: string, price: number): Promise<void> {
    this.priceCache.set(symbol, price);
    this.addPricePoint(symbol, price);
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
        const leverage = parseFloat(signalData.leverage);

        let newStatus = signalData.status;
        let performance = 0;

        // Binance futures performance calculation: PnL% = ((Price_Change / Entry_Price) × Leverage × 100%)
        if (signalData.signal_type === 'BUY' || signalData.signal_type === 'buy') {
          // LONG: PnL% = ((Current_Price - Entry_Price) / Entry_Price) × Leverage × 100%
          performance = ((currentPrice - entryPrice) / entryPrice) * leverage * 100;
          if (currentPrice >= targetPrice) {
            newStatus = 'tp_hit';
          } else if (currentPrice <= stopLossPrice) {
            newStatus = 'sl_hit';
          }
        } else if (signalData.signal_type === 'SELL' || signalData.signal_type === 'sell') {
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
          // If signal is being closed (not active anymore), set closure fields and calculate metrics
          if (newStatus !== 'active') {
            await this.closeSignalWithMetrics(uuid, symbol, currentPrice, newStatus, signalData);
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
        
        // Calculate additional metrics for real-time updates
        const metrics = this.performanceCalculator.calculateMetricsForStorage(signalData, currentPrice);
        const marketTrend = this.determineMarketTrend(symbol, currentPrice);
        
        channelUpdate.signals.push({
          uuid,
          signal_type: signalData.signal_type,
          current_price: currentPrice.toString(),
          performance: performance.toFixed(2),
          status: newStatus,
          riskRewardRatio: metrics.riskRewardRatio,
          signalStrength: metrics.signalStrength,
          marketTrend: marketTrend
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

  private addPricePoint(symbol: string, price: number): void {
    const timestamp = new Date();
    const pricePoint: PricePoint = { timestamp, price };
    
    if (!this.priceHistory.has(symbol)) {
      this.priceHistory.set(symbol, []);
    }
    
    const history = this.priceHistory.get(symbol)!;
    history.push(pricePoint);
    
    // Keep only last 1000 price points per symbol to manage memory
    if (history.length > 1000) {
      history.shift();
    }
  }

  private initializePriceHistoryCleanup(): void {
    // Clean up old price history every 5 minutes
    setInterval(() => {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      
      for (const symbol of Array.from(this.priceHistory.keys())) {
        const history = this.priceHistory.get(symbol)!;
        const recentHistory = history.filter((point: PricePoint) => point.timestamp > fiveMinutesAgo);
        this.priceHistory.set(symbol, recentHistory);
      }
    }, 5 * 60 * 1000); // Run every 5 minutes
  }

  private async closeSignalWithMetrics(
    uuid: string, 
    symbol: string, 
    currentPrice: number, 
    newStatus: 'active' | 'sl_hit' | 'tp_hit' | 'expired', 
    signalData: TradeSignal
  ): Promise<void> {
    try {
      // Calculate simple performance metrics
      const metrics = this.performanceCalculator.calculateMetrics(signalData, currentPrice);
      
      // Determine market trend (simple heuristic based on recent price movement)
      const marketTrend = this.determineMarketTrend(symbol, currentPrice);
      
      // Update the signal with simple metrics
      await this.storage.updateTradeSignal(uuid, {
        status: newStatus,
        closedAt: new Date(),
        executionPrice: currentPrice,
        updatedAt: new Date(),
        riskRewardRatio: metrics.riskRewardRatio,
        signalStrength: metrics.signalStrength,
        marketTrend: marketTrend
      });

      // Publish SIGNAL_CLOSED event to Kafka
      if (this.kafkaProducer) {
        try {
          // Calculate performance percentage for the event
          const entryPrice = typeof signalData.entry_price === 'string' ? parseFloat(signalData.entry_price) : signalData.entry_price;
          const leverage = (typeof signalData.leverage === 'string' ? parseFloat(signalData.leverage) : signalData.leverage) || 1;
          let performance = 0;

          if (signalData.signal_type === 'BUY' || signalData.signal_type === 'buy') {
            performance = ((currentPrice - entryPrice) / entryPrice) * leverage * 100;
          } else if (signalData.signal_type === 'SELL' || signalData.signal_type === 'sell') {
            performance = ((entryPrice - currentPrice) / entryPrice) * leverage * 100;
          }

          await this.kafkaProducer.publishSignalClosed({
            uuid: uuid,
            trader_id: signalData.trader_id,
            channel_id: signalData.channel_id,
            execution_price: currentPrice,
            closed_at: new Date(),
            performance: performance.toFixed(2) + '%',
            riskRewardRatio: metrics.riskRewardRatio,
            signalStrength: metrics.signalStrength,
            status: newStatus as 'tp_hit' | 'sl_hit' | 'expired'
          });
          
          console.log(`✓ Published SIGNAL_CLOSED event for ${uuid} to Kafka`);
        } catch (kafkaError) {
          console.error(`Failed to publish SIGNAL_CLOSED event for ${uuid}:`, kafkaError);
        }
      }
      
      console.log(`✓ Signal ${uuid} closed with status ${newStatus} and simple metrics calculated`);
      
    } catch (error) {
      console.error(`Error calculating metrics for signal ${uuid}:`, error);
      
      // Fallback to basic update without metrics
      await this.storage.updateTradeSignal(uuid, {
        status: newStatus,
        closedAt: new Date(),
        executionPrice: currentPrice,
        updatedAt: new Date()
      });
    }
  }

  private determineMarketTrend(symbol: string, currentPrice: number): 'bullish' | 'bearish' | 'neutral' {
    const history = this.priceHistory.get(symbol) || [];
    if (history.length < 5) return 'neutral';
    
    // Look at last 5 price points to determine trend
    const recentHistory = history.slice(-5);
    const firstPrice = recentHistory[0].price;
    const lastPrice = recentHistory[recentHistory.length - 1].price;
    
    const changePercent = ((lastPrice - firstPrice) / firstPrice) * 100;
    
    if (changePercent > 0.5) return 'bullish';
    if (changePercent < -0.5) return 'bearish';
    return 'neutral';
  }

}
