require('express-async-errors');

console.log('🟢 Booting application...');

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
   BASIC CONFIG (NO EXTERNAL IMPORTS YET)
============================================================================ */
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'production';

const app = express();
const server = http.createServer(app);

/* ============================================================================
   SOCKET.IO
============================================================================ */
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  }
});

/* ============================================================================
   MIDDLEWARE
============================================================================ */
app.use(helmet({ crossOriginEmbedderPolicy: false }));
app.use(cors({ origin: '*', credentials: true }));
app.use(compression());
app.use(morgan(NODE_ENV === 'development' ? 'dev' : 'combined'));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* ============================================================================
   STATIC & VIEWS
============================================================================ */
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'src', 'views'));

/* ============================================================================
   HEALTH CHECK (RENDER NEEDS THIS)
============================================================================ */
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    uptime: process.uptime(),
    port: PORT,
    env: NODE_ENV
  });
});

/* ============================================================================
   SAFE SERVICE INITIALIZATION (LAZY LOAD)
============================================================================ */
async function initializeServices() {
  console.log('🔄 Initializing external services...');

  // MongoDB (lazy import)
  try {
    const { connectDB } = require('./src/config/db');
    await connectDB();
    console.log('✅ MongoDB connected');
  } catch (err) {
    console.error('⚠️ MongoDB skipped:', err.message);
  }

  // Redis (lazy import)
  try {
    const redis = require('./src/config/redis');
    if (redis?.initializeRedis) {
      await redis.initializeRedis();
      console.log('✅ Redis initialized');
    }
  } catch (err) {
    console.error('⚠️ Redis skipped:', err.message);
  }
}

/* ============================================================================
   ROUTES (SAFE IMPORTS)
============================================================================ */
try {
  app.use('/api/auth', require('./src/routes/auth'));
  app.use('/api/vault', require('./src/routes/vault'));
  app.use('/api/disclosure', require('./src/routes/disclosure'));
  app.use('/api/admin', require('./src/routes/admin'));
} catch (err) {
  console.error('⚠️ Route load failed:', err.message);
}

/* ============================================================================
   SOCKET EVENTS
============================================================================ */
io.on('connection', (socket) => {
  console.log(`👤 Socket connected: ${socket.id}`);
});

/* ============================================================================
   START SERVER (THIS MUST RUN)
============================================================================ */
(async function start() {
  try {
    await initializeServices();

    server.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Server LIVE on port ${PORT}`);
    });
  } catch (err) {
    console.error('❌ Fatal startup error:', err);
    process.exit(1);
  }
})();
