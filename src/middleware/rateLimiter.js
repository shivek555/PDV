/**
 * RATE LIMITING MIDDLEWARE (node-redis v4 compatible)
 *
 * - Uses Redis store when client is ready, else falls back to in-memory
 * - rate-limit-redis requires sendCommand adapter
 * - Sliding-window helpers use zAdd/zRange(BYSCORE)/zCount/zCard
 */

const rateLimit = require('express-rate-limit');
// Support both CJS and ESM exports
let RedisStore;
try {
  // Newer versions expose default
  RedisStore = require('rate-limit-redis').default || require('rate-limit-redis');
} catch {
  RedisStore = null;
}
const { getRedisClient } = require('../config/redis');

// Optional import (not used directly here)
// const { RateLimitError } = require('./errorHandler');

// Central limits
const RATE_LIMITS = {
  login: { windowMs: 15 * 60 * 1000, max: 5, message: 'Too many login attempts, please try again later' },
  signup: { windowMs: 60 * 60 * 1000, max: 3, message: 'Too many signup attempts, please try again later' },
  forgotPassword: { windowMs: 60 * 60 * 1000, max: 3, message: 'Too many password reset requests, please try again later' },
  api: { windowMs: 60 * 1000, max: 100, message: 'Too many API requests, please try again later' },
  createVault: { windowMs: 60 * 1000, max: 10, message: 'Too many vault creation requests' },
  deleteVault: { windowMs: 60 * 60 * 1000, max: 20, message: 'Too many deletion requests' },
  shareVault: { windowMs: 60 * 1000, max: 15, message: 'Too many sharing requests' },
  public: { windowMs: 60 * 1000, max: 30, message: 'Too many requests from this IP' }
};

function isClientReady(c) {
  return !!(c && (c.isReady || c.isOpen));
}

/**
 * Create a Redis-backed store if Redis is ready; otherwise undefined for in-memory fallback.
 * rate-limit-redis expects a sendCommand adapter for node-redis v4.
 */
function createRedisStore() {
  try {
    const client = getRedisClient();
    if (!RedisStore || !isClientReady(client)) {
      console.warn('⚠️ Redis not ready or store unavailable, using in-memory rate limiter');
      return undefined;
    }
    return new RedisStore({
      // Provide node-redis v4 adapter
      sendCommand: (...args) => client.sendCommand(args)
    });
  } catch (err) {
    console.error('❌ Failed to create Redis store for rate limiting:', err.message);
    return undefined;
  }
}

/**
 * Factory to create a limiter with optional custom key generator.
 */
function createRateLimiter(config, keyGenerator = null) {
  const store = createRedisStore();

  return rateLimit({
    store, // undefined => in-memory
    windowMs: config.windowMs,
    max: config.max,
    message: config.message,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
      if (req.user && req.user.role === 'admin') {
        // Skip admins
        return true;
      }
      return false;
    },
    keyGenerator: keyGenerator || (req => req.ip),
    handler: (req, res) => {
      res.status(429).json({
        success: false,
        message: config.message,
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter: Math.ceil(config.windowMs / 1000)
      });
    }
  });
}

// Pre-built limiters
const globalRateLimiter = createRateLimiter(RATE_LIMITS.api);
const loginRateLimiter = createRateLimiter(RATE_LIMITS.login);
const signupRateLimiter = createRateLimiter(RATE_LIMITS.signup);
const forgotPasswordRateLimiter = createRateLimiter(RATE_LIMITS.forgotPassword);

const createVaultRateLimiter = createRateLimiter(
  RATE_LIMITS.createVault,
  req => `create_vault:${req.user?.id || req.ip}`
);

const deleteVaultRateLimiter = createRateLimiter(
  RATE_LIMITS.deleteVault,
  req => `delete_vault:${req.user?.id || req.ip}`
);

const shareVaultRateLimiter = createRateLimiter(
  RATE_LIMITS.shareVault,
  req => `share_vault:${req.user?.id || req.ip}`
);

const publicRateLimiter = createRateLimiter(RATE_LIMITS.public);

/**
 * Sliding window helpers (node-redis v4 API)
 */
async function checkRateLimit(identifier, max, windowMs) {
  try {
    const client = getRedisClient();
    if (!isClientReady(client)) {
      // Fail open when Redis is not ready
      return { allowed: true, error: 'redis_not_ready' };
    }

    const key = `rate_limit:${identifier}`;
    const now = Date.now();
    const windowStart = now - windowMs;

    // Remove old entries (optional cleanup)
    // await client.zRemRangeByScore(key, 0, windowStart);

    // Count requests in window
    // Prefer ZRANGE BYSCORE in Redis >= 6.2 (node-redis v4: zRange with { BYSCORE: { min, max } })
    const hits = await client.zRange(key, windowStart, now, { BYSCORE: true });
    const requestCount = hits.length;
    const isLimited = requestCount >= max;

    if (!isLimited) {
      // Add this hit with score=now, member=now
      await client.zAdd(key, [{ score: now, value: String(now) }]);
      await client.expire(key, Math.ceil(windowMs / 1000));
    }

    return {
      allowed: !isLimited,
      current: requestCount,
      limit: max,
      remaining: Math.max(0, max - requestCount),
      resetAt: new Date(windowStart + windowMs),
      retryAfter: isLimited ? Math.ceil((windowStart + windowMs - now) / 1000) : 0
    };
  } catch (err) {
    console.error('❌ Rate limit check error:', err.message);
    return { allowed: true, error: true };
  }
}

async function resetRateLimit(identifier) {
  try {
    const client = getRedisClient();
    if (!isClientReady(client)) return 0;
    const key = `rate_limit:${identifier}`;
    return await client.del(key);
  } catch (err) {
    console.error('❌ Rate limit reset error:', err.message);
    return 0;
  }
}

async function getRateLimitStatus(identifier, max, windowMs) {
  try {
    const client = getRedisClient();
    if (!isClientReady(client)) {
      return {
        identifier,
        current: 0,
        limit: max,
        remaining: max,
        resetAt: new Date(Date.now() + windowMs),
        isLimited: false
      };
    }

    const key = `rate_limit:${identifier}`;
    const now = Date.now();
    const windowStart = now - windowMs;

    const count = await client.zCount(key, windowStart, now);
    return {
      identifier,
      current: count,
      limit: max,
      remaining: Math.max(0, max - count),
      resetAt: new Date(now + windowMs),
      isLimited: count >= max
    };
  } catch (err) {
    console.error('❌ Get rate limit status error:', err.message);
    return null;
  }
}

async function checkBurstRateLimit(identifier, burstMax, sustainedRate) {
  try {
    const client = getRedisClient();
    if (!isClientReady(client)) {
      return { allowed: true, error: 'redis_not_ready' };
    }

    const key = `burst_limit:${identifier}`;
    const now = Date.now();
    const secondAgo = now - 1000;

    const recent = await client.zCount(key, secondAgo, now);
    if (recent >= sustainedRate) {
      const total = await client.zCard(key);
      if (total >= burstMax) {
        return {
          allowed: false,
          current: total,
          burstLimit: burstMax,
          sustainedRate,
          message: 'Burst rate limit exceeded'
        };
      }
    }

    await client.zAdd(key, [{ score: now, value: String(now) }]);
    await client.expire(key, 60);

    const total = await client.zCard(key);
    return {
      allowed: true,
      current: total,
      burstLimit: burstMax,
      sustainedRate,
      remaining: Math.max(0, burstMax - total)
    };
  } catch (err) {
    console.error('❌ Burst rate limit check error:', err.message);
    return { allowed: true, error: true };
  }
}

function tieredRateLimiter(tier = 'free') {
  const tierLimits = {
    free: { windowMs: 60 * 1000, max: 100 },
    pro: { windowMs: 60 * 1000, max: 1000 },
    enterprise: { windowMs: 60 * 1000, max: 10000 }
  };
  const config = tierLimits[tier] || tierLimits.free;

  return createRateLimiter(
    { ...config, message: `Rate limit exceeded for ${tier} tier` },
    req => `tiered:${tier}:${req.user?.id || req.ip}`
  );
}

function distributedRateLimiter(config = {}) {
  return createRateLimiter({
    windowMs: config.windowMs || 60 * 1000,
    max: config.max || 100,
    message: config.message || 'Too many requests'
  });
}

function getRateLimitConfig() {
  return { limits: RATE_LIMITS, timestamp: new Date().toISOString() };
}

module.exports = {
  globalRateLimiter,
  loginRateLimiter,
  signupRateLimiter,
  forgotPasswordRateLimiter,
  createVaultRateLimiter,
  deleteVaultRateLimiter,
  shareVaultRateLimiter,
  publicRateLimiter,
  createRateLimiter,
  checkRateLimit,
  resetRateLimit,
  getRateLimitStatus,
  checkBurstRateLimit,
  tieredRateLimiter,
  distributedRateLimiter,
  getRateLimitConfig,
  RATE_LIMITS
};
