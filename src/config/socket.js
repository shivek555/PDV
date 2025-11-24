/**
 * SOCKET.IO CONFIGURATION
 * 
 * Real-time communication setup
 * Features:
 * - Real-time vault updates
 * - User notifications
 * - Presence tracking
 * - Event broadcasting
 */

const socketIO = require('socket.io');
const jwt = require('jsonwebtoken');
const { verifyToken } = require('../middleware/auth');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

/**
 * Initialize Socket.io
 * 
 * @param {Object} server - HTTP server instance
 * @returns {Object} Socket.io instance
 */
function initializeSocket(server) {
  const io = socketIO(server, {
    cors: {
      origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'],
      credentials: true
    },
    transports: ['websocket', 'polling'],
    pingInterval: 25000,
    pingTimeout: 5000,
    maxHttpBufferSize: 1e6 // 1MB
  });

  /**
   * Socket.io middleware for authentication
   */
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;

      if (!token) {
        return next(new Error('Authentication error'));
      }

      // Verify JWT token
      const decoded = verifyToken(token);

      if (!decoded) {
        return next(new Error('Invalid token'));
      }

      // Get user from database
      const user = await User.findById(decoded.id);

      if (!user || !user.active) {
        return next(new Error('User not found or inactive'));
      }

      // Attach user to socket
      socket.userId = user._id.toString();
      socket.username = user.username;
      socket.email = user.email;
      socket.role = user.role;

      console.log(`✓ Socket authenticated: ${socket.username} (${socket.id})`);
      next();
    } catch (error) {
      console.error('❌ Socket authentication error:', error.message);
      next(new Error('Authentication failed'));
    }
  });

  /**
   * Connection handler
   */
  io.on('connection', (socket) => {
    console.log(`👤 User connected: ${socket.username} (${socket.id})`);

    /**
     * Join user room
     * Allows sending messages to specific user
     */
    socket.on('join_user_room', (userId) => {
      try {
        if (userId !== socket.userId) {
          console.warn(`⚠️  Unauthorized room join attempt: ${socket.userId} -> ${userId}`);
          return;
        }

        socket.join(`user_${userId}`);
        console.log(`✓ User joined room: user_${userId}`);

        // Notify user is online
        io.emit('user_status', {
          userId: socket.userId,
          username: socket.username,
          status: 'online',
          timestamp: new Date()
        });
      } catch (error) {
        console.error('❌ Join user room error:', error.message);
        socket.emit('error', { message: 'Failed to join room' });
      }
    });

    /**
     * Join vault room
     * Allows sending vault updates to all collaborators
     */
    socket.on('join_vault_room', (vaultId) => {
      try {
        socket.join(`vault_${vaultId}`);
        console.log(`✓ User joined vault room: vault_${vaultId}`);

        // Notify collaborators
        io.to(`vault_${vaultId}`).emit('user_joined', {
          userId: socket.userId,
          username: socket.username,
          vaultId: vaultId,
          timestamp: new Date()
        });
      } catch (error) {
        console.error('❌ Join vault room error:', error.message);
      }
    });

    /**
     * Leave vault room
     */
    socket.on('leave_vault_room', (vaultId) => {
      try {
        socket.leave(`vault_${vaultId}`);
        console.log(`✓ User left vault room: vault_${vaultId}`);

        io.to(`vault_${vaultId}`).emit('user_left', {
          userId: socket.userId,
          username: socket.username,
          vaultId: vaultId,
          timestamp: new Date()
        });
      } catch (error) {
        console.error('❌ Leave vault room error:', error.message);
      }
    });

    /**
     * Vault update event
     * Broadcast when vault is modified
     */
    socket.on('vault_update', (data) => {
      try {
        const { vaultId, action, changes } = data;

        console.log(`📝 Vault update: ${vaultId} (${action})`);

        // Broadcast to all users in vault room
        io.to(`vault_${vaultId}`).emit('vault_update', {
          vaultId: vaultId,
          userId: socket.userId,
          username: socket.username,
          action: action, // created, updated, deleted, shared
          changes: changes,
          timestamp: new Date()
        });

        // Also notify vault owner
        io.to(`user_${vaultId}`).emit('vault_activity', {
          type: 'vault_update',
          vaultId: vaultId,
          action: action,
          by: socket.username
        });
      } catch (error) {
        console.error('❌ Vault update error:', error.message);
        socket.emit('error', { message: 'Failed to broadcast vault update' });
      }
    });

    /**
     * Real-time notification
     */
    socket.on('send_notification', (data) => {
      try {
        const { recipientId, type, message, data: notificationData } = data;

        console.log(`🔔 Sending notification to ${recipientId}`);

        io.to(`user_${recipientId}`).emit('notification', {
          type: type, // vault_shared, disclosure_created, etc.
          message: message,
          sender: socket.username,
          data: notificationData,
          timestamp: new Date()
        });

        socket.emit('notification_sent', { recipientId, success: true });
      } catch (error) {
        console.error('❌ Send notification error:', error.message);
        socket.emit('error', { message: 'Failed to send notification' });
      }
    });

    /**
     * Vault sharing event
     */
    socket.on('vault_shared', (data) => {
      try {
        const { vaultId, recipientId, accessLevel } = data;

        console.log(`🔗 Vault shared: ${vaultId} with ${recipientId} (${accessLevel})`);

        // Notify recipient
        io.to(`user_${recipientId}`).emit('vault_shared', {
          vaultId: vaultId,
          sharerName: socket.username,
          accessLevel: accessLevel,
          timestamp: new Date()
        });

        // Notify all collaborators
        io.to(`vault_${vaultId}`).emit('collaborator_added', {
          vaultId: vaultId,
          userId: recipientId,
          addedBy: socket.username
        });
      } catch (error) {
        console.error('❌ Vault shared error:', error.message);
      }
    });

    /**
     * Disclosure created event
     */
    socket.on('disclosure_created', (data) => {
      try {
        const { vaultId, recipientEmail, fields } = data;

        console.log(`📋 Disclosure created: ${vaultId} -> ${recipientEmail}`);

        io.to(`vault_${vaultId}`).emit('disclosure_created', {
          vaultId: vaultId,
          recipientEmail: recipientEmail,
          fields: fields,
          createdBy: socket.username,
          timestamp: new Date()
        });
      } catch (error) {
        console.error('❌ Disclosure created error:', error.message);
      }
    });

    /**
     * Typing indicator
     */
    socket.on('typing', (data) => {
      try {
        const { vaultId } = data;

        socket.to(`vault_${vaultId}`).emit('user_typing', {
          userId: socket.userId,
          username: socket.username,
          vaultId: vaultId
        });
      } catch (error) {
        console.error('❌ Typing indicator error:', error.message);
      }
    });

    /**
     * Stop typing
     */
    socket.on('stop_typing', (data) => {
      try {
        const { vaultId } = data;

        socket.to(`vault_${vaultId}`).emit('user_stop_typing', {
          userId: socket.userId,
          vaultId: vaultId
        });
      } catch (error) {
        console.error('❌ Stop typing error:', error.message);
      }
    });

    /**
     * Request presence
     * Get list of active users in vault
     */
    socket.on('get_presence', (vaultId) => {
      try {
        // Get all sockets in vault room
        const room = io.sockets.adapter.rooms.get(`vault_${vaultId}`);
        const presence = [];

        if (room) {
          room.forEach(socketId => {
            const userSocket = io.sockets.sockets.get(socketId);
            if (userSocket) {
              presence.push({
                userId: userSocket.userId,
                username: userSocket.username,
                socketId: socketId,
                joinedAt: new Date()
              });
            }
          });
        }

        socket.emit('presence', {
          vaultId: vaultId,
          users: presence,
          count: presence.length
        });
      } catch (error) {
        console.error('❌ Get presence error:', error.message);
      }
    });

    /**
     * Direct message
     */
    socket.on('direct_message', (data) => {
      try {
        const { recipientId, message } = data;

        console.log(`💬 DM from ${socket.username} to ${recipientId}`);

        io.to(`user_${recipientId}`).emit('direct_message', {
          senderId: socket.userId,
          senderName: socket.username,
          message: message,
          timestamp: new Date()
        });
      } catch (error) {
        console.error('❌ Direct message error:', error.message);
      }
    });

    /**
     * Error handling
     */
    socket.on('error', (error) => {
      console.error('❌ Socket error:', error);
    });

    /**
     * Disconnection handler
     */
    socket.on('disconnect', () => {
      console.log(`👋 User disconnected: ${socket.username} (${socket.id})`);

      // Broadcast user offline status
      io.emit('user_status', {
        userId: socket.userId,
        username: socket.username,
        status: 'offline',
        timestamp: new Date()
      });
    });
  });

  return io;
}

/**
 * Emit event to specific user
 * 
 * @param {Object} io - Socket.io instance
 * @param {string} userId - Target user ID
 * @param {string} event - Event name
 * @param {Object} data - Event data
 */
function emitToUser(io, userId, event, data) {
  io.to(`user_${userId}`).emit(event, data);
}

/**
 * Emit event to vault collaborators
 * 
 * @param {Object} io - Socket.io instance
 * @param {string} vaultId - Vault ID
 * @param {string} event - Event name
 * @param {Object} data - Event data
 */
function emitToVault(io, vaultId, event, data) {
  io.to(`vault_${vaultId}`).emit(event, data);
}

/**
 * Broadcast to all connected users
 * 
 * @param {Object} io - Socket.io instance
 * @param {string} event - Event name
 * @param {Object} data - Event data
 */
function broadcast(io, event, data) {
  io.emit(event, data);
}

/**
 * Get connected users count
 * 
 * @param {Object} io - Socket.io instance
 * @returns {number}
 */
function getConnectedUsersCount(io) {
  return io.engine.clientsCount;
}

/**
 * Get users in room
 * 
 * @param {Object} io - Socket.io instance
 * @param {string} room - Room name
 * @returns {Array}
 */
function getUsersInRoom(io, room) {
  const roomSockets = io.sockets.adapter.rooms.get(room);
  const users = [];

  if (roomSockets) {
    roomSockets.forEach(socketId => {
      const socket = io.sockets.sockets.get(socketId);
      if (socket) {
        users.push({
          userId: socket.userId,
          username: socket.username,
          socketId: socketId
        });
      }
    });
  }

  return users;
}

// Export functions
module.exports = {
  initializeSocket,
  emitToUser,
  emitToVault,
  broadcast,
  getConnectedUsersCount,
  getUsersInRoom
};
