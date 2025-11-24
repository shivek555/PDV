/**
 * CACHING MIDDLEWARE
 * 
 * Implements HTTP caching and Redis-based response caching
 * Features:
 * - Response caching
 * - Cache invalidation
 * - Cache key generation
 * - TTL management
 * - Conditional requests (ETag, Last-Modified)
 */

const { 
  cacheGet, 
  cacheSet, 
  cacheDel,
  cacheExists
} = require('../config/redis');
const crypto = require('crypto');

/**
 * Generate cache key from request
 * 
 * @param {Object} req - Express request
 * @returns {string} Cache key
 */
function generateCacheKey(req) {
  const userId = req.user?.id || 'anonymous';
  const path = req.path;
  const query = JSON.stringify(req.query);
  
  const key = `${userId}:${path}:${query}`;
  return crypto.createHash('md5').update(key).digest('hex');
}

/**
 * Cache GET response middleware
 * Caches successful GET responses
 * 
 * @param {number} ttl - Time to live in seconds
 * @returns {Function} Middleware
 */
function cacheGetResponse(ttl = 300) {
  return async (req, res, next) => {
    // Only cache GET requests
    if (req.method !== 'GET') {
      return next();
    }

    // Skip cache for certain URLs
    const skipPaths = ['/api/auth/logout', '/api/admin'];
    if (skipPaths.some(path => req.path.includes(path))) {
      return next();
    }

    try {
      const cacheKey = generateCacheKey(req);

      // Try to get from cache
      const cachedData = await cacheGet(cacheKey);

      if (cachedData) {
        console.log(`✓ Cache HIT: ${req.path}`);
        const data = JSON.parse(cachedData);
        
        return res.status(200).json({
          ...data,
          _cached: true,
          _cacheKey: cacheKey
        });
      }

      // Override res.json to cache response
      const originalJson = res.json.bind(res);
      res.json = function(data) {
        // Only cache successful responses
        if (res.statusCode >= 200 && res.statusCode < 300) {
          cacheSet(cacheKey, JSON.stringify(data), ttl).catch(err => {
            console.error('Cache set error:', err.message);
          });
        }

        return originalJson(data);
      };

      next();
    } catch (error) {
      console.error('❌ Cache middleware error:', error.message);
      next();
    }
  };
}

/**
 * Cache vault data
 * Specific middleware for vault endpoints
 * 
 * @param {number} ttl - Time to live in seconds
 * @returns {Function} Middleware
 */
function cacheVaultData(ttl = 600) {
  return async (req, res, next) => {
    if (req.method !== 'GET') {
      return next();
    }

    try {
      const vaultId = req.params.vaultId || req.params.id;
      if (!vaultId) {
        return next();
      }

      const userId = req.user?.id;
      const cacheKey = `vault:${userId}:${vaultId}`;

      // Try to get from cache
      const cachedData = await cacheGet(cacheKey);

      if (cachedData) {
        console.log(`✓ Vault cache HIT: ${vaultId}`);
        const data = JSON.parse(cachedData);
        
        return res.status(200).json({
          success: true,
          data,
          _cached: true
        });
      }

      // Cache response
      const originalJson = res.json.bind(res);
      res.json = function(data) {
        if (res.statusCode === 200 && data.success && data.data) {
          cacheSet(cacheKey, JSON.stringify(data.data), ttl).catch(err => {
            console.error('Cache set error:', err.message);
          });
        }

        return originalJson(data);
      };

      next();
    } catch (error) {
      console.error('❌ Vault cache middleware error:', error.message);
      next();
    }
  };
}

/**
 * Invalidate cache on mutation
 * Clears relevant cache keys when data is modified
 * 
 * @returns {Function} Middleware
 */
function invalidateOnMutation() {
  return async (req, res, next) => {
    // Only process non-GET requests
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      const userId = req.user?.id;
      
      try {
        // Invalidate user's vault list cache
        await cacheDel(`user_vaults:${userId}`);

        // Invalidate specific vault cache if applicable
        const vaultId = req.params.vaultId || req.params.id;
        if (vaultId) {
          await cacheDel(`vault:${userId}:${vaultId}`);
        }

        console.log(`✓ Cache invalidated for user: ${userId}`);
      } catch (error) {
        console.error('❌ Cache invalidation error:', error.message);
      }
    }

    next();
  };
}

/**
 * ETag middleware
 * Generates and validates ETags for responses
 * 
 * @returns {Function} Middleware
 */
function etagMiddleware() {
  return (req, res, next) => {
    const originalJson = res.json.bind(res);

    res.json = function(data) {
      // Generate ETag
      const etagValue = crypto
        .createHash('md5')
        .update(JSON.stringify(data))
        .digest('hex');

      // Set ETag header
      res.set('ETag', `"${etagValue}"`);

      // Check If-None-Match header
      const clientETag = req.get('If-None-Match');
      
      if (clientETag === `"${etagValue}"`) {
        console.log(`✓ ETag match for ${req.path}`);
        return res.status(304).end();
      }

      return originalJson(data);
    };

    next();
  };
}

/**
 * Last-Modified middleware
 * Tracks and validates Last-Modified headers
 * 
 * @returns {Function} Middleware
 */
function lastModifiedMiddleware() {
  return (req, res, next) => {
    const originalJson = res.json.bind(res);
    const requestTime = new Date(req.get('If-Modified-Since'));

    res.json = function(data) {
      const lastModified = new Date();
      res.set('Last-Modified', lastModified.toUTCString());

      // Check If-Modified-Since header
      if (
        !isNaN(requestTime.getTime()) &&
        lastModified.getTime() <= requestTime.getTime()
      ) {
        console.log(`✓ Not modified since ${requestTime}`);
        return res.status(304).end();
      }

      return originalJson(data);
    };

    next();
  };
}

/**
 * Cache control header middleware
 * Sets appropriate Cache-Control headers
 * 
 * @param {Object} options - Cache control options
 * @returns {Function} Middleware
 */
function cacheControlMiddleware(options = {}) {
  const defaults = {
    maxAge: 300,
    public: false,
    private: true,
    noCache: false,
    noStore: false,
    mustRevalidate: false
  };

  const config = { ...defaults, ...options };

  return (req, res, next) => {
    let cacheControlValue = [];

    if (config.noStore) cacheControlValue.push('no-store');
    if (config.noCache) cacheControlValue.push('no-cache');
    if (config.private) cacheControlValue.push('private');
    if (config.public) cacheControlValue.push('public');
    if (config.maxAge) cacheControlValue.push(`max-age=${config.maxAge}`);
    if (config.mustRevalidate) cacheControlValue.push('must-revalidate');

    res.set('Cache-Control', cacheControlValue.join(', '));
    next();
  };
}

/**
 * Vary header middleware
 * Indicates what request headers affect the response
 * 
 * @param {Array} headers - Header names to vary on
 * @returns {Function} Middleware
 */
function varyMiddleware(headers = ['Accept', 'Accept-Encoding', 'Authorization']) {
  return (req, res, next) => {
    res.set('Vary', headers.join(', '));
    next();
  };
}

/**
 * Smart cache middleware
 * Automatically determines caching strategy based on response
 * 
 * @returns {Function} Middleware
 */
function smartCacheMiddleware() {
  return async (req, res, next) => {
    if (req.method !== 'GET') {
      return next();
    }

    try {
      const cacheKey = generateCacheKey(req);

      // Try cache
      const cachedData = await cacheGet(cacheKey);
      if (cachedData) {
        console.log(`✓ Smart cache HIT: ${req.path}`);
        return res.status(200).json(JSON.parse(cachedData));
      }

      // Determine TTL based on path
      let ttl = 300; // Default 5 minutes
      
      if (req.path.includes('/vault')) ttl = 600; // 10 minutes for vaults
      if (req.path.includes('/user')) ttl = 1800; // 30 minutes for user data
      if (req.path.includes('/disclosure')) ttl = 3600; // 1 hour for disclosures

      // Cache response
      const originalJson = res.json.bind(res);
      res.json = function(data) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          cacheSet(cacheKey, JSON.stringify(data), ttl).catch(err => {
            console.error('Smart cache error:', err.message);
          });
        }

        return originalJson(data);
      };

      next();
    } catch (error) {
      console.error('❌ Smart cache error:', error.message);
      next();
    }
  };
}

/**
 * Clear cache for user
 * Invalidates all cache for a specific user
 * 
 * @param {string} userId - User ID
 * @returns {Promise<number>}
 */
async function clearUserCache(userId) {
  try {
    // This is a simplified version
    // In production, you might want to use Redis SCAN with patterns
    const patterns = [
      `user_vaults:${userId}`,
      `vault:${userId}:*`,
      `vault_access:${userId}:*`
    ];

    let deletedCount = 0;
    for (const pattern of patterns) {
      deletedCount += await cacheDel(pattern);
    }

    console.log(`✓ User cache cleared for ${userId} (${deletedCount} keys)`);
    return deletedCount;
  } catch (error) {
    console.error('❌ Clear user cache error:', error.message);
    return 0;
  }
}

/**
 * Clear vault cache
 * Invalidates cache for a specific vault
 * 
 * @param {string} vaultId - Vault ID
 * @param {string} userId - User ID (optional)
 * @returns {Promise<number>}
 */
async function clearVaultCache(vaultId, userId = null) {
  try {
    const key = userId 
      ? `vault:${userId}:${vaultId}`
      : `vault:*:${vaultId}`;

    const deleted = await cacheDel(key);
    console.log(`✓ Vault cache cleared: ${vaultId} (${deleted} keys)`);
    return deleted;
  } catch (error) {
    console.error('❌ Clear vault cache error:', error.message);
    return 0;
  }
}

/**
 * Cache statistics middleware
 * Provides cache performance metrics
 * 
 * @returns {Function} Middleware
 */
function cacheStatsMiddleware() {
  return (req, res, next) => {
    res.on('finish', () => {
      const cached = res.get('X-Cache') === 'HIT';
      const statusCode = res.statusCode;

      console.log(
        `${cached ? '✓' : '✗'} [${statusCode}] ${req.method} ${req.path} ${cached ? '(cached)' : ''}`
      );
    });

    next();
  };
}

/**
 * Conditional caching middleware
 * Only caches responses meeting certain conditions
 * 
 * @param {Function} shouldCache - Function to determine if response should be cached
 * @param {number} ttl - Time to live
 * @returns {Function} Middleware
 */
function conditionalCacheMiddleware(shouldCache, ttl = 300) {
  return async (req, res, next) => {
    if (req.method !== 'GET') {
      return next();
    }

    try {
      const cacheKey = generateCacheKey(req);
      const cachedData = await cacheGet(cacheKey);

      if (cachedData) {
        console.log(`✓ Conditional cache HIT: ${req.path}`);
        return res.status(200).json(JSON.parse(cachedData));
      }

      const originalJson = res.json.bind(res);
      res.json = function(data) {
        if (shouldCache(res.statusCode, data)) {
          cacheSet(cacheKey, JSON.stringify(data), ttl).catch(err => {
            console.error('Conditional cache error:', err.message);
          });
        }

        return originalJson(data);
      };

      next();
    } catch (error) {
      console.error('❌ Conditional cache error:', error.message);
      next();
    }
  };
}

// Export middleware and utilities
module.exports = {
  cacheGetResponse,
  cacheVaultData,
  invalidateOnMutation,
  etagMiddleware,
  lastModifiedMiddleware,
  cacheControlMiddleware,
  varyMiddleware,
  smartCacheMiddleware,
  cacheStatsMiddleware,
  conditionalCacheMiddleware,
  clearUserCache,
  clearVaultCache,
  generateCacheKey
};
