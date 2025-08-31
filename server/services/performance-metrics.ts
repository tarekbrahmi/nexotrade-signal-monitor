import { TradeSignal, PerformanceMetrics } from "../../shared/schema";

export class PerformanceCalculator {
  constructor() {}

  /**
   * Calculate simple performance metrics for a trade signal
   */
  calculateMetrics(
    signal: TradeSignal,
    currentPrice: number,
  ): PerformanceMetrics {
    const entryPrice = parseFloat(signal.entry_price.toString());
    const targetPrice = parseFloat(signal.target_price.toString());
    const stopLossPrice = parseFloat(signal.stop_loss_price.toString());
    const leverage = parseFloat(signal.leverage.toString()) || 1;

    // Current performance percentage
    let currentPerformance = 0;
    if (signal.signal_type === "BUY" || signal.signal_type === "buy") {
      currentPerformance =
        ((currentPrice - entryPrice) / entryPrice) * leverage * 100;
    } else {
      currentPerformance =
        ((entryPrice - currentPrice) / entryPrice) * leverage * 100;
    }

    // Risk-Reward Ratio (simple calculation from signal data)
    const riskRewardRatio = this.calculateRiskRewardRatio(
      entryPrice,
      targetPrice,
      stopLossPrice,
    );

    // Signal Strength (1-5 rating based on risk-reward and leverage)
    const signalStrength = this.calculateSignalStrength(
      riskRewardRatio,
      leverage,
    );

    return {
      currentPerformance,
      riskRewardRatio,
      signalStrength,
    };
  }

  /**
   * Calculate metrics for database storage
   */
  calculateMetricsForStorage(signal: TradeSignal, currentPrice: number) {
    const entryPrice = parseFloat(signal.entry_price.toString());
    const targetPrice = parseFloat(signal.target_price.toString());
    const stopLossPrice = parseFloat(signal.stop_loss_price.toString());
    const leverage = parseFloat(signal.leverage.toString()) || 1;

    // Risk-Reward Ratio
    const riskRewardRatio = this.calculateRiskRewardRatio(
      entryPrice,
      targetPrice,
      stopLossPrice,
    );

    // Signal Strength (1-5 rating)
    const signalStrength = this.calculateSignalStrength(
      riskRewardRatio,
      leverage,
    );

    // Market Trend (simple determination based on signal type)
    const marketTrend = this.determineMarketTrend(signal.signal_type);

    return {
      riskRewardRatio,
      signalStrength,
      marketTrend,
    };
  }

  private calculateRiskRewardRatio(
    entryPrice: number,
    targetPrice: number,
    stopLossPrice: number,
  ): number {
    const potentialReward = Math.abs(targetPrice - entryPrice);
    const potentialRisk = Math.abs(entryPrice - stopLossPrice);

    if (potentialRisk === 0) return 0;
    return Math.round((potentialReward / potentialRisk) * 100) / 100; // Round to 2 decimals
  }

  private calculateSignalStrength(
    riskRewardRatio: number,
    leverage: number,
  ): number {
    let strength = 1; // Base strength

    // Adjust based on risk-reward ratio
    if (riskRewardRatio >= 3) strength += 2;
    else if (riskRewardRatio >= 2) strength += 1;
    else if (riskRewardRatio < 1) strength -= 1;

    // Adjust based on leverage (higher leverage = higher signal strength)
    if (leverage >= 10) strength += 1;
    else if (leverage >= 5) strength += 0.5;

    // Ensure rating is between 1 and 5
    return Math.max(1, Math.min(5, Math.round(strength)));
  }

  private determineMarketTrend(
    signalType: string,
  ): "bullish" | "bearish" | "neutral" {
    // Simple trend determination based on signal type
    if (signalType === "BUY" || signalType === "buy" || signalType === "LONG") {
      return "bullish";
    } else if (
      signalType === "SELL" ||
      signalType === "sell" ||
      signalType === "SHORT"
    ) {
      return "bearish";
    }
    return "neutral";
  }
}
