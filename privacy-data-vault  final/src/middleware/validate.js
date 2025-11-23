/**
 * REQUEST VALIDATION MIDDLEWARE
 * 
 * Validates incoming request data using Joi schemas
 * Features:
 * - Schema-based validation
 * - Custom validators
 * - Detailed error messages
 * - Sanitization
 */

const { body, param, query, validationResult } = require('express-validator');
const Joi = require('joi');

/**
 * Validation error formatter
 * Formats validation errors into consistent structure
 * 
 * @param {Object} errors - Validation errors object
 * @returns {Object} Formatted errors
 */
function formatValidationErrors(errors) {
  const formatted = {};

  if (errors.array) {
    // express-validator format
    errors.array().forEach(error => {
      if (!formatted[error.param]) {
        formatted[error.param] = [];
      }
      formatted[error.param].push({
        message: error.msg,
        value: error.value,
        location: error.location
      });
    });
  } else if (errors.details) {
    // Joi format
    errors.details.forEach(detail => {
      const field = detail.path.join('.');
      if (!formatted[field]) {
        formatted[field] = [];
      }
      formatted[field].push({
        message: detail.message,
        type: detail.type
      });
    });
  }

  return formatted;
}

/**
 * Handle validation errors middleware
 * 
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Express next
 */
function handleValidationErrors(req, res, next) {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    console.warn('❌ Validation errors:', errors.array());

    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      code: 'VALIDATION_ERROR',
      errors: formatValidationErrors(errors)
    });
  }

  next();
}

/**
 * Validate Joi schema
 * 
 * @param {Object} schema - Joi schema
 * @returns {Function} Middleware
 */
function validateSchema(schema) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      console.warn('❌ Schema validation errors:', error.details);

      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        code: 'VALIDATION_ERROR',
        errors: formatValidationErrors(error)
      });
    }

    req.validatedBody = value;
    next();
  };
}

// ============================================================================
// AUTHENTICATION VALIDATION SCHEMAS
// ============================================================================

/**
 * Signup validation schema
 */
const signupSchema = Joi.object({
  username: Joi.string()
    .alphanum()
    .min(3)
    .max(50)
    .required()
    .messages({
      'string.alphanum': 'Username must contain only letters and numbers',
      'string.min': 'Username must be at least 3 characters',
      'string.max': 'Username cannot exceed 50 characters',
      'any.required': 'Username is required'
    }),

  email: Joi.string()
    .email()
    .required()
    .messages({
      'string.email': 'Please provide a valid email address',
      'any.required': 'Email is required'
    }),

  password: Joi.string()
    .min(8)
    .required()
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .messages({
      'string.min': 'Password must be at least 8 characters',
      'string.pattern.base': 'Password must contain uppercase, lowercase, number, and special character',
      'any.required': 'Password is required'
    }),

  confirmPassword: Joi.string()
    .valid(Joi.ref('password'))
    .required()
    .messages({
      'any.only': 'Passwords do not match',
      'any.required': 'Password confirmation is required'
    }),

  firstName: Joi.string()
    .max(50)
    .optional(),

  lastName: Joi.string()
    .max(50)
    .optional()
});

/**
 * Login validation schema
 */
const loginSchema = Joi.object({
  email: Joi.string()
    .email()
    .required()
    .messages({
      'string.email': 'Please provide a valid email address',
      'any.required': 'Email is required'
    }),

  password: Joi.string()
    .required()
    .messages({
      'any.required': 'Password is required'
    })
});

/**
 * Password reset request validation
 */
const resetPasswordRequestSchema = Joi.object({
  email: Joi.string()
    .email()
    .required()
    .messages({
      'string.email': 'Please provide a valid email address',
      'any.required': 'Email is required'
    })
});

/**
 * Password reset validation
 */
const resetPasswordSchema = Joi.object({
  token: Joi.string()
    .required()
    .messages({
      'any.required': 'Reset token is required'
    }),

  password: Joi.string()
    .min(8)
    .required()
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .messages({
      'string.min': 'Password must be at least 8 characters',
      'string.pattern.base': 'Password must contain uppercase, lowercase, number, and special character',
      'any.required': 'Password is required'
    }),

  confirmPassword: Joi.string()
    .valid(Joi.ref('password'))
    .required()
    .messages({
      'any.only': 'Passwords do not match',
      'any.required': 'Password confirmation is required'
    })
});

// ============================================================================
// VAULT VALIDATION SCHEMAS
// ============================================================================

/**
 * Create vault validation schema
 */
const createVaultSchema = Joi.object({
  title: Joi.string()
    .max(100)
    .required()
    .messages({
      'string.max': 'Title cannot exceed 100 characters',
      'any.required': 'Title is required'
    }),

  description: Joi.string()
    .max(500)
    .optional()
    .messages({
      'string.max': 'Description cannot exceed 500 characters'
    }),

  category: Joi.string()
    .valid(
      'personal_documents',
      'financial',
      'medical',
      'legal',
      'credentials',
      'identity',
      'contacts',
      'notes',
      'other'
    )
    .default('other')
    .messages({
      'any.only': 'Invalid category'
    }),

  encryptedData: Joi.string()
    .required()
    .messages({
      'any.required': 'Encrypted data is required'
    }),

  metadata: Joi.object({
    confidentiality: Joi.string()
      .valid('public', 'confidential', 'highly_confidential', 'top_secret')
      .default('confidential'),
    
    sensitivity: Joi.number()
      .min(0)
      .max(10)
      .default(5),

    tags: Joi.array()
      .items(Joi.string())
      .optional()
  }).optional()
});

/**
 * Update vault validation schema
 */
const updateVaultSchema = Joi.object({
  title: Joi.string()
    .max(100)
    .optional(),

  description: Joi.string()
    .max(500)
    .optional(),

  encryptedData: Joi.string()
    .optional(),

  metadata: Joi.object({
    confidentiality: Joi.string()
      .valid('public', 'confidential', 'highly_confidential', 'top_secret')
      .optional(),
    
    sensitivity: Joi.number()
      .min(0)
      .max(10)
      .optional(),

    tags: Joi.array()
      .items(Joi.string())
      .optional()
  }).optional()
});

/**
 * Share vault validation schema
 */
const shareVaultSchema = Joi.object({
  userId: Joi.string()
    .required()
    .messages({
      'any.required': 'User ID is required'
    }),

  accessLevel: Joi.string()
    .valid('read', 'write', 'admin')
    .default('read')
    .messages({
      'any.only': 'Invalid access level'
    }),

  expiresIn: Joi.number()
    .optional()
    .messages({
      'number.base': 'Expiration time must be a number'
    })
});

/**
 * Share vault via email validation
 */
const shareVaultEmailSchema = Joi.object({
  email: Joi.string()
    .email()
    .required()
    .messages({
      'string.email': 'Please provide a valid email address',
      'any.required': 'Email is required'
    }),

  accessLevel: Joi.string()
    .valid('read', 'write', 'admin')
    .default('read'),

  expiresIn: Joi.number()
    .optional()
});

// ============================================================================
// DISCLOSURE VALIDATION SCHEMAS
// ============================================================================

/**
 * Create disclosure validation schema
 */
const createDisclosureSchema = Joi.object({
  vaultId: Joi.string()
    .required()
    .messages({
      'any.required': 'Vault ID is required'
    }),

  recipientEmail: Joi.string()
    .email()
    .required()
    .messages({
      'string.email': 'Please provide a valid email address',
      'any.required': 'Recipient email is required'
    }),

  fields: Joi.array()
    .items(Joi.string())
    .min(1)
    .required()
    .messages({
      'array.min': 'At least one field must be selected',
      'any.required': 'Fields are required'
    }),

  expiresIn: Joi.number()
    .optional()
    .messages({
      'number.base': 'Expiration time must be a number'
    })
});

/**
 * Revoke disclosure validation
 */
const revokeDisclosureSchema = Joi.object({
  token: Joi.string()
    .required()
    .messages({
      'any.required': 'Disclosure token is required'
    })
});

// ============================================================================
// USER PROFILE VALIDATION
// ============================================================================

/**
 * Update profile validation schema
 */
const updateProfileSchema = Joi.object({
  firstName: Joi.string()
    .max(50)
    .optional(),

  lastName: Joi.string()
    .max(50)
    .optional(),

  bio: Joi.string()
    .max(500)
    .optional(),

  preferences: Joi.object({
    language: Joi.string().valid('en', 'es', 'fr', 'de').optional(),
    theme: Joi.string().valid('light', 'dark').optional(),
    notifications: Joi.object({
      email: Joi.boolean().optional(),
      push: Joi.boolean().optional(),
      sms: Joi.boolean().optional()
    }).optional()
  }).optional()
});

/**
 * Change password validation schema
 */
const changePasswordSchema = Joi.object({
  currentPassword: Joi.string()
    .required()
    .messages({
      'any.required': 'Current password is required'
    }),

  newPassword: Joi.string()
    .min(8)
    .required()
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .invalid(Joi.ref('currentPassword'))
    .messages({
      'string.min': 'New password must be at least 8 characters',
      'string.pattern.base': 'Password must contain uppercase, lowercase, number, and special character',
      'any.invalid': 'New password must be different from current password',
      'any.required': 'New password is required'
    }),

  confirmPassword: Joi.string()
    .valid(Joi.ref('newPassword'))
    .required()
    .messages({
      'any.only': 'Passwords do not match',
      'any.required': 'Password confirmation is required'
    })
});

// ============================================================================
// EXPRESS-VALIDATOR CHAINS
// ============================================================================

/**
 * Signup validation chain
 */
const validateSignup = [
  body('username')
    .trim()
    .isLength({ min: 3, max: 50 })
    .withMessage('Username must be between 3 and 50 characters')
    .isAlphanumeric()
    .withMessage('Username can only contain letters and numbers'),

  body('email')
    .trim()
    .isEmail()
    .withMessage('Please provide a valid email address')
    .normalizeEmail(),

  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/)
    .withMessage('Password must contain uppercase, lowercase, number, and special character'),

  body('confirmPassword')
    .custom((value, { req }) => value === req.body.password)
    .withMessage('Passwords do not match'),

  handleValidationErrors
];

/**
 * Login validation chain
 */
const validateLogin = [
  body('email')
    .trim()
    .isEmail()
    .withMessage('Please provide a valid email address')
    .normalizeEmail(),

  body('password')
    .notEmpty()
    .withMessage('Password is required'),

  handleValidationErrors
];

/**
 * Vault ID parameter validation
 */
const validateVaultId = param('vaultId')
  .isMongoId()
  .withMessage('Invalid vault ID');

/**
 * User ID parameter validation
 */
const validateUserId = param('userId')
  .isMongoId()
  .withMessage('Invalid user ID');

// Export validation schemas and middleware
module.exports = {
  // Middleware
  handleValidationErrors,
  validateSchema,
  
  // Authentication schemas
  signupSchema,
  loginSchema,
  resetPasswordRequestSchema,
  resetPasswordSchema,
  
  // Vault schemas
  createVaultSchema,
  updateVaultSchema,
  shareVaultSchema,
  shareVaultEmailSchema,
  
  // Disclosure schemas
  createDisclosureSchema,
  revokeDisclosureSchema,
  
  // Profile schemas
  updateProfileSchema,
  changePasswordSchema,
  
  // Validation chains
  validateSignup,
  validateLogin,
  validateVaultId,
  validateUserId,
  
  // Utilities
  formatValidationErrors
};
