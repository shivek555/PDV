require('express-async-errors');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const dotenv = require('dotenv');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const morgan = require('morgan');
const path = require('path');

dotenv.config();

// Configs
const { connectDB } = require('./src/config/db');
const { initializeRedis, getRedisClient } = require('./src/config/redis');

// Middleware
const { authMiddleware } = require('./src/middleware/auth');
const { roleMiddleware } = require('./src/middleware/role');
const { globalErrorHandler } = require('./src/middleware/errorHandler');

// Rate limiters
const {
  globalRateLimiter,
  publicRateLimiter,
  loginRateLimiter,
  signupRateLimiter,
  forgotPasswordRateLimiter,
  createVaultRateLimiter,
  deleteVaultRateLimiter,
  shareVaultRateLimiter
} = require('./src/middleware/rateLimiter');

// Routes
const authRoutes = require('./src/routes/auth');
const vaultRoutes = require('./src/routes/vault');
const disclosureRoutes = require('./src/routes/disclosure');
const adminRoutes = require('./src/routes/admin');

const app = express();
const PORT = process.env.PORT || 5000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// HTTP server + Socket.IO
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: (process.env.CORS_ORIGIN || 'http://localhost:5000').split(','),
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    credentials: true
  },
  transports: ['websocket', 'polling']
});

// ============================================================================
// Security: Helmet with strict CSP
// ============================================================================
app.use(
  helmet({
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        "default-src": ["'self'"],
        "base-uri": ["'self'"],
        "frame-ancestors": ["'none'"],
        "script-src": ["'self'"],
        "script-src-attr": ["'none'"],
        "style-src": ["'self'", "'unsafe-inline'"], 
        "img-src": ["'self'", "data:", "blob:"],
        "font-src": ["'self'", "data:"],
        "connect-src": ["'self'", "ws:", "wss:"],
        "object-src": ["'none'"]
      }
    }
  })
);


// CORS
app.use(cors({
  origin: (process.env.CORS_ORIGIN || 'http://localhost:5000').split(','),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Compression / logging
app.use(compression());
app.use(morgan(NODE_ENV === 'development' ? 'dev' : 'combined'));

// Body parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// ============================================================================
// Static files: mount at / and /public
// ============================================================================
app.use(express.static(path.join(__dirname, 'public')));
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use('/favicon.ico', express.static(path.join(__dirname, 'public', 'favicon.ico')));

// Views
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'src', 'views'));

// ============================================================================
// Self-test endpoint
// ============================================================================
app.get('/_static-test', (req, res) => {
  res.type('text/plain').send('Static files working! /js/app.js and /public/js/app.js');
});

// Init services
async function initializeServices() {
  try {
    console.log('🔄 Initializing services...');
    console.log('📦 Connecting to MongoDB...');
    await connectDB();
    console.log('✅ MongoDB connected');

    console.log('🔴 Initializing Redis...');
    await initializeRedis();
    console.log('✅ Redis initialized');
  } catch (err) {
    console.error('❌ Service initialization failed:', err.message);
    process.exit(1);
  }
}

// ============================================================================
// Routes
// ============================================================================
// Public auth APIs
app.use('/api/auth', publicRateLimiter, authRoutes);

// Verify email page
app.get('/verify/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const client = getRedisClient();
    const ready = client && (client.isReady || client.isOpen);

    let userId = null;
    if (ready) {
      userId = await client.get(`verify_token:${token}`);
    }

    if (!userId) {
      return res.status(400).render('verify', {
        message: '❌ Invalid or expired verification token',
        verified: false
      });
    }

    const User = require('./src/models/User');
    await User.findByIdAndUpdate(userId, { verified: true });

    if (ready) {
      await client.del(`verify_token:${token}`);
    }

    res.render('verify', {
      message: '✅ Email verified successfully! You can now login.',
      verified: true
    });
  } catch (error) {
    console.error('Email verification error:', error);
    res.status(500).render('verify', {
      message: '❌ Verification failed',
      verified: false
    });
  }
});

// Protected APIs
app.use('/api/vault', authMiddleware, globalRateLimiter, vaultRoutes);
app.use('/api/disclosure', authMiddleware, globalRateLimiter, disclosureRoutes);
app.use('/api/admin', authMiddleware, roleMiddleware(['admin']), globalRateLimiter, adminRoutes);

// ============================================================================
// EJS pages (NO authMiddleware - client-side will handle auth)
// ============================================================================
app.get('/', (req, res) => {
  res.render('login', { title: 'Privacy Vault - Login' });
});

app.get('/signup', (req, res) => {
  res.render('signup', { title: 'Privacy Vault - Sign Up' });
});

app.get('/login', (req, res) => {
  res.render('login', { title: 'Privacy Vault - Login' });
});

// ✅ FIX: Removed authMiddleware - page loads, client JS fetches user
app.get('/dashboard', (req, res) => {
  res.render('dashboard', { 
    title: 'Privacy Vault - Dashboard',
    user: {
      username: 'User',
      email: 'user@example.com',
      id: 'temp-id'
    }
  });
});

// ✅ FIX: Removed authMiddleware from admin too
app.get('/admin', (req, res) => {
  res.render('admin', { 
    title: 'Privacy Vault - Admin Panel',
    user: {
      username: 'Admin',
      email: 'admin@example.com',
      id: 'temp-id'
    }
  });
});

// Public disclosure page
app.get('/share/:token', async (req, res) => {
  try {
    const client = getRedisClient();
    const ready = client && (client.isReady || client.isOpen);

    let disclosureData = null;
    if (ready) {
      disclosureData = await client.get(`disclosure:${req.params.token}`);
    }

    if (!disclosureData) {
      return res.status(404).render('share', {
        title: 'Disclosure Not Found',
        disclosure: null,
        error: 'Invalid or expired disclosure token',
        token: req.params.token
      });
    }

    res.render('share', {
      title: 'Privacy Vault - Selective Disclosure',
      disclosure: JSON.parse(disclosureData),
      token: req.params.token,
      error: null
    });
  } catch (error) {
    res.status(500).render('share', {
      title: 'Error',
      disclosure: null,
      error: 'Error retrieving disclosure data',
      token: req.params.token
    });
  }
});

// Health
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: NODE_ENV
  });
});

// Socket.IO
io.on('connection', (socket) => {
  console.log(`👤 Client connected: ${socket.id}`);

  socket.on('join_user_room', (userId) => {
    socket.join(`user:${userId}`);
    console.log(`✅ User ${userId} joined their notification room`);
  });

  socket.on('vault_updated', (data) => {
    io.to(`user:${data.userId}`).emit('vault_sync', {
      event: 'update',
      timestamp: new Date().toISOString(),
      data
    });
  });

  socket.on('disclosure_created', (data) => {
    io.to(`user:${data.userId}`).emit('disclosure_notification', {
      event: 'disclosure_created',
      timestamp: new Date().toISOString(),
      data
    });
  });

  socket.on('disconnect', () => {
    console.log(`👤 Client disconnected: ${socket.id}`);
  });

  socket.on('error', (error) => {
    console.error(`❌ Socket error for ${socket.id}:`, error);
  });
});

// 404
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
    path: req.originalUrl
  });
});

// Global error handler
app.use(globalErrorHandler);

// Start
async function startServer() {
  try {
    await initializeServices();
    server.listen(PORT, () => {
      console.log(`🚀 Server running at http://localhost:${PORT}`);
      console.log(`📡 Socket.IO client at /socket.io/socket.io.js`);
      console.log(`📁 Static files at /js/* and /public/js/*`);
      console.log(`🧪 Test static: http://localhost:${PORT}/_static-test`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
async function shutdown() {
  try {
    server.close(async () => {
      console.log('✅ Server closed');
      const client = getRedisClient && getRedisClient();
      if (client && (client.isOpen || client.isReady)) {
        try { await client.quit(); } catch {}
        console.log('✅ Redis client disconnected');
      }
      process.exit(0);
    });
  } catch {
    process.exit(1);
  }
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
process.on('uncaughtException', (err) => { console.error('❌ Uncaught Exception:', err); process.exit(1); });
process.on('unhandledRejection', (reason, p) => { console.error('❌ Unhandled Rejection:', reason, p); process.exit(1); });

startServer();

module.exports = { app, server, io };
