/**
 * USER MODEL
 * 
 * Mongoose schema for user authentication and profile management
 * Features:
 * - Email and username uniqueness
 * - Password hashing with bcrypt
 * - Email verification
 * - Role-based access control
 * - Two-factor authentication support
 * - OTP-based login support
 * - Profile metadata
 * - Timestamps and activity tracking
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// User schema definition
const userSchema = new mongoose.Schema({
  // Basic information
  username: {
    type: String,
    required: [true, 'Username is required'],
    unique: true,
    trim: true,
    lowercase: true,
    minlength: [3, 'Username must be at least 3 characters'],
    maxlength: [50, 'Username cannot exceed 50 characters'],
    match: [/^[a-zA-Z0-9_-]+$/, 'Username can only contain letters, numbers, underscore, and hyphen']
  },

  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please provide a valid email address']
  },

  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [8, 'Password must be at least 8 characters'],
    select: false // Don't return password by default
  },

  // Profile information
  firstName: {
    type: String,
    trim: true,
    maxlength: [50, 'First name cannot exceed 50 characters']
  },

  lastName: {
    type: String,
    trim: true,
    maxlength: [50, 'Last name cannot exceed 50 characters']
  },

  profilePicture: {
    type: String,
    default: null
  },

  bio: {
    type: String,
    maxlength: [500, 'Bio cannot exceed 500 characters']
  },

  // Verification and security
  verified: {
    type: Boolean,
    default: false,
    index: true
  },

  verificationToken: {
    type: String,
    default: null,
    select: false
  },

  // Two-factor authentication
  twoFactorEnabled: {
    type: Boolean,
    default: false
  },

  twoFactorSecret: {
    type: String,
    default: null,
    select: false
  },

  // ✅ NEW: OTP for login
  loginOTP: {
    type: String,
    default: null,
    select: false
  },

  loginOTPExpires: {
    type: Date,
    default: null,
    select: false
  },

  otpAttempts: {
    type: Number,
    default: 0
  },

  // Password reset
  resetPasswordToken: {
    type: String,
    default: null,
    select: false
  },

  resetPasswordExpires: {
    type: Date,
    default: null,
    select: false
  },

  // Role and permissions
  role: {
    type: String,
    enum: {
      values: ['user', 'moderator', 'admin', 'superadmin'],
      message: 'Invalid role'
    },
    default: 'user',
    index: true
  },

  permissions: [{
    type: String,
    enum: [
      'read_vault',
      'create_vault',
      'update_vault',
      'delete_vault',
      'share_vault',
      'manage_users',
      'view_logs',
      'manage_system',
      'manage_permissions'
    ]
  }],

  // Account status
  active: {
    type: Boolean,
    default: true,
    index: true
  },

  suspended: {
    type: Boolean,
    default: false
  },

  suspensionReason: {
    type: String,
    default: null
  },

  suspendedUntil: {
    type: Date,
    default: null
  },

  // Session management
  lastLogin: {
    type: Date,
    default: null
  },

  lastLoginIp: {
    type: String,
    default: null
  },

  loginAttempts: {
    type: Number,
    default: 0
  },

  lockoutUntil: {
    type: Date,
    default: null
  },

  // Preferences
  preferences: {
    language: {
      type: String,
      default: 'en'
    },
    theme: {
      type: String,
      enum: ['light', 'dark'],
      default: 'light'
    },
    notifications: {
      email: {
        type: Boolean,
        default: true
      },
      push: {
        type: Boolean,
        default: true
      },
      sms: {
        type: Boolean,
        default: false
      }
    },
    privacy: {
      profileVisibility: {
        type: String,
        enum: ['public', 'private', 'friends'],
        default: 'private'
      },
      showEmail: {
        type: Boolean,
        default: false
      }
    }
  },

  // Activity metadata
  vaultCount: {
    type: Number,
    default: 0
  },

  disclosureCount: {
    type: Number,
    default: 0
  },

  sharedVaultsCount: {
    type: Number,
    default: 0
  },

  // Encryption keys (for selective disclosure and digital signatures)
  publicKeyRSA: {
    type: String,
    default: null
  },

  // ✅ NEW: Private key storage (encrypted - optional)
  privateKeyRSAEncrypted: {
    type: String,
    default: null,
    select: false
  },

  // Backup codes for 2FA
  backupCodes: [{
    code: String,
    used: {
      type: Boolean,
      default: false
    },
    usedAt: Date
  }],

  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },

  updatedAt: {
    type: Date,
    default: Date.now
  }

}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// ============================================================================
// INDEXES
// ============================================================================

// Compound indexes for common queries
userSchema.index({ email: 1, verified: 1 });
userSchema.index({ username: 1, active: 1 });
userSchema.index({ role: 1, active: 1 });
userSchema.index({ createdAt: -1 });
userSchema.index({ lastLogin: -1 });

// ============================================================================
// VIRTUALS
// ============================================================================

/**
 * Virtual: Full name
 */
userSchema.virtual('fullName').get(function() {
  if (this.firstName && this.lastName) {
    return `${this.firstName} ${this.lastName}`;
  }
  return this.firstName || this.lastName || this.username;
});

/**
 * Virtual: Account age in days
 */
userSchema.virtual('accountAge').get(function() {
  const now = new Date();
  const created = new Date(this.createdAt);
  return Math.floor((now - created) / (1000 * 60 * 60 * 24));
});

/**
 * Virtual: Is account locked
 */
userSchema.virtual('isLocked').get(function() {
  return this.lockoutUntil && this.lockoutUntil > new Date();
});

/**
 * Virtual: Is account suspended
 */
userSchema.virtual('isSuspended').get(function() {
  return this.suspended && (!this.suspendedUntil || this.suspendedUntil > new Date());
});

// ============================================================================
// MIDDLEWARE
// ============================================================================

/**
 * Pre-save middleware: Hash password before saving
 * Only hash if password is new or modified
 */
userSchema.pre('save', async function(next) {
  try {
    // Only hash password if it's new or modified
    if (!this.isModified('password')) {
      return next();
    }

    // Generate salt and hash password
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);

    console.log(`✓ Password hashed for user: ${this.username}`);
    next();
  } catch (error) {
    next(error);
  }
});

/**
 * Pre-save middleware: Update updatedAt timestamp
 */
userSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

/**
 * Pre-findOneAndUpdate middleware: Hash password if being updated
 */
userSchema.pre('findOneAndUpdate', async function(next) {
  try {
    const update = this.getUpdate();

    if (update.$set && update.$set.password) {
      const salt = await bcrypt.genSalt(12);
      update.$set.password = await bcrypt.hash(update.$set.password, salt);
      update.$set.updatedAt = new Date();
    }

    next();
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// INSTANCE METHODS
// ============================================================================

/**
 * Compare password with hashed password
 * 
 * @param {string} candidatePassword - Password to compare
 * @returns {Promise<boolean>}
 */
userSchema.methods.comparePassword = async function(candidatePassword) {
  try {
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    console.error('Password comparison error:', error);
    return false;
  }
};

/**
 * Generate verification token
 * 
 * @returns {string} Verification token
 */
userSchema.methods.generateVerificationToken = function() {
  const crypto = require('crypto');
  const token = crypto.randomBytes(32).toString('hex');
  this.verificationToken = token;
  return token;
};

/**
 * Generate password reset token
 * 
 * @returns {string} Reset token
 */
userSchema.methods.generateResetToken = function() {
  const crypto = require('crypto');
  const token = crypto.randomBytes(32).toString('hex');
  
  this.resetPasswordToken = token;
  this.resetPasswordExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
  
  return token;
};

/**
 * Increment login attempts
 */
userSchema.methods.incrementLoginAttempts = function() {
  // If we have a previous lock that has expired, restart at 1
  if (this.lockoutUntil && this.lockoutUntil < new Date()) {
    return this.updateOne({
      $set: { loginAttempts: 1 },
      $unset: { lockoutUntil: 1 }
    });
  }

  // Otherwise we're incrementing
  const updates = { $inc: { loginAttempts: 1 } };

  // Lock the account if we've reached max attempts (5)
  const maxAttempts = 5;
  const lockTime = 2 * 60 * 60 * 1000; // 2 hours

  if (this.loginAttempts + 1 >= maxAttempts && !this.isLocked) {
    updates.$set = { lockoutUntil: new Date(Date.now() + lockTime) };
  }

  return this.updateOne(updates);
};

/**
 * Reset login attempts
 */
userSchema.methods.resetLoginAttempts = function() {
  return this.updateOne({
    $set: { loginAttempts: 0 },
    $unset: { lockoutUntil: 1 }
  });
};

/**
 * Record login
 * 
 * @param {string} ipAddress - Client IP address
 */
userSchema.methods.recordLogin = async function(ipAddress) {
  this.lastLogin = new Date();
  this.lastLoginIp = ipAddress;
  this.loginAttempts = 0;
  this.lockoutUntil = null;
  
  await this.save();
};

/**
 * Get user profile for public display
 * 
 * @returns {Object}
 */
userSchema.methods.getPublicProfile = function() {
  return {
    id: this._id,
    username: this.username,
    fullName: this.fullName,
    bio: this.bio,
    profilePicture: this.profilePicture,
    vaultCount: this.vaultCount,
    accountAge: this.accountAge,
    createdAt: this.createdAt
  };
};

/**
 * Get user profile for dashboard
 * 
 * @returns {Object}
 */
userSchema.methods.getDashboardProfile = function() {
  return {
    id: this._id,
    username: this.username,
    email: this.email,
    fullName: this.fullName,
    profilePicture: this.profilePicture,
    bio: this.bio,
    role: this.role,
    verified: this.verified,
    twoFactorEnabled: this.twoFactorEnabled,
    lastLogin: this.lastLogin,
    vaultCount: this.vaultCount,
    disclosureCount: this.disclosureCount,
    sharedVaultsCount: this.sharedVaultsCount,
    preferences: this.preferences,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt
  };
};

// ============================================================================
// STATIC METHODS
// ============================================================================

/**
 * Find user by email
 * 
 * @param {string} email - Email address
 * @param {boolean} includePassword - Include password field
 * @returns {Promise<Object>}
 */
userSchema.statics.findByEmail = function(email, includePassword = false) {
  const query = this.findOne({ email: email.toLowerCase() });
  
  // ✅ Include password when needed (for login)
  if (includePassword) {
    query.select('+password');
  }
  
  return query;
};

/**
 * Find user by username
 * 
 * @param {string} username - Username
 * @returns {Promise<Object>}
 */
userSchema.statics.findByUsername = function(username) {
  return this.findOne({ username: username.toLowerCase() });
};

/**
 * Find active users
 * 
 * @returns {Promise<Array>}
 */
userSchema.statics.findActive = function() {
  return this.find({ active: true, suspended: false });
};

/**
 * Find users by role
 * 
 * @param {string} role - User role
 * @returns {Promise<Array>}
 */
userSchema.statics.findByRole = function(role) {
  return this.find({ role: role, active: true });
};

// Create and export User model
const User = mongoose.model('User', userSchema);

module.exports = User;
