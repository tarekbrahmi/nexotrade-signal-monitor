-- Trade Signal Monitor System - MySQL Database Setup Script
-- This script creates the database and tables needed for the trade signal monitoring system
DROP DATABASE  trade_signals;
-- Create database if it doesn't exist
CREATE DATABASE IF NOT EXISTS trade_signals;

-- Grant all privileges on the database to the nexotrade user
GRANT ALL PRIVILEGES ON trade_signals.* TO 'nexotrade'@'localhost';

-- Flush privileges to apply changes
FLUSH PRIVILEGES;

-- Use the database
USE trade_signals;

-- Create trade_signals table - EXACTLY matching external Kafka event schema
CREATE TABLE IF NOT EXISTS trade_signals (
  id INT PRIMARY KEY,                                     -- External ID from Kafka event (required)
  uuid VARCHAR(255) UNIQUE NOT NULL,                     -- UUID from Kafka event (required)
  trader_id VARCHAR(255) NOT NULL,                       -- Trader UUID from Kafka (required)
  channel_id INT NOT NULL,                               -- Channel ID from Kafka (required)
  channel_uuid VARCHAR(255) NOT NULL,                   -- Channel UUID from Kafka (required)
  visibility ENUM('public', 'private') NOT NULL,        -- Signal visibility from Kafka (required)
  signal_type ENUM('buy', 'sell', 'BUY', 'SELL') NOT NULL, -- Signal type from Kafka (required)
  asset_symbol VARCHAR(50) NOT NULL,                    -- Trading pair symbol (required)
  entry_price VARCHAR(255) NOT NULL,                    -- Entry price as string or number (required)
  target_price VARCHAR(255) NOT NULL,                   -- Target price as string or number (required)
  stop_loss_price VARCHAR(255) NOT NULL,                -- Stop loss price as string or number (required)
  trade_price VARCHAR(255) NOT NULL,                    -- Trade price as string or number (required)
  performance_rating VARCHAR(255) NOT NULL,             -- Performance rating as string or number (required)
  leverage VARCHAR(255) NOT NULL,                       -- Leverage as string or number (required)
  ttl ENUM('1h', '2h', '3h', '4h', '5h', '6h', '7h', '8h', '9h', '10h', '12h', '24h', '48h', '72h') NOT NULL, -- TTL from Kafka (required)
  created_at VARCHAR(255) NOT NULL,                     -- ISO date string from Kafka (required)
  status ENUM('active', 'sl_hit', 'tp_hit', 'expired') DEFAULT 'active', -- Internal status tracking
  closedAt TIMESTAMP NULL,                              -- Internal close timestamp
  executionPrice DECIMAL(20, 8) NULL,                   -- Internal execution price
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, -- Internal update timestamp
  
  -- Indexes for better query performance
  INDEX idx_uuid (uuid),                                -- Query by UUID
  INDEX idx_asset_symbol (asset_symbol),                -- Query by trading pair
  INDEX idx_status (status),                            -- Query by signal status
  INDEX idx_trader_id (trader_id),                      -- Query by trader
  INDEX idx_channel_id (channel_id),                    -- Query by channel
  INDEX idx_created_at (created_at)                     -- Query by creation time
);

-- Display table structure
DESCRIBE trade_signals;

-- Sample query to verify table exists
SELECT COUNT(*) as table_exists FROM information_schema.tables 
WHERE table_schema = 'trade_signals' AND table_name = 'trade_signals';

-- Show grants for nexotrade user
SHOW GRANTS FOR 'nexotrade'@'localhost';