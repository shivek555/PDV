/**
 * CACHING SERVICE
 * 
 * Provides high-level caching operations for vault data
 * Features:
 * - User data caching
 * - Vault data caching
 * - Cache invalidation
 * - TTL management
 * - Cache statistics
 */

const { 
  cacheGet, 
  cacheSet, 
  cacheDel, 
  cacheExists, 
  cacheExpire,
  cacheIncrement,
  getRedisClient 
} = require('../config/redis');

// Cache key prefixes
const CACHE_KEYS = {
  USER: 'user:',
  VAULT: 'vault:',
  SHARED_VAULT: 'shared_vault:',
  USER_VAULTS: 'user_vaults:',
  VAULT_ACCESS: 'vault_access:',
  SESSION: 'session:',
  RATE_LIMIT: 'rate_limit:',
  DISCLOSURE: 'disclosure:',
  VERIFICATION: 'verify_token:',
  RESET_TOKEN: 'reset_token:',
  TWO_FACTOR: '2fa:',
  TEMP_DATA: 'temp:'
};

// Default TTLs (in seconds)
const DEFAULT_TTLS = {
  USER: 3600, // 1 hour
  VAULT: 1800, // 30 minutes
  SHARED_VAULT: 1800, // 30 minutes
  SESSION: 86400, // 24 hours
  RATE_LIMIT: 3600, // 1 hour
  DISCLOSURE: 604800, // 7 days
  VERIFICATION: 86400, // 24 hours
  RESET_TOKEN: 3600, // 1 hour
  TWO_FACTOR: 600, // 10 minutes
  TEMP_DATA: 300 // 5 minutes
};

/**
 * Cache user profile
 * 
 * @param {string} userId - User ID
 * @param {Object} userData - User data object
 * @param {number} ttl - Time to live in seconds
 * @returns {Promise<boolean>}
 */
async function cacheUserProfile(userId, userData, ttl = DEFAULT_TTLS.USER) {
  try {
    const key = `${CACHE_KEYS.USER}${userId}`;
    const success = await cacheSet(key, JSON.stringify(userData), ttl);
    
    if (success) {
      console.log(`✓ User profile cached: ${userId} (TTL: ${ttl}s)`);
    }
    
    return success;
  } catch (error) {
    console.error('❌ Cache user profile error:', error.message);
    return false;
  }
}

/**
 * Get cached user profile
 * 
 * @param {string} userId - User ID
 * @returns {Promise<Object|null>}
 */
async function getCachedUserProfile(userId) {
  try {
    const key = `${CACHE_KEYS.USER}${userId}`;
    const data = await cacheGet(key);
    
    if (data) {
      return JSON.parse(data);
    }
    
    return null;
  } catch (error) {
    console.error('❌ Get cached user profile error:', error.message);
    return null;
  }
}

/**
 * Invalidate user profile cache
 * 
 * @param {string} userId - User ID
 * @returns {Promise<number>}
 */
async function invalidateUserCache(userId) {
  try {
    const key = `${CACHE_KEYS.USER}${userId}`;
    const deleted = await cacheDel(key);
    
    if (deleted > 0) {
      console.log(`✓ User cache invalidated: ${userId}`);
    }
    
    return deleted;
  } catch (error) {
    console.error('❌ Invalidate user cache error:', error.message);
    return 0;
  }
}

/**
 * Cache vault data
 * 
 * @param {string} vaultId - Vault ID
 * @param {Object} vaultData - Vault data object
 * @param {number} ttl - Time to live in seconds
 * @returns {Promise<boolean>}
 */
async function cacheVaultData(vaultId, vaultData, ttl = DEFAULT_TTLS.VAULT) {
  try {
    const key = `${CACHE_KEYS.VAULT}${vaultId}`;
    const success = await cacheSet(key, JSON.stringify(vaultData), ttl);
    
    if (success) {
      console.log(`✓ Vault cached: ${vaultId} (TTL: ${ttl}s)`);
    }
    
    return success;
  } catch (error) {
    console.error('❌ Cache vault error:', error.message);
    return false;
  }
}

/**
 * Get cached vault data
 * 
 * @param {string} vaultId - Vault ID
 * @returns {Promise<Object|null>}
 */
async function getCachedVaultData(vaultId) {
  try {
    const key = `${CACHE_KEYS.VAULT}${vaultId}`;
    const data = await cacheGet(key);
    
    if (data) {
      return JSON.parse(data);
    }
    
    return null;
  } catch (error) {
    console.error('❌ Get cached vault error:', error.message);
    return null;
  }
}

/**
 * Invalidate vault cache
 * 
 * @param {string} vaultId - Vault ID
 * @returns {Promise<number>}
 */
async function invalidateVaultCache(vaultId) {
  try {
    const key = `${CACHE_KEYS.VAULT}${vaultId}`;
    const deleted = await cacheDel(key);
    
    if (deleted > 0) {
      console.log(`✓ Vault cache invalidated: ${vaultId}`);
    }
    
    return deleted;
  } catch (error) {
    console.error('❌ Invalidate vault cache error:', error.message);
    return 0;
  }
}

/**
 * Cache user's vault list
 * 
 * @param {string} userId - User ID
 * @param {Array} vaults - Array of vault objects
 * @param {number} ttl - Time to live in seconds
 * @returns {Promise<boolean>}
 */
async function cacheUserVaults(userId, vaults, ttl = DEFAULT_TTLS.VAULT) {
  try {
    const key = `${CACHE_KEYS.USER_VAULTS}${userId}`;
    const success = await cacheSet(key, JSON.stringify(vaults), ttl);
    
    if (success) {
      console.log(`✓ User vault list cached: ${userId} (${vaults.length} vaults)`);
    }
    
    return success;
  } catch (error) {
    console.error('❌ Cache user vaults error:', error.message);
    return false;
  }
}

/**
 * Get cached user vault list
 * 
 * @param {string} userId - User ID
 * @returns {Promise<Array|null>}
 */
async function getCachedUserVaults(userId) {
  try {
    const key = `${CACHE_KEYS.USER_VAULTS}${userId}`;
    const data = await cacheGet(key);
    
    if (data) {
      return JSON.parse(data);
    }
    
    return null;
  } catch (error) {
    console.error('❌ Get cached user vaults error:', error.message);
    return null;
  }
}

/**
 * Invalidate user vault list cache
 * 
 * @param {string} userId - User ID
 * @returns {Promise<number>}
 */
async function invalidateUserVaultsCache(userId) {
  try {
    const key = `${CACHE_KEYS.USER_VAULTS}${userId}`;
    const deleted = await cacheDel(key);
    
    if (deleted > 0) {
      console.log(`✓ User vault list cache invalidated: ${userId}`);
    }
    
    return deleted;
  } catch (error) {
    console.error('❌ Invalidate user vaults cache error:', error.message);
    return 0;
  }
}

/**
 * Cache vault access permissions
 * 
 * @param {string} userId - User ID
 * @param {string} vaultId - Vault ID
 * @param {string} accessLevel - Access level
 * @returns {Promise<boolean>}
 */
async function cacheVaultAccess(userId, vaultId, accessLevel) {
  try {
    const key = `${CACHE_KEYS.VAULT_ACCESS}${userId}:${vaultId}`;
    const success = await cacheSet(key, accessLevel, DEFAULT_TTLS.VAULT);
    
    if (success) {
      console.log(`✓ Vault access cached: ${userId} -> ${vaultId} (${accessLevel})`);
    }
    
    return success;
  } catch (error) {
    console.error('❌ Cache vault access error:', error.message);
    return false;
  }
}

/**
 * Get cached vault access
 * 
 * @param {string} userId - User ID
 * @param {string} vaultId - Vault ID
 * @returns {Promise<string|null>}
 */
async function getCachedVaultAccess(userId, vaultId) {
  try {
    const key = `${CACHE_KEYS.VAULT_ACCESS}${userId}:${vaultId}`;
    const accessLevel = await cacheGet(key);
    
    return accessLevel;
  } catch (error) {
    console.error('❌ Get cached vault access error:', error.message);
    return null;
  }
}

/**
 * Invalidate vault access cache for user
 * 
 * @param {string} userId - User ID
 * @returns {Promise<number>}
 */
async function invalidateUserVaultAccessCache(userId) {
  try {
    const client = getRedisClient();
    const pattern = `${CACHE_KEYS.VAULT_ACCESS}${userId}:*`;
    
    // Use SCAN to find and delete keys matching pattern
    let cursor = 0;
    let deletedCount = 0;
    
    do {
      const reply = await client.scan(cursor, { MATCH: pattern, COUNT: 100 });
      cursor = reply.cursor;
      
      if (reply.keys.length > 0) {
        deletedCount += await cacheDel(reply.keys);
      }
    } while (cursor !== 0);
    
    if (deletedCount > 0) {
      console.log(`✓ User vault access cache invalidated: ${userId} (${deletedCount} keys)`);
    }
    
    return deletedCount;
  } catch (error) {
    console.error('❌ Invalidate user vault access cache error:', error.message);
    return 0;
  }
}

/**
 * Cache session data
 * 
 * @param {string} sessionId - Session ID
 * @param {Object} sessionData - Session data
 * @returns {Promise<boolean>}
 */
async function cacheSession(sessionId, sessionData) {
  try {
    const key = `${CACHE_KEYS.SESSION}${sessionId}`;
    const success = await cacheSet(key, JSON.stringify(sessionData), DEFAULT_TTLS.SESSION);
    
    if (success) {
      console.log(`✓ Session cached: ${sessionId}`);
    }
    
    return success;
  } catch (error) {
    console.error('❌ Cache session error:', error.message);
    return false;
  }
}

/**
 * Get cached session
 * 
 * @param {string} sessionId - Session ID
 * @returns {Promise<Object|null>}
 */
async function getCachedSession(sessionId) {
  try {
    const key = `${CACHE_KEYS.SESSION}${sessionId}`;
    const data = await cacheGet(key);
    
    if (data) {
      return JSON.parse(data);
    }
    
    return null;
  } catch (error) {
    console.error('❌ Get cached session error:', error.message);
    return null;
  }
}

/**
 * Increment rate limit counter
 * 
 * @param {string} identifier - Unique identifier (IP, user ID, etc.)
 * @param {number} limit - Rate limit threshold
 * @returns {Promise<Object>}
 */
async function checkRateLimit(identifier, limit = 100) {
  try {
    const key = `${CACHE_KEYS.RATE_LIMIT}${identifier}`;
    const count = await cacheIncrement(key, 1);
    
    // Set expiration on first increment
    if (count === 1) {
      await cacheExpire(key, DEFAULT_TTLS.RATE_LIMIT);
    }
    
    const remaining = Math.max(0, limit - count);
    const isLimited = count > limit;
    
    return {
      count,
      limit,
      remaining,
      isLimited,
      resetIn: DEFAULT_TTLS.RATE_LIMIT
    };
  } catch (error) {
    console.error('❌ Rate limit check error:', error.message);
    return {
      count: 0,
      limit,
      remaining: limit,
      isLimited: false
    };
  }
}

/**
 * Reset rate limit
 * 
 * @param {string} identifier - Unique identifier
 * @returns {Promise<number>}
 */
async function resetRateLimit(identifier) {
  try {
    const key = `${CACHE_KEYS.RATE_LIMIT}${identifier}`;
    const deleted = await cacheDel(key);
    
    if (deleted > 0) {
      console.log(`✓ Rate limit reset: ${identifier}`);
    }
    
    return deleted;
  } catch (error) {
    console.error('❌ Reset rate limit error:', error.message);
    return 0;
  }
}

/**
 * Cache disclosure token
 * 
 * @param {string} token - Disclosure token
 * @param {Object} disclosureData - Disclosure data
 * @returns {Promise<boolean>}
 */
async function cacheDisclosure(token, disclosureData) {
  try {
    const key = `${CACHE_KEYS.DISCLOSURE}${token}`;
    const success = await cacheSet(key, JSON.stringify(disclosureData), DEFAULT_TTLS.DISCLOSURE);
    
    if (success) {
      console.log(`✓ Disclosure cached: ${token}`);
    }
    
    return success;
  } catch (error) {
    console.error('❌ Cache disclosure error:', error.message);
    return false;
  }
}

/**
 * Get cached disclosure
 * 
 * @param {string} token - Disclosure token
 * @returns {Promise<Object|null>}
 */
async function getCachedDisclosure(token) {
  try {
    const key = `${CACHE_KEYS.DISCLOSURE}${token}`;
    const data = await cacheGet(key);
    
    if (data) {
      return JSON.parse(data);
    }
    
    return null;
  } catch (error) {
    console.error('❌ Get cached disclosure error:', error.message);
    return null;
  }
}

/**
 * Invalidate disclosure cache
 * 
 * @param {string} token - Disclosure token
 * @returns {Promise<number>}
 */
async function invalidateDisclosureCache(token) {
  try {
    const key = `${CACHE_KEYS.DISCLOSURE}${token}`;
    const deleted = await cacheDel(key);
    
    if (deleted > 0) {
      console.log(`✓ Disclosure cache invalidated: ${token}`);
    }
    
    return deleted;
  } catch (error) {
    console.error('❌ Invalidate disclosure cache error:', error.message);
    return 0;
  }
}

/**
 * Cache temporary data
 * 
 * @param {string} key - Data key
 * @param {any} data - Data to cache
 * @param {number} ttl - Time to live in seconds
 * @returns {Promise<boolean>}
 */
async function cacheTempData(key, data, ttl = DEFAULT_TTLS.TEMP_DATA) {
  try {
    const fullKey = `${CACHE_KEYS.TEMP_DATA}${key}`;
    const success = await cacheSet(fullKey, JSON.stringify(data), ttl);
    
    return success;
  } catch (error) {
    console.error('❌ Cache temp data error:', error.message);
    return false;
  }
}

/**
 * Get cached temporary data
 * 
 * @param {string} key - Data key
 * @returns {Promise<any|null>}
 */
async function getCachedTempData(key) {
  try {
    const fullKey = `${CACHE_KEYS.TEMP_DATA}${key}`;
    const data = await cacheGet(fullKey);
    
    if (data) {
      return JSON.parse(data);
    }
    
    return null;
  } catch (error) {
    console.error('❌ Get cached temp data error:', error.message);
    return null;
  }
}

/**
 * Get cache statistics
 * 
 * @returns {Promise<Object>}
 */
async function getCacheStats() {
  try {
    const client = getRedisClient();
    const info = await client.info('stats');
    
    const lines = info.split('\r\n');
    const stats = {};
    
    lines.forEach(line => {
      const [key, value] = line.split(':');
      if (key && value) {
        stats[key] = isNaN(value) ? value : parseInt(value);
      }
    });

    return {
      hits: stats.keyspace_hits || 0,
      misses: stats.keyspace_misses || 0,
      hitRate: stats.keyspace_hits ? 
        (stats.keyspace_hits / (stats.keyspace_hits + stats.keyspace_misses) * 100).toFixed(2) + '%' 
        : 'N/A',
      totalCommandsProcessed: stats.total_commands_processed || 0,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('❌ Get cache stats error:', error.message);
    return null;
  }
}

/**
 * Clear all cache (development only)
 * 
 * @returns {Promise<void>}
 */
async function clearAllCache() {
  try {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Cannot clear cache in production');
    }

    const client = getRedisClient();
    await client.flushDb();
    console.log('✓ All cache cleared');
  } catch (error) {
    console.error('❌ Clear cache error:', error.message);
    throw error;
  }
}

// Export functions
module.exports = {
  cacheUserProfile,
  getCachedUserProfile,
  invalidateUserCache,
  cacheVaultData,
  getCachedVaultData,
  invalidateVaultCache,
  cacheUserVaults,
  getCachedUserVaults,
  invalidateUserVaultsCache,
  cacheVaultAccess,
  getCachedVaultAccess,
  invalidateUserVaultAccessCache,
  cacheSession,
  getCachedSession,
  checkRateLimit,
  resetRateLimit,
  cacheDisclosure,
  getCachedDisclosure,
  invalidateDisclosureCache,
  cacheTempData,
  getCachedTempData,
  getCacheStats,
  clearAllCache,
  CACHE_KEYS,
  DEFAULT_TTLS
};
