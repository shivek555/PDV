const jwt = require('jsonwebtoken');

/**
 * JWT Configuration Service
 * Handles token generation and verification
 */
class JWTConfig {
  constructor() {
    this.secret = process.env.JWT_SECRET;
    this.refreshSecret = process.env.JWT_REFRESH_SECRET;
    this.expiresIn = process.env.JWT_EXPIRES_IN || '7d';
    this.refreshExpiresIn = '30d';
    
    if (!this.secret || !this.refreshSecret) {
      throw new Error('JWT secrets must be defined in environment variables');
    }
    
    if (this.secret.length < 64 || this.refreshSecret.length < 64) {
      console.warn('⚠️ JWT secrets should be at least 64 characters long for security');
    }
  }

  /**
   * Generate access token
   * @param {Object} payload - Token payload
   * @returns {string} JWT access token
   */
  generateAccessToken(payload) {
    try {
      return jwt.sign(
        {
          ...payload,
          type: 'access'
        },
        this.secret,
        {
          expiresIn: this.expiresIn,
          issuer: 'privacy-vault',
          audience: 'privacy-vault-users',
          algorithm: 'HS256'
        }
      );
    } catch (error) {
      throw new Error(`Failed to generate access token: ${error.message}`);
    }
  }

  /**
   * Generate refresh token
   * @param {Object} payload - Token payload
   * @returns {string} JWT refresh token
   */
  generateRefreshToken(payload) {
    try {
      return jwt.sign(
        {
          ...payload,
          type: 'refresh'
        },
        this.refreshSecret,
        {
          expiresIn: this.refreshExpiresIn,
          issuer: 'privacy-vault',
          audience: 'privacy-vault-users',
          algorithm: 'HS256'
        }
      );
    } catch (error) {
      throw new Error(`Failed to generate refresh token: ${error.message}`);
    }
  }

  /**
   * Verify access token
   * @param {string} token - JWT token to verify
   * @returns {Object} Decoded token payload
   */
  verifyAccessToken(token) {
    try {
      const decoded = jwt.verify(token, this.secret, {
        issuer: 'privacy-vault',
        audience: 'privacy-vault-users',
        algorithms: ['HS256']
      });
      
      if (decoded.type !== 'access') {
        throw new Error('Invalid token type');
      }
      
      return decoded;
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        throw new Error('Access token has expired');
      } else if (error.name === 'JsonWebTokenError') {
        throw new Error('Invalid access token');
      } else if (error.name === 'NotBeforeError') {
        throw new Error('Access token not yet valid');
      } else {
        throw new Error(`Token verification failed: ${error.message}`);
      }
    }
  }

  /**
   * Verify refresh token
   * @param {string} token - JWT refresh token to verify
   * @returns {Object} Decoded token payload
   */
  verifyRefreshToken(token) {
    try {
      const decoded = jwt.verify(token, this.refreshSecret, {
        issuer: 'privacy-vault',
        audience: 'privacy-vault-users',
        algorithms: ['HS256']
      });
      
      if (decoded.type !== 'refresh') {
        throw new Error('Invalid token type');
      }
      
      return decoded;
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        throw new Error('Refresh token has expired');
      } else if (error.name === 'JsonWebTokenError') {
        throw new Error('Invalid refresh token');
      } else if (error.name === 'NotBeforeError') {
        throw new Error('Refresh token not yet valid');
      } else {
        throw new Error(`Refresh token verification failed: ${error.message}`);
      }
    }
  }

  /**
   * Generate both access and refresh tokens
   * @param {Object} payload - Token payload (user info)
   * @returns {Object} Token pair with expiration info
   */
  generateTokenPair(payload) {
    try {
      // Ensure payload doesn't contain sensitive information
      const safePayload = {
        id: payload.id,
        email: payload.email,
        role: payload.role,
        username: payload.username
      };
      
      const accessToken = this.generateAccessToken(safePayload);
      const refreshToken = this.generateRefreshToken(safePayload);
      
      return {
        accessToken,
        refreshToken,
        expiresIn: this.expiresIn,
        tokenType: 'Bearer'
      };
    } catch (error) {
      throw new Error(`Failed to generate token pair: ${error.message}`);
    }
  }

  /**
   * Decode token without verification (for debugging)
   * @param {string} token - JWT token
   * @returns {Object} Decoded token
   */
  decodeToken(token) {
    try {
      return jwt.decode(token, { complete: true });
    } catch (error) {
      throw new Error(`Failed to decode token: ${error.message}`);
    }
  }

  /**
   * Get token expiration time
   * @param {string} token - JWT token
   * @returns {Date} Expiration date
   */
  getTokenExpiration(token) {
    try {
      const decoded = jwt.decode(token);
      if (!decoded || !decoded.exp) {
        throw new Error('Invalid token or missing expiration');
      }
      
      return new Date(decoded.exp * 1000);
    } catch (error) {
      throw new Error(`Failed to get token expiration: ${error.message}`);
    }
  }

  /**
   * Check if token is expired
   * @param {string} token - JWT token
   * @returns {boolean} True if expired
   */
  isTokenExpired(token) {
    try {
      const expiration = this.getTokenExpiration(token);
      return Date.now() >= expiration.getTime();
    } catch (error) {
      return true; // Consider invalid tokens as expired
    }
  }
}

module.exports = new JWTConfig();