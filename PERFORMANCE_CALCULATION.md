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
|----------|------------------------|--------|
| 1x | (50/1000) × 1 × 100% | +5% |
| 10x | (50/1000) × 10 × 100% | +50% |
| 25x | (50/1000) × 25 × 100% | +125% |

#### SHORT Position with Different Leverage

Entry: $1000, Current: $950 (5% price decrease)

| Leverage | Performance Calculation | Result |
|----------|------------------------|--------|
| 1x | (50/1000) × 1 × 100% | +5% |
| 10x | (50/1000) × 10 × 100% | +50% |
| 25x | (50/1000) × 25 × 100% | +125% |

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