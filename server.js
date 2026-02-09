/**
 * Privacy-First Personal Data Vault
 * Production-ready server (Render-safe)
 */

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

/* ============================================================================
   Config
============================================================================ */
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'production';

/* ============================================================================
   External Services
============================================================================ */
const { connectDB } = require('./src/config/db');
const { initializeRedis, getRedisClient } = require('./src/config/redis');

/* ============================================================================
   Middleware
============================================================================ */
const { authMiddleware } = require('./src/middleware/auth');
const { roleMiddleware } = require('./src/middleware/role');
const { globalErrorHandler } = require('./src/middleware/errorHandler');

/* ============================================================================
   Rate Limiters
============================================================================ */
const {
  globalRateLimiter,
  publicRateLimiter
} = require('./src/middleware/rateLimiter');

/* ============================================================================
   Routes
============================================================================ */
const authRoutes = require('./src/routes/auth');
const vaultRoutes = require('./src/routes/vault');
const disclosureRoutes = require('./src/routes/disclosure');
const adminRoutes = require('./src/routes/admin');

/* ============================================================================
   App & Server
============================================================================ */
const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: (process.env.CORS_ORIGIN || '*').split(','),
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    credentials: true
  },
  transports: ['websocket', 'polling']
});

/* ============================================================================
   Security
============================================================================ */
app.use(
  helmet({
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        "default-src": ["'self'"],
        "script-src": ["'self'"],
        "style-src": ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
        "img-src": ["'self'", "data:", "blob:"],
        "font-src": ["'self'", "data:", "https://cdn.jsdelivr.net"],
        "connect-src": ["'self'", "ws:", "wss:"],
        "object-src": ["'none'"]
      }
    }
  })
);

/* ============================================================================
   Core Middleware
============================================================================ */
app.use(cors({
  origin: (process.env.CORS_ORIGIN || '*').split(','),
  credentials: true
}));

app.use(compression());
app.use(morgan(NODE_ENV === 'development' ? 'dev' : 'combined'));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

/* ============================================================================
   Static & Views
============================================================================ */
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'src', 'views'));

/* ============================================================================
   Health Check (Render requires this)
============================================================================ */
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    environment: NODE_ENV
  });
});

/* ============================================================================
   Initialize Services (NON-FATAL)
============================================================================ */
async function initializeServices() {
  console.log('🔄 Initializing services...');

  try {
    await connectDB();
    console.log('✅ MongoDB connected');
  } catch (err) {
    console.error('⚠️ MongoDB connection failed:', err.message);
    console.error('➡️ Continuing without DB (Render-safe)');
  }

  try {
    await initializeRedis();
    console.log('✅ Redis initialized');
  } catch (err) {
    console.error('⚠️ Redis initialization failed:', err.message);
    console.error('➡️ Continuing without Redis');
  }
}

/* ============================================================================
   Routes
============================================================================ */
// Public
app.use('/api/auth', publicRateLimiter, authRoutes);

// Protected
app.use('/api/vault', authMiddleware, globalRateLimiter, vaultRoutes);
app.use('/api/disclosure', authMiddleware, globalRateLimiter, disclosureRoutes);
app.use('/api/admin', authMiddleware, roleMiddleware(['admin']), globalRateLimiter, adminRoutes);

/* ============================================================================
   Pages (EJS)
============================================================================ */
app.get('/', (req, res) => res.render('login', { title: 'Privacy Vault - Login' }));
app.get('/signup', (req, res) => res.render('signup', { title: 'Privacy Vault - Sign Up' }));
app.get('/login', (req, res) => res.render('login', { title: 'Privacy Vault - Login' }));

app.get('/dashboard', (req, res) => {
  res.render('dashboard', {
    title: 'Privacy Vault - Dashboard',
    user: { username: 'User', email: 'user@example.com' }
  });
});

app.get('/admin', (req, res) => {
  res.render('admin', {
    title: 'Privacy Vault - Admin',
    user: { username: 'Admin', email: 'admin@example.com' }
  });
});

/* ============================================================================
   Socket.IO
============================================================================ */
io.on('connection', (socket) => {
  console.log(`👤 Socket connected: ${socket.id}`);

  socket.on('join_user_room', (userId) => {
    socket.join(`user:${userId}`);
  });

  socket.on('disconnect', () => {
    console.log(`👤 Socket disconnected: ${socket.id}`);
  });
});

/* ============================================================================
   Errors
============================================================================ */
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

app.use(globalErrorHandler);

/* ============================================================================
   Start Server (IMPORTANT)
============================================================================ */
async function startServer() {
  await initializeServices();

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
  });
}

/* ============================================================================
   Graceful Shutdown
============================================================================ */
async function shutdown() {
  console.log('🛑 Shutting down...');
  server.close(async () => {
    const client = getRedisClient && getRedisClient();
    if (client && (client.isOpen || client.isReady)) {
      try { await client.quit(); } catch {}
    }
    process.exit(0);
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('❌ Unhandled Rejection:', reason);
});

startServer();

module.exports = { app, server, io };
