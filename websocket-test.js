import { io } from 'socket.io-client';

// WebSocket Test Client Class
class WSTestClient {
  constructor() {
    this.socket = null;
    this.isConnected = false;
    this.isAuthenticated = false;
  }

  // Connect to WebSocket server and authenticate
  async connect(jwt, channelId) {
    return new Promise((resolve, reject) => {
      console.log('Connecting to WebSocket server...');
      
      this.socket = io('http://localhost:5050', {
        transports: ['polling', 'websocket'],
        timeout: 15000,
        forceNew: true,
        autoConnect: true
      });

      this.socket.on('connect', () => {
        this.isConnected = true;
        console.log('WebSocket connected! Socket ID:', this.socket.id);
        
        // Send authentication data
        console.log(`Authenticating with JWT and channel ${channelId}...`);
        this.socket.emit('authenticate', {
          jwt: jwt,
          channel_id: channelId
        });
      });

      this.socket.on('authenticated', (data) => {
        this.isAuthenticated = true;
        console.log('Authentication successful!', data);
        resolve({ connected: true, authenticated: true });
      });

      this.socket.on('authentication_failed', (error) => {
        console.log('Authentication failed:', error);
        reject(new Error(`Authentication failed: ${error.error}`));
      });

      this.socket.on('signal_update', (message) => {
        console.log('Received signal update:', message);
      });

      this.socket.on('connect_error', (error) => {
        console.log('Connection error:', error.message);
        reject(new Error(error.message));
      });

      this.socket.on('disconnect', (reason) => {
        this.isConnected = false;
        this.isAuthenticated = false;
        console.log('Disconnected:', reason);
      });

      // Connection timeout
      setTimeout(() => {
        if (!this.isConnected) {
          reject(new Error('Connection timeout'));
        }
      }, 10000);
    });
  }

  // Disconnect from WebSocket server
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      console.log('Disconnected from WebSocket server');
    }
  }

  // Get connection status
  getStatus() {
    return {
      connected: this.isConnected,
      authenticated: this.isAuthenticated,
      socketId: this.socket?.id || null
    };
  }
}

// Use provided JWT token signed with correct secret
function getTestJWT() {
  return 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIxMmI1ZDZkNy1hMDAzLTQ5NGUtOTNkZi0zMmExNzk5YWFkNDciLCJ1c2VybmFtZSI6InRyYWRlcjJAbmV4b3RyYWRlLm5ldCIsImlhdCI6MTc1NjY1Mjg1NiwiZXhwIjoxNzU2NzM5MjU2fQ.A5hpSFRejLJsj5kZomSE-A6miJ3noxrXQRuagU3n9Vc';
}

// Main test function - keeps connection alive
async function testWebSocketConnection() {
  console.log('Starting WebSocket Connection Test');
  
  const client = new WSTestClient();
  
  try {
    // Get test JWT
    console.log('Using provided JWT token...');
    const jwt = getTestJWT();
    console.log('JWT token ready');
    
    // Test with channel ID 46
    const channelId = 48;
    console.log(`Testing connection with channel ${channelId}...`);
    
    // Connect and authenticate
    const result = await client.connect(jwt, channelId);
    console.log('WebSocket connection test successful!');
    console.log('Status:', client.getStatus());
    
    // Keep connection alive until process is terminated
    console.log('\nConnection established. Listening for signal updates...');
    console.log('Press Ctrl+C to disconnect and exit');
    
    // Keep the process alive
    process.on('SIGINT', () => {
      console.log('\nReceived exit signal, disconnecting...');
      client.disconnect();
      process.exit(0);
    });
    
    // Keep connection alive indefinitely
    setInterval(() => {
      if (client.isConnected) {
        console.log('Connection status: Connected and authenticated');
      }
    }, 30000);
    
  } catch (error) {
    console.error('Test failed:', error.message);
    client.disconnect();
    process.exit(1);
  }
}

// Run the test
testWebSocketConnection();

export { WSTestClient, getTestJWT, testWebSocketConnection };