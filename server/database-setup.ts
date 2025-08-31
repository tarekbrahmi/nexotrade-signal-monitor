import mysql from 'mysql2/promise';

async function setupDatabase() {
  const dbConfig = {
    host: process.env.DB_HOST || '51.79.84.45',
    user: process.env.DB_USER || 'nexotrade',
    password: process.env.DB_PASS || 'P@SSw0rd',
    port: parseInt(process.env.DB_PORT || '3306'),
  };

  let connection: mysql.Connection;

  try {
    // Connect without specifying database first
    connection = await mysql.createConnection(dbConfig);
    console.log('✓ Connected to MySQL server');

    // Create database if it doesn't exist
    const dbName = process.env.DB_NAME || 'trade_signals';
    await connection.execute(`CREATE DATABASE IF NOT EXISTS ${dbName}`);
    console.log(`✓ Database "${dbName}" created or verified`);

    // Close the initial connection and reconnect with the database specified
    await connection.end();
    
    // Reconnect with the specific database
    connection = await mysql.createConnection({
      ...dbConfig,
      database: dbName
    });

    // Create trade_signals table - updated to match Kafka event schema
    const createTradeSignalsTable = `
      CREATE TABLE IF NOT EXISTS trade_signals (
        uuid VARCHAR(255) PRIMARY KEY,
        trader_id VARCHAR(255) NOT NULL,
        channel_id INT NOT NULL,
        channel_uuid VARCHAR(255),
        visibility VARCHAR(50),
        signal_type ENUM('BUY', 'SELL', 'LONG', 'SHORT') NOT NULL,
        asset_symbol VARCHAR(50) NOT NULL,
        leverage INT NOT NULL,
        entry_price DECIMAL(20, 8) NOT NULL,
        target_price DECIMAL(20, 8),
        stop_loss_price DECIMAL(20, 8),
        trade_price DECIMAL(20, 8),
        ttl ENUM('1h', '2h', '3h', '4h', '5h', '6h', '7h', '8h', '9h', '10h', '12h', '24h', '48h', '72h') DEFAULT '24h',
        performance_rating DECIMAL(5, 2),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        status ENUM('active', 'sl_hit', 'tp_hit', 'expired') DEFAULT 'active',
        closed_at TIMESTAMP NULL,
        execution_price DECIMAL(20, 8) NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_asset_symbol (asset_symbol),
        INDEX idx_status (status),
        INDEX idx_trader_id (trader_id),
        INDEX idx_channel_id (channel_id),
        INDEX idx_created_at (created_at)
      )
    `;
    await connection.execute(createTradeSignalsTable);
    
    console.log('🎉 Database setup completed successfully!');
    return true;

  } catch (error) {
    console.error('❌ Database setup failed:', error);
    return false;
  } finally {
    if (connection!) {
      await connection.end();
    }
  }
}

export { setupDatabase };