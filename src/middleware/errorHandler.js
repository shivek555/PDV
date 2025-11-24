/**
 * GLOBAL ERROR HANDLER MIDDLEWARE
 * 
 * Centralized error handling for all routes
 * Features:
 * - Error categorization
 * - Proper HTTP status codes
 * - Error logging
 * - User-friendly error messages
 * - Stack trace in development
 */

const NODE_ENV = process.env.NODE_ENV || 'development';

/**
 * Custom Error class for application errors
 */
class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.timestamp = new Date().toISOString();

    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Validation Error class
 */
class ValidationError extends AppError {
  constructor(message, errors = {}) {
    super(message, 400, 'VALIDATION_ERROR');
    this.errors = errors;
  }
}

/**
 * Authentication Error class
 */
class AuthError extends AppError {
  constructor(message = 'Authentication failed') {
    super(message, 401, 'AUTH_ERROR');
  }
}

/**
 * Authorization Error class
 */
class AuthorizationError extends AppError {
  constructor(message = 'Authorization failed') {
    super(message, 403, 'AUTHORIZATION_ERROR');
  }
}

/**
 * Not Found Error class
 */
class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

/**
 * Conflict Error class
 */
class ConflictError extends AppError {
  constructor(message = 'Resource conflict') {
    super(message, 409, 'CONFLICT');
  }
}

/**
 * Rate Limit Error class
 */
class RateLimitError extends AppError {
  constructor(message = 'Too many requests') {
    super(message, 429, 'RATE_LIMIT_EXCEEDED');
  }
}

/**
 * Database Error class
 */
class DatabaseError extends AppError {
  constructor(message = 'Database operation failed') {
    super(message, 500, 'DATABASE_ERROR');
  }
}

/**
 * External API Error class
 */
class ExternalAPIError extends AppError {
  constructor(message = 'External API error', statusCode = 502) {
    super(message, statusCode, 'EXTERNAL_API_ERROR');
  }
}

/**
 * Log error with appropriate level
 * 
 * @param {Error} error - Error object
 * @param {Object} req - Express request object
 */
function logError(error, req) {
  const logData = {
    timestamp: new Date().toISOString(),
    message: error.message,
    code: error.code || 'UNKNOWN',
    statusCode: error.statusCode || 500,
    method: req.method,
    url: req.originalUrl,
    userAgent: req.get('user-agent'),
    ip: req.ip || req.connection.remoteAddress,
    userId: req.user ? req.user.id : 'anonymous'
  };

  if (NODE_ENV === 'development') {
    logData.stack = error.stack;
    logData.body = req.body;
    logData.params = req.params;
    logData.query = req.query;
  }

  const logLevel = error.statusCode >= 500 ? 'error' : 'warn';
  console[logLevel](`❌ [${logLevel.toUpperCase()}]`, JSON.stringify(logData, null, 2));
}

/**
 * Format error response
 * 
 * @param {Error} error - Error object
 * @param {Object} req - Express request object
 * @returns {Object} Formatted error response
 */
function formatErrorResponse(error, req) {
  const response = {
    success: false,
    message: error.message || 'An error occurred',
    code: error.code || 'INTERNAL_ERROR',
    statusCode: error.statusCode || 500,
    timestamp: new Date().toISOString()
  };

  // Include validation errors if present
  if (error.errors && Object.keys(error.errors).length > 0) {
    response.errors = error.errors;
  }

  // Include stack trace in development
  if (NODE_ENV === 'development' && error.stack) {
    response.stack = error.stack.split('\n');
  }

  // Include request info in development
  if (NODE_ENV === 'development') {
    response.request = {
      method: req.method,
      url: req.originalUrl,
      headers: req.headers
    };
  }

  return response;
}

/**
 * Handle MongoDB validation errors
 * 
 * @param {Error} error - MongoDB error
 * @returns {ValidationError}
 */
function handleMongoValidationError(error) {
  const errors = {};

  if (error.errors) {
    Object.keys(error.errors).forEach(field => {
      const fieldError = error.errors[field];
      errors[field] = fieldError.message;
    });
  }

  return new ValidationError('Validation error', errors);
}

/**
 * Handle MongoDB duplicate key error
 * 
 * @param {Error} error - MongoDB error
 * @returns {ConflictError}
 */
function handleMongoDuplicateError(error) {
  const field = Object.keys(error.keyValue)[0];
  const value = error.keyValue[field];
  
  return new ConflictError(`${field} '${value}' already exists`);
}

/**
 * Handle MongoDB cast error
 * 
 * @param {Error} error - MongoDB error
 * @returns {ValidationError}
 */
function handleMongoCastError(error) {
  return new ValidationError(`Invalid ${error.path}: ${error.value}`);
}

/**
 * Handle JWT errors
 * 
 * @param {Error} error - JWT error
 * @returns {AuthError}
 */
function handleJWTError(error) {
  if (error.name === 'JsonWebTokenError') {
    return new AuthError('Invalid token');
  } else if (error.name === 'TokenExpiredError') {
    return new AuthError('Token expired');
  }
  return new AuthError('Token validation failed');
}

/**
 * Global error handler middleware
 * Must be defined after all other middleware and routes
 * 
 * @param {Error} error - Error object
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
function globalErrorHandler(error, req, res, next) {
  try {
    let appError = error;

    // Convert known errors to AppError
    if (error.name === 'ValidationError' && error.errors) {
      appError = handleMongoValidationError(error);
    } else if (error.code === 11000) {
      appError = handleMongoDuplicateError(error);
    } else if (error.name === 'CastError') {
      appError = handleMongoCastError(error);
    } else if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      appError = handleJWTError(error);
    } else if (!(error instanceof AppError)) {
      // Convert generic errors
      appError = new AppError(
        error.message || 'An unexpected error occurred',
        error.statusCode || 500,
        error.code || 'INTERNAL_ERROR'
      );
    }

    // Log error
    logError(appError, req);

    // Format and send response
    const response = formatErrorResponse(appError, req);
    res.status(appError.statusCode).json(response);
  } catch (handlerError) {
    console.error('❌ Error handler failed:', handlerError);
    res.status(500).json({
      success: false,
      message: 'An unexpected error occurred',
      code: 'INTERNAL_ERROR',
      timestamp: new Date().toISOString()
    });
  }
}

/**
 * Async error wrapper
 * Wraps async route handlers to catch errors
 * 
 * @param {Function} fn - Async function
 * @returns {Function} Wrapped function
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Create custom error response
 * 
 * @param {string} message - Error message
 * @param {number} statusCode - HTTP status code
 * @param {string} code - Error code
 * @returns {AppError}
 */
function createError(message, statusCode = 500, code = 'INTERNAL_ERROR') {
  return new AppError(message, statusCode, code);
}

/**
 * Handle specific HTTP status errors
 * 
 * @param {number} statusCode - HTTP status code
 * @param {string} message - Error message
 * @returns {AppError}
 */
function createHttpError(statusCode, message) {
  const errorMap = {
    400: { code: 'BAD_REQUEST', defaultMsg: 'Bad request' },
    401: { code: 'UNAUTHORIZED', defaultMsg: 'Unauthorized' },
    403: { code: 'FORBIDDEN', defaultMsg: 'Forbidden' },
    404: { code: 'NOT_FOUND', defaultMsg: 'Not found' },
    409: { code: 'CONFLICT', defaultMsg: 'Conflict' },
    429: { code: 'RATE_LIMIT', defaultMsg: 'Too many requests' },
    500: { code: 'INTERNAL_ERROR', defaultMsg: 'Internal server error' },
    502: { code: 'BAD_GATEWAY', defaultMsg: 'Bad gateway' },
    503: { code: 'SERVICE_UNAVAILABLE', defaultMsg: 'Service unavailable' }
  };

  const errorInfo = errorMap[statusCode] || { code: 'UNKNOWN_ERROR', defaultMsg: 'Unknown error' };
  return new AppError(message || errorInfo.defaultMsg, statusCode, errorInfo.code);
}

/**
 * Validate request and throw error if invalid
 * 
 * @param {Object} data - Data to validate
 * @param {Object} schema - Validation schema
 * @throws {ValidationError}
 */
function validateRequest(data, schema) {
  const errors = {};
  let hasErrors = false;

  for (const [field, rules] of Object.entries(schema)) {
    const value = data[field];

    if (rules.required && !value) {
      errors[field] = `${field} is required`;
      hasErrors = true;
      continue;
    }

    if (value && rules.type) {
      if (typeof value !== rules.type) {
        errors[field] = `${field} must be of type ${rules.type}`;
        hasErrors = true;
      }
    }

    if (value && rules.minLength && value.length < rules.minLength) {
      errors[field] = `${field} must be at least ${rules.minLength} characters`;
      hasErrors = true;
    }

    if (value && rules.maxLength && value.length > rules.maxLength) {
      errors[field] = `${field} must not exceed ${rules.maxLength} characters`;
      hasErrors = true;
    }

    if (value && rules.pattern && !rules.pattern.test(value)) {
      errors[field] = `${field} format is invalid`;
      hasErrors = true;
    }
  }

  if (hasErrors) {
    throw new ValidationError('Validation failed', errors);
  }
}

/**
 * Error context for debugging
 * 
 * @param {Error} error - Error object
 * @returns {Object} Error context
 */
function getErrorContext(error) {
  return {
    name: error.name,
    message: error.message,
    statusCode: error.statusCode || 500,
    code: error.code || 'UNKNOWN',
    timestamp: new Date().toISOString(),
    stack: NODE_ENV === 'development' ? error.stack : undefined
  };
}

/**
 * Safe error response
 * Prevents leaking sensitive error details in production
 * 
 * @param {Error} error - Error object
 * @returns {Object} Safe error response
 */
function getSafeErrorResponse(error) {
  const response = {
    success: false,
    message: error.message,
    code: error.code || 'INTERNAL_ERROR',
    timestamp: new Date().toISOString()
  };

  // In production, don't expose internal details
  if (NODE_ENV === 'production') {
    if (error.statusCode >= 500) {
      response.message = 'An error occurred. Please try again later.';
    }
  }

  return response;
}

// Export error classes and functions
module.exports = {
  AppError,
  ValidationError,
  AuthError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  DatabaseError,
  ExternalAPIError,
  globalErrorHandler,
  asyncHandler,
  createError,
  createHttpError,
  validateRequest,
  logError,
  formatErrorResponse,
  getErrorContext,
  getSafeErrorResponse,
  handleMongoValidationError,
  handleMongoDuplicateError,
  handleMongoCastError,
  handleJWTError
};
