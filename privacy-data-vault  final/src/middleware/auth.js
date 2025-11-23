/**
 * AUTHENTICATION MIDDLEWARE
 * 
 * Handles JWT token verification and user authentication
 * Features:
 * - JWT token extraction and verification
 * - User identification
 * - Token refresh
 * - Error handling
 */

const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { getCachedUserProfile, cacheUserProfile } = require('../services/caching');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const JWT_EXPIRY = process.env.JWT_EXPIRY || '24h';
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET || 'your-refresh-secret';

/**
 * Generate JWT token
 * 
 * @param {Object} user - User object
 * @returns {string} JWT token
 */
function generateToken(user) {
  try {
    const token = jwt.sign(
      {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRY }
    );

    console.log(`✓ JWT token generated for user: ${user.username}`);
    return token;
  } catch (error) {
    console.error('❌ Token generation error:', error.message);
    throw error;
  }
}

/**
 * Generate refresh token
 * 
 * @param {Object} user - User object
 * @returns {string} Refresh token
 */
function generateRefreshToken(user) {
  try {
    const refreshToken = jwt.sign(
      {
        id: user._id,
        type: 'refresh'
      },
      REFRESH_TOKEN_SECRET,
      { expiresIn: '7d' }
    );

    console.log(`✓ Refresh token generated for user: ${user.username}`);
    return refreshToken;
  } catch (error) {
    console.error('❌ Refresh token generation error:', error.message);
    throw error;
  }
}

/**
 * Verify JWT token
 * 
 * @param {string} token - JWT token
 * @returns {Object|null} Decoded token or null if invalid
 */
function verifyToken(token) {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return decoded;
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      console.warn('⚠️  Token expired');
    } else if (error.name === 'JsonWebTokenError') {
      console.warn('⚠️  Invalid token');
    }
    return null;
  }
}

/**
 * Verify refresh token
 * 
 * @param {string} token - Refresh token
 * @returns {Object|null} Decoded token or null if invalid
 */
function verifyRefreshToken(token) {
  try {
    const decoded = jwt.verify(token, REFRESH_TOKEN_SECRET);
    return decoded;
  } catch (error) {
    console.warn('⚠️  Refresh token invalid:', error.message);
    return null;
  }
}

/**
 * Extract token from request
 * Looks for token in:
 * 1. Authorization header (Bearer <token>)
 * 2. Query parameter (?token=...)
 * 3. Cookies
 * 
 * @param {Object} req - Express request object
 * @returns {string|null} Token or null if not found
 */
function extractToken(req) {
  // Check Authorization header
  if (req.headers.authorization) {
    const parts = req.headers.authorization.split(' ');
    if (parts.length === 2 && parts[0] === 'Bearer') {
      return parts[1];
    }
  }

  // Check query parameters
  if (req.query.token) {
    return req.query.token;
  }

  // Check cookies
  if (req.cookies && req.cookies.token) {
    return req.cookies.token;
  }

  return null;
}

/**
 * Main authentication middleware
 * Verifies JWT token and attaches user to request
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware
 */
async function authMiddleware(req, res, next) {
  try {
    // Extract token
    const token = extractToken(req);

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'No authentication token provided',
        code: 'NO_TOKEN'
      });
    }

    // Verify token
    const decoded = verifyToken(token);

    if (!decoded) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token',
        code: 'INVALID_TOKEN'
      });
    }

    // Try to get user from cache first
    let user = await getCachedUserProfile(decoded.id);

    // If not in cache, fetch from database
    if (!user) {
      user = await User.findById(decoded.id).select(
        'id username email role verified active suspended permissions'
      );

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found',
          code: 'USER_NOT_FOUND'
        });
      }

      // Check if user is active
      if (!user.active) {
        return res.status(403).json({
          success: false,
          message: 'User account is inactive',
          code: 'ACCOUNT_INACTIVE'
        });
      }

      // Check if user is suspended
      if (user.isSuspended) {
        return res.status(403).json({
          success: false,
          message: 'User account is suspended',
          code: 'ACCOUNT_SUSPENDED',
          suspendedUntil: user.suspendedUntil
        });
      }

      // Cache user profile for 1 hour
      await cacheUserProfile(user._id, user.toObject(), 3600);
    }

    // Attach user to request
    req.user = {
      id: user._id || user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      verified: user.verified,
      permissions: user.permissions || []
    };

    // Store original token for reference
    req.token = token;

    console.log(`✓ User authenticated: ${user.username}`);
    next();
  } catch (error) {
    console.error('❌ Authentication middleware error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Authentication error',
      code: 'AUTH_ERROR'
    });
  }
}

/**
 * Optional authentication middleware
 * Does not require token, but verifies if provided
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware
 */
async function optionalAuthMiddleware(req, res, next) {
  try {
    const token = extractToken(req);

    if (token) {
      const decoded = verifyToken(token);

      if (decoded) {
        const user = await User.findById(decoded.id).select(
          'id username email role verified'
        );

        if (user && user.active && !user.isSuspended) {
          req.user = {
            id: user._id,
            username: user.username,
            email: user.email,
            role: user.role,
            verified: user.verified
          };
          req.token = token;
        }
      }
    }

    next();
  } catch (error) {
    console.error('❌ Optional auth middleware error:', error.message);
    next();
  }
}

/**
 * Refresh token middleware
 * Generates new token from refresh token
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware
 */
async function refreshTokenMiddleware(req, res, next) {
  try {
    const refreshToken = req.body.refreshToken || req.cookies.refreshToken;

    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        message: 'No refresh token provided',
        code: 'NO_REFRESH_TOKEN'
      });
    }

    // Verify refresh token
    const decoded = verifyRefreshToken(refreshToken);

    if (!decoded) {
      return res.status(401).json({
        success: false,
        message: 'Invalid refresh token',
        code: 'INVALID_REFRESH_TOKEN'
      });
    }

    // Get user
    const user = await User.findById(decoded.id).select(
      'id username email role verified active'
    );

    if (!user || !user.active) {
      return res.status(403).json({
        success: false,
        message: 'User not found or inactive',
        code: 'USER_INACTIVE'
      });
    }

    // Generate new tokens
    const newToken = generateToken(user);
    const newRefreshToken = generateRefreshToken(user);

    req.user = {
      id: user._id,
      username: user.username,
      email: user.email,
      role: user.role,
      verified: user.verified
    };

    req.tokens = {
      token: newToken,
      refreshToken: newRefreshToken
    };

    console.log(`✓ Token refreshed for user: ${user.username}`);
    next();
  } catch (error) {
    console.error('❌ Token refresh error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Token refresh failed',
      code: 'REFRESH_ERROR'
    });
  }
}

/**
 * Verify email requirement middleware
 * Ensures user has verified their email
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware
 */
async function requireVerifiedEmail(req, res, next) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
        code: 'NOT_AUTHENTICATED'
      });
    }

    const user = await User.findById(req.user.id);

    if (!user.verified) {
      return res.status(403).json({
        success: false,
        message: 'Email verification required',
        code: 'EMAIL_NOT_VERIFIED'
      });
    }

    next();
  } catch (error) {
    console.error('❌ Email verification check error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Verification check failed',
      code: 'VERIFICATION_ERROR'
    });
  }
}

/**
 * Require two-factor authentication middleware
 * Ensures user has completed 2FA
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware
 */
async function require2FA(req, res, next) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
        code: 'NOT_AUTHENTICATED'
      });
    }

    // Check if 2FA is enabled for this user
    const user = await User.findById(req.user.id);

    if (user.twoFactorEnabled) {
      // Check if 2FA verification is in session
      if (!req.session || !req.session.twoFactorVerified) {
        return res.status(403).json({
          success: false,
          message: 'Two-factor authentication required',
          code: '2FA_REQUIRED'
        });
      }
    }

    next();
  } catch (error) {
    console.error('❌ 2FA check error:', error.message);
    res.status(500).json({
      success: false,
      message: '2FA check failed',
      code: '2FA_ERROR'
    });
  }
}

/**
 * Get token info
 * 
 * @param {string} token - JWT token
 * @returns {Object}
 */
function getTokenInfo(token) {
  try {
    const decoded = jwt.decode(token, { complete: true });

    if (!decoded) {
      return null;
    }

    return {
      header: decoded.header,
      payload: decoded.payload,
      signature: decoded.signature,
      issuedAt: new Date(decoded.payload.iat * 1000),
      expiresAt: new Date(decoded.payload.exp * 1000),
      isExpired: new Date() > new Date(decoded.payload.exp * 1000)
    };
  } catch (error) {
    console.error('❌ Get token info error:', error.message);
    return null;
  }
}

// Export functions
module.exports = {
  authMiddleware,
  optionalAuthMiddleware,
  refreshTokenMiddleware,
  requireVerifiedEmail,
  require2FA,
  generateToken,
  generateRefreshToken,
  verifyToken,
  verifyRefreshToken,
  extractToken,
  getTokenInfo
};
