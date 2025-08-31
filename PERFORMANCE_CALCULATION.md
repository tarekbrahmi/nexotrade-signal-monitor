# Trade Signal Performance Calculation

This document explains how trade signal performance is calculated using Binance futures trading formulas with leverage.

## Overview

The trade signal monitoring system calculates performance using the same methodology as Binance futures trading, where leverage multiplies the percentage gain/loss on a position.

## Performance Calculation Formulas

### LONG Positions (BUY/LONG)

For long positions, profit is made when the price goes up:

```
PnL% = ((Current_Price - Entry_Price) / Entry_Price) × Leverage × 100%
```

**Example:**

- Entry Price: $100
- Current Price: $105
- Leverage: 10x
- Performance: ((105 - 100) / 100) × 10 × 100% = 50%

### SHORT Positions (SELL/SHORT)

For short positions, profit is made when the price goes down:

```
PnL% = ((Entry_Price - Current_Price) / Entry_Price) × Leverage × 100%
```

**Example:**

- Entry Price: $100
- Current Price: $95
- Leverage: 10x
- Performance: ((100 - 95) / 100) × 10 × 100% = 50%

## How Leverage Works

Leverage multiplies your exposure to price movements:

- **1x Leverage**: 1% price move = 1% performance
- **10x Leverage**: 1% price move = 10% performance
- **100x Leverage**: 1% price move = 100% performance

### Examples

#### LONG Position with Different Leverage

Entry: $1000, Current: $1050 (5% price increase)

| Leverage | Performance Calculation | Result |
| -------- | ----------------------- | ------ |
| 1x       | (50/1000) × 1 × 100%    | +5%    |
| 10x      | (50/1000) × 10 × 100%   | +50%   |
| 25x      | (50/1000) × 25 × 100%   | +125%  |

#### SHORT Position with Different Leverage

Entry: $1000, Current: $950 (5% price decrease)

| Leverage | Performance Calculation | Result |
| -------- | ----------------------- | ------ |
| 1x       | (50/1000) × 1 × 100%    | +5%    |
| 10x      | (50/1000) × 10 × 100%   | +50%   |
| 25x      | (50/1000) × 25 × 100%   | +125%  |

## Signal Status Triggers

### Take Profit (tp_hit)

- **LONG**: Triggered when `Current_Price >= Target_Price`
- **SHORT**: Triggered when `Current_Price <= Target_Price`

### Stop Loss (sl_hit)

- **LONG**: Triggered when `Current_Price <= Stop_Loss_Price`
- **SHORT**: Triggered when `Current_Price >= Stop_Loss_Price`

### Expired

- Triggered when `Current_Time > (Created_At + TTL)`

## Signal Closure Fields

When a signal reaches any non-active status (tp_hit, sl_hit, expired), the system sets:

- **closedAt**: Timestamp when the signal was closed
- **executionPrice**: Market price at the time of closure
- **status**: Final status (tp_hit, sl_hit, or expired)

## Implementation Details

### Redis Storage

For monitoring active signals, only essential data is stored:

```json
{
  "signal_type": "BUY|SELL|LONG|SHORT",
  "entry_price": number,
  "target_price": number,
  "stop_loss_price": number,
  "leverage": number,
  "ttl": "Xh",
  "created_at": "ISO timestamp",
  "status": "active"
}
```

### Performance Monitoring

The system continuously monitors price updates and:

1. Calculates real-time performance using leverage
2. Checks for TP/SL triggers
3. Monitors TTL expiry
4. Updates signal status and closure fields when triggered

## Risk Considerations

⚠️ **Important**: Higher leverage amplifies both gains and losses:

- A 1% adverse price move with 100x leverage = -100% performance (total loss)
- Always consider risk management when using high leverage

## Formula Validation

These formulas match Binance futures trading calculations:

- ROE (Return on Equity) = PnL%
- Mark Price is used instead of Last Price for more accurate calculations
- Funding fees are not included in these calculations (as they don't apply to signals)

## Additional Performance Metrics

The system calculates additional metrics to provide comprehensive signal analysis beyond basic PnL performance.

### Risk-Reward Ratio

The risk-reward ratio measures the potential profit versus potential loss for a trade signal.

**Formula:**

```
Risk-Reward Ratio = |Target_Price - Entry_Price| / |Entry_Price - Stop_Loss_Price|
```

**Examples:**

**LONG Position:**

- Entry Price: $100
- Target Price: $120 (20% gain target)
- Stop Loss: $90 (10% loss protection)
- Risk-Reward Ratio: |120 - 100| / |100 - 90| = 20 / 10 = 2.0

**SHORT Position:**

- Entry Price: $100
- Target Price: $80 (20% gain target)
- Stop Loss: $110 (10% loss protection)
- Risk-Reward Ratio: |80 - 100| / |100 - 110| = 20 / 10 = 2.0

**Interpretation:**

- **Ratio ≥ 3.0**: Excellent risk-reward
- **Ratio ≥ 2.0**: Good risk-reward
- **Ratio ≥ 1.0**: Acceptable risk-reward
- **Ratio < 1.0**: Poor risk-reward (more risk than reward)

### Signal Strength

Signal strength is a 1-5 rating that evaluates signal quality based on risk-reward ratio and leverage.

**Calculation Logic:**

```
Base Strength = 1

Risk-Reward Adjustments:
- If ratio ≥ 3.0: +2 points
- If ratio ≥ 2.0: +1 point
- If ratio < 1.0: -1 point

Leverage Adjustments:
- If leverage ≥ 10x: +1 point
- If leverage ≥ 5x: +0.5 points

Final Rating = Max(1, Min(5, Rounded Total))
```

**Examples:**

| Risk-Reward | Leverage | Calculation           | Final Rating   |
| ----------- | -------- | --------------------- | -------------- |
| 3.5         | 10x      | 1 + 2 + 1 = 4         | ⭐⭐⭐⭐ (4/5) |
| 2.2         | 5x       | 1 + 1 + 0.5 = 2.5 → 3 | ⭐⭐⭐ (3/5)   |
| 1.5         | 2x       | 1 + 0 + 0 = 1         | ⭐ (1/5)       |
| 0.8         | 15x      | 1 - 1 + 1 = 1         | ⭐ (1/5)       |

**Rating Interpretation:**

- **5/5**: Exceptional signal quality
- **4/5**: Strong signal quality
- **3/5**: Good signal quality
- **2/5**: Fair signal quality
- **1/5**: Weak signal quality

### Market Trend

Market trend indicates the general direction based on recent price movement and signal type.

**Determination Logic:**

1. **Signal Type Based (Primary):**
   - BUY/LONG signals → "bullish"
   - SELL/SHORT signals → "bearish"

2. **Price History Analysis (Secondary):**
   - Analyzes last 5 price points
   - If price change > +0.5% → "bullish"
   - If price change < -0.5% → "bearish"
   - Otherwise → "neutral"

**Values:**

- **"bullish"**: Upward market direction
- **"bearish"**: Downward market direction
- **"neutral"**: Sideways or uncertain direction

## Real-Time Signal Updates

When monitoring active signals, the system broadcasts updates containing all performance metrics:

```json
{
  "type": "TRADE_SIGNAL_UPDATE",
  "channel_id": 48,
  "asset": "SOLUSDT",
  "signals": [
    {
      "uuid": "bf8e9289-3059-4ca9-b168-834837f34d3e",
      "signal_type": "BUY",
      "current_price": "204.9",
      "performance": "-2.44",
      "status": "active",
      "riskRewardRatio": 2.5,
      "signalStrength": 3,
      "marketTrend": "bullish"
    }
  ]
}
```

## Metrics Storage

When signals are closed (tp_hit, sl_hit, or expired), these metrics are permanently stored:

- **riskRewardRatio**: Calculated risk-reward ratio
- **signalStrength**: 1-5 signal quality rating
- **marketTrend**: Market direction at closure
- **executionPrice**: Final market price when closed
- **closedAt**: Timestamp of signal closure

These stored metrics enable comprehensive performance analysis and signal quality tracking over time.
