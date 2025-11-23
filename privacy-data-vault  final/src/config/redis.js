/**
 * REDIS CONFIGURATION MODULE
 *
 * Single shared node-redis v4 client with safe readiness checks,
 * pub/sub duplicates, and guarded cache helpers (no hard throws).
 */

const { createClient } = require('redis');
const dotenv = require('dotenv');

dotenv.config();

const REDIS_URL = process.env.REDIS_URL || null;
const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = Number(process.env.REDIS_PORT || 6379);
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || null;
const REDIS_DB = Number(process.env.REDIS_DB || 0);
const REDIS_TLS = String(process.env.REDIS_TLS || 'false') === 'true';

let redisClient = null;
let redisPubClient = null;
let redisSubClient = null;

/**
 * Build a connection URL if REDIS_URL is not provided
 */
function buildUrlFromEnv() {
  if (REDIS_URL) return REDIS_URL;

  // redis[s]://[:password@]host:port[/db]
  const auth = REDIS_PASSWORD ? `:${encodeURIComponent(REDIS_PASSWORD)}@` : '';
  const proto = REDIS_TLS ? 'rediss' : 'redis';
  const dbSeg = Number.isFinite(REDIS_DB) && REDIS_DB > 0 ? `/${REDIS_DB}` : '';
  return `${proto}://${auth}${REDIS_HOST}:${REDIS_PORT}${dbSeg}`;
}

/**
 * Initialize Redis client once (idempotent)
 */
async function initializeRedis() {
  try {
    if (redisClient && (redisClient.isOpen || redisClient.isReady)) {
      return redisClient;
    }

    const url = buildUrlFromEnv();
    console.log('🔗 Attempting Redis connection...');
    console.log(`📍 Redis URL: ${url.replace(/:[^@]*@/, ':****@')}`);

    // Main client
    redisClient = createClient({ url });

    setupClientHandlers(redisClient, 'main');

    await redisClient.connect();
    console.log('✅ Redis main client connected');

    // Pub/Sub clients
    if (!redisPubClient) {
      redisPubClient = redisClient.duplicate();
      setupClientHandlers(redisPubClient, 'pub');
      await redisPubClient.connect();
      console.log('✅ Redis pub client connected');
    }

    if (!redisSubClient) {
      redisSubClient = createClient({ url });
      setupClientHandlers(redisSubClient, 'sub');
      await redisSubClient.connect();
      console.log('✅ Redis sub client connected');
    }

    // Optional: quick info probe
    try {
      const info = await redisClient.info('server');
      const versionLine = info.split('\r\n').find(l => l.includes('redis_version')) || 'redis_version:unknown';
      console.log(`   ${versionLine}`);
    } catch {
      // Non-fatal if INFO is restricted
    }

    return redisClient;
  } catch (error) {
    console.error('❌ Redis connection failed:', error.message);
    // Do not throw here; allow callers to detect absence and fail open
    return null;
  }
}

/**
 * Event handlers
 */
function setupClientHandlers(client, name = 'default') {
  client.on('connect', () => console.log(`✅ Redis ${name} client connected`));
  client.on('ready', () => console.log(`🟢 Redis ${name} client ready`));
  client.on('error', (err) => console.error(`❌ Redis ${name} client error:`, err.message));
  client.on('reconnecting', () => console.warn(`🔄 Redis ${name} client reconnecting...`));
  client.on('end', () => console.log(`⏹️  Redis ${name} client ended`));
}

/**
 * Getters: return the instance or null (no throws).
 * Callers should check client && (client.isReady || client.isOpen).
 */
function getRedisClient() {
  return redisClient;
}

function getRedisPubClient() {
  return redisPubClient;
}

function getRedisSubClient() {
  return redisSubClient;
}

/**
 * Guard helpers for readiness
 */
function isClientReady(c) {
  return !!(c && (c.isReady || c.isOpen));
}

/**
 * Cache helpers
 */
async function cacheGet(key) {
  try {
    const client = getRedisClient();
    if (!isClientReady(client)) return null;
    const value = await client.get(key);
    if (value) console.log(`✓ Cache HIT: ${key}`);
    else console.log(`✗ Cache MISS: ${key}`);
    return value;
  } catch (err) {
    console.error(`❌ Cache GET error for ${key}:`, err.message);
    return null;
  }
}

async function cacheSet(key, value, ttl = null) {
  try {
    const client = getRedisClient();
    if (!isClientReady(client)) return false;
    if (ttl && Number.isFinite(ttl)) {
      await client.setEx(key, ttl, value);
      console.log(`✓ Cache SET: ${key} (TTL: ${ttl}s)`);
    } else {
      await client.set(key, value);
      console.log(`✓ Cache SET: ${key} (No expiry)`);
    }
    return true;
  } catch (err) {
    console.error(`❌ Cache SET error for ${key}:`, err.message);
    return false;
  }
}

async function cacheDel(keys) {
  try {
    const client = getRedisClient();
    if (!isClientReady(client)) return 0;
    const keyArray = Array.isArray(keys) ? keys : [keys];
    const deleted = await client.del(keyArray);
    console.log(`✓ Cache DEL: ${deleted} key(s) deleted`);
    return deleted;
  } catch (err) {
    console.error('❌ Cache DEL error:', err.message);
    return 0;
  }
}

async function cacheExists(key) {
  try {
    const client = getRedisClient();
    if (!isClientReady(client)) return false;
    const exists = await client.exists(key);
    return exists === 1;
  } catch (err) {
    console.error(`❌ Cache EXISTS error for ${key}:`, err.message);
    return false;
  }
}

async function cacheExpire(key, seconds) {
  try {
    const client = getRedisClient();
    if (!isClientReady(client)) return false;
    const result = await client.expire(key, seconds);
    return result === 1;
  } catch (err) {
    console.error(`❌ Cache EXPIRE error for ${key}:`, err.message);
    return false;
  }
}

async function cacheTTL(key) {
  try {
    const client = getRedisClient();
    if (!isClientReady(client)) return -2;
    return await client.ttl(key);
  } catch (err) {
    console.error(`❌ Cache TTL error for ${key}:`, err.message);
    return -2;
  }
}

async function cacheIncrement(key, increment = 1) {
  try {
    const client = getRedisClient();
    if (!isClientReady(client)) return 0;
    return await client.incrBy(key, increment);
  } catch (err) {
    console.error(`❌ Cache INCR error for ${key}:`, err.message);
    return 0;
  }
}

/**
 * Pub/Sub
 */
async function publish(channel, message) {
  try {
    const pub = getRedisPubClient();
    if (!isClientReady(pub)) return 0;
    const n = await pub.publish(channel, message);
    console.log(`📢 Published to ${channel}: ${n} subscribers`);
    return n;
  } catch (err) {
    console.error(`❌ Publish error on ${channel}:`, err.message);
    return 0;
  }
}

async function subscribe(channel, callback) {
  try {
    const sub = getRedisSubClient();
    if (!isClientReady(sub)) return;
    await sub.subscribe(channel, (message) => {
      console.log(`📨 Message received on ${channel}:`, message);
      try { callback(message); } catch (e) { console.error('Subscriber cb error:', e.message); }
    });
    console.log(`✅ Subscribed to channel: ${channel}`);
  } catch (err) {
    console.error(`❌ Subscribe error on ${channel}:`, err.message);
  }
}

/**
 * Introspection
 */
async function getRedisInfo() {
  try {
    const client = getRedisClient();
    if (!isClientReady(client)) {
      return { connected: false, error: 'client not ready', timestamp: new Date().toISOString() };
    }
    const info = await client.info();
    return { connected: true, info, timestamp: new Date().toISOString() };
  } catch (err) {
    return { connected: false, error: err.message, timestamp: new Date().toISOString() };
  }
}

async function getMemoryStats() {
  try {
    const client = getRedisClient();
    if (!isClientReady(client)) return null;
    const info = await client.info('memory');
    const lines = info.split('\r\n');
    const stats = {};
    lines.forEach(line => {
      const [k, v] = line.split(':');
      if (k && v) stats[k] = isNaN(v) ? v : parseInt(v, 10);
    });
    return stats;
  } catch (err) {
    console.error('❌ Error getting memory stats:', err.message);
    return null;
  }
}

/**
 * Maintenance
 */
async function flushCache() {
  try {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('❌ Cannot flush cache in production');
    }
    const client = getRedisClient();
    if (!isClientReady(client)) return;
    await client.flushDb();
    console.log('⚠️  Redis cache flushed');
  } catch (err) {
    console.error('❌ Error flushing cache:', err.message);
    throw err;
  }
}

async function disconnectRedis() {
  try {
    if (redisClient && redisClient.isOpen) {
      await redisClient.quit();
      console.log('✅ Redis client disconnected');
    }
    if (redisPubClient && redisPubClient.isOpen) {
      await redisPubClient.quit();
      console.log('✅ Redis pub client disconnected');
    }
    if (redisSubClient && redisSubClient.isOpen) {
      await redisSubClient.quit();
      console.log('✅ Redis sub client disconnected');
    }
  } catch (err) {
    console.error('❌ Error disconnecting Redis:', err.message);
  }
}

module.exports = {
  initializeRedis,
  getRedisClient,
  getRedisPubClient,
  getRedisSubClient,
  cacheGet,
  cacheSet,
  cacheDel,
  cacheExists,
  cacheExpire,
  cacheTTL,
  cacheIncrement,
  publish,
  subscribe,
  getRedisInfo,
  getMemoryStats,
  flushCache,
  disconnectRedis
};
