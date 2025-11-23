/**
 * WEBSOCKET CONFIGURATION MODULE
 * 
 * Handles Socket.io initialization and real-time communication
 * Features:
 * - Real-time vault synchronization
 * - Live notifications
 * - User presence tracking
 * - Room-based messaging
 * - Error handling and logging
 * - Connection authentication
 */

const jwt = require('jsonwebtoken');
const { cacheSet, cacheGet, cacheDel } = require('./redis');

// Store active connections for tracking
const activeConnections = new Map();

/**
 * Initialize WebSocket handlers
 * 
 * @param {Object} io - Socket.io instance
 */
function initializeWebSocket(io) {
  console.log('🔌 Initializing WebSocket handlers...');

  /**
   * Middleware: Authenticate socket connection
   */
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization;
      
      if (!token) {
        return next(new Error('❌ No authentication token provided'));
      }

      // Verify JWT token
      const decoded = jwt.verify(
        token.replace('Bearer ', ''),
        process.env.JWT_SECRET || 'your-secret-key'
      );

      socket.userId = decoded.id;
      socket.username = decoded.username;
      socket.email = decoded.email;

      next();
    } catch (error) {
      console.error('❌ WebSocket authentication failed:', error.message);
      next(new Error('❌ Authentication failed'));
    }
  });

  /**
   * Connection handler
   */
  io.on('connection', (socket) => {
    console.log(`
┌─────────────────────────────────────────┐
│ 👤 CLIENT CONNECTED                     │
├─────────────────────────────────────────┤
│ Socket ID: ${socket.id}
│ User ID: ${socket.userId}
│ Username: ${socket.username}
│ Email: ${socket.email}
└─────────────────────────────────────────┘
    `);

    // Track active connection
    activeConnections.set(socket.id, {
      userId: socket.userId,
      username: socket.username,
      email: socket.email,
      connectedAt: new Date(),
      lastActivity: new Date()
    });

    // Store connection in Redis for cross-server communication
    cacheSet(`socket:${socket.id}`, JSON.stringify({
      userId: socket.userId,
      username: socket.username,
      connectedAt: new Date().toISOString()
    }), 3600);

    // ====================================================================
    // ROOM MANAGEMENT
    // ====================================================================

    /**
     * Event: User joins their personal notification room
     */
    socket.on('join_user_room', (userId) => {
      const room = `user:${userId}`;
      socket.join(room);
      console.log(`✅ User ${socket.username} joined room: ${room}`);
      
      // Notify others in room
      io.to(room).emit('user_online', {
        userId: socket.userId,
        username: socket.username,
        timestamp: new Date().toISOString()
      });
    });

    /**
     * Event: User joins a vault room for real-time updates
     */
    socket.on('join_vault_room', (vaultId) => {
      const room = `vault:${vaultId}`;
      socket.join(room);
      console.log(`✅ User ${socket.username} joined vault room: ${room}`);
      
      io.to(room).emit('user_joined_vault', {
        userId: socket.userId,
        username: socket.username,
        vaultId: vaultId,
        timestamp: new Date().toISOString()
      });
    });

    /**
     * Event: User leaves a vault room
     */
    socket.on('leave_vault_room', (vaultId) => {
      const room = `vault:${vaultId}`;
      socket.leave(room);
      console.log(`⏹️  User ${socket.username} left vault room: ${room}`);
      
      io.to(room).emit('user_left_vault', {
        userId: socket.userId,
        username: socket.username,
        vaultId: vaultId,
        timestamp: new Date().toISOString()
      });
    });

    // ====================================================================
    // VAULT OPERATIONS
    // ====================================================================

    /**
     * Event: Vault data created
     * Broadcasts to all users in the vault room
     */
    socket.on('vault_created', (data) => {
      const room = `vault:${data.vaultId}`;
      console.log(`📝 Vault created event: ${data.vaultId}`);
      
      io.to(room).emit('vault_update', {
        event: 'created',
        vaultId: data.vaultId,
        title: data.title,
        category: data.category,
        userId: socket.userId,
        username: socket.username,
        timestamp: new Date().toISOString()
      });
    });

    /**
     * Event: Vault data updated
     */
    socket.on('vault_updated', (data) => {
      const room = `vault:${data.vaultId}`;
      console.log(`📝 Vault updated event: ${data.vaultId}`);
      
      io.to(room).emit('vault_update', {
        event: 'updated',
        vaultId: data.vaultId,
        title: data.title,
        userId: socket.userId,
        username: socket.username,
        timestamp: new Date().toISOString()
      });
    });

    /**
     * Event: Vault data deleted
     */
    socket.on('vault_deleted', (data) => {
      const room = `vault:${data.vaultId}`;
      console.log(`🗑️  Vault deleted event: ${data.vaultId}`);
      
      io.to(room).emit('vault_update', {
        event: 'deleted',
        vaultId: data.vaultId,
        userId: socket.userId,
        username: socket.username,
        timestamp: new Date().toISOString()
      });
    });

    /**
     * Event: Request full vault sync
     */
    socket.on('sync_vault', async (vaultId) => {
      try {
        const room = `vault:${vaultId}`;
        console.log(`🔄 Vault sync requested: ${vaultId}`);
        
        io.to(room).emit('vault_sync_response', {
          vaultId: vaultId,
          requestedBy: socket.username,
          timestamp: new Date().toISOString(),
          status: 'syncing'
        });
      } catch (error) {
        console.error('❌ Sync vault error:', error.message);
        socket.emit('error', {
          message: 'Sync failed',
          error: error.message
        });
      }
    });

    // ====================================================================
    // DISCLOSURE EVENTS
    // ====================================================================

    /**
     * Event: Disclosure created
     */
    socket.on('disclosure_created', (data) => {
      const room = `user:${socket.userId}`;
      console.log(`📋 Disclosure created by ${socket.username}`);
      
      io.to(room).emit('disclosure_notification', {
        event: 'created',
        disclosureId: data.disclosureId,
        recipientEmail: data.recipientEmail,
        fields: data.fields,
        timestamp: new Date().toISOString()
      });
    });

    /**
     * Event: Disclosure accessed
     */
    socket.on('disclosure_accessed', (data) => {
      const room = `user:${socket.userId}`;
      console.log(`👁️  Disclosure accessed: ${data.disclosureId}`);
      
      io.to(room).emit('disclosure_notification', {
        event: 'accessed',
        disclosureId: data.disclosureId,
        accessedAt: new Date().toISOString()
      });
    });

    /**
     * Event: Disclosure revoked
     */
    socket.on('disclosure_revoked', (data) => {
      const room = `user:${socket.userId}`;
      console.log(`🚫 Disclosure revoked: ${data.disclosureId}`);
      
      io.to(room).emit('disclosure_notification', {
        event: 'revoked',
        disclosureId: data.disclosureId,
        revokedAt: new Date().toISOString()
      });
    });

    // ====================================================================
    // ADMIN EVENTS
    // ====================================================================

    /**
     * Event: Admin broadcast notification
     */
    socket.on('admin_broadcast', (data) => {
      // Only admin can broadcast
      if (socket.userRole === 'admin') {
        console.log(`📢 Admin broadcast: ${data.message}`);
        io.emit('admin_notification', {
          message: data.message,
          type: data.type,
          sender: socket.username,
          timestamp: new Date().toISOString()
        });
      } else {
        socket.emit('error', {
          message: 'Unauthorized: Only admins can broadcast'
        });
      }
    });

    /**
     * Event: System status update
     */
    socket.on('system_status', async (data) => {
      try {
        console.log(`📊 System status requested`);
        
        const status = {
          activeConnections: activeConnections.size,
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
          memory: process.memoryUsage()
        };

        socket.emit('system_status_response', status);
      } catch (error) {
        console.error('❌ System status error:', error.message);
      }
    });

    // ====================================================================
    // ACTIVITY TRACKING
    // ====================================================================

    /**
     * Event: User activity (heartbeat)
     * Keeps connection alive and tracks activity
     */
    socket.on('activity', () => {
      const connection = activeConnections.get(socket.id);
      if (connection) {
        connection.lastActivity = new Date();
      }
    });

    /**
     * Event: Typing indicator
     */
    socket.on('typing', (data) => {
      const room = `vault:${data.vaultId}`;
      socket.to(room).emit('user_typing', {
        userId: socket.userId,
        username: socket.username,
        vaultId: data.vaultId
      });
    });

    /**
     * Event: Stop typing
     */
    socket.on('stop_typing', (data) => {
      const room = `vault:${data.vaultId}`;
      socket.to(room).emit('user_stop_typing', {
        userId: socket.userId,
        username: socket.username,
        vaultId: data.vaultId
      });
    });

    // ====================================================================
    // ERROR HANDLING
    // ====================================================================

    /**
     * Event: Error handler
     */
    socket.on('error', (error) => {
      console.error(`❌ Socket error for ${socket.id}:`, error);
    });

    /**
     * Event: Custom error event
     */
    socket.on('client_error', (data) => {
      console.error(`❌ Client error from ${socket.username}:`, data.message);
    });

    // ====================================================================
    // DISCONNECTION
    // ====================================================================

    /**
     * Event: User disconnects
     */
    socket.on('disconnect', async () => {
      console.log(`
┌─────────────────────────────────────────┐
│ 👤 CLIENT DISCONNECTED                  │
├─────────────────────────────────────────┤
│ Socket ID: ${socket.id}
│ User ID: ${socket.userId}
│ Username: ${socket.username}
└─────────────────────────────────────────┘
      `);

      // Remove from active connections
      activeConnections.delete(socket.id);

      // Remove from Redis
      await cacheDel(`socket:${socket.id}`);

      // Notify other users
      io.to(`user:${socket.userId}`).emit('user_offline', {
        userId: socket.userId,
        username: socket.username,
        timestamp: new Date().toISOString()
      });
    });
  });

  console.log('✅ WebSocket handlers initialized');
}

/**
 * Get active connections count
 * 
 * @returns {number}
 */
function getActiveConnectionsCount() {
  return activeConnections.size;
}

/**
 * Get all active connections
 * 
 * @returns {Array}
 */
function getActiveConnections() {
  return Array.from(activeConnections.values());
}

/**
 * Get connections for a specific user
 * 
 * @param {string} userId - User ID
 * @returns {Array}
 */
function getUserConnections(userId) {
  const userConnections = [];
  activeConnections.forEach((conn, socketId) => {
    if (conn.userId === userId) {
      userConnections.push({
        socketId,
        ...conn
      });
    }
  });
  return userConnections;
}

// Export functions
module.exports = {
  initializeWebSocket,
  getActiveConnectionsCount,
  getActiveConnections,
  getUserConnections
};
