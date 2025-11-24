/**
 * VAULT MODEL
 * 
 * Mongoose schema for encrypted vault data storage
 * Features:
 * - Encrypted data storage
 * - Multiple data categories
 * - Metadata and tagging
 * - Access control and sharing
 * - Digital signatures
 * - Version history
 * - Confidentiality levels
 */

const mongoose = require('mongoose');

// Vault schema definition
const vaultSchema = new mongoose.Schema({
  // User reference
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required'],
    index: true
  },

  // Basic information
  title: {
    type: String,
    required: [true, 'Vault title is required'],
    trim: true,
    maxlength: [100, 'Title cannot exceed 100 characters'],
    index: true
  },

  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },

  // Data category
  category: {
    type: String,
    enum: {
      values: [
        'personal_documents',
        'financial',
        'medical',
        'legal',
        'credentials',
        'identity',
        'contacts',
        'notes',
        'other'
      ],
      message: 'Invalid category'
    },
    default: 'other',
    index: true
  },

  // Encrypted data (stored encrypted in database)
  encryptedData: {
    type: String,
    required: [true, 'Encrypted data is required']
  },

  // Encryption metadata
  encryption: {
    algorithm: {
      type: String,
      enum: ['AES-256-GCM', 'AES-256-CBC'],
      default: 'AES-256-GCM'
    },
    iv: {
      type: String,
      required: true
    },
    authTag: {
      type: String,
      required: true
    },
    salt: {
      type: String,
      required: true
    }
  },

  // Digital signature for integrity verification
  signature: {
    algorithm: {
      type: String,
      enum: ['RSA-SHA256', 'RSA-SHA512'],
      default: 'RSA-SHA256'
    },
    value: {
      type: String,
      required: true
    },
    signedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    signedAt: {
      type: Date,
      default: Date.now
    }
  },

  // Data hash for verification (SHA-256)
  dataHash: {
    type: String,
    required: true,
    index: true
  },

  // Metadata about the vault
  metadata: {
    tags: [{
      type: String,
      trim: true
    }],
    
    confidentiality: {
      type: String,
      enum: ['public', 'confidential', 'highly_confidential', 'top_secret'],
      default: 'confidential',
      index: true
    },

    sensitivity: {
      type: Number,
      min: 0,
      max: 10,
      default: 5
    },

    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'medium'
    },

    expiresAt: {
      type: Date,
      default: null
    },

    customFields: {
      type: Map,
      of: String
    }
  },

  // Access control
  accessControl: {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },

    sharedWith: [{
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      email: String,
      accessLevel: {
        type: String,
        enum: ['read', 'write', 'admin'],
        default: 'read'
      },
      grantedAt: {
        type: Date,
        default: Date.now
      },
      expiresAt: Date
    }],

    public: {
      type: Boolean,
      default: false
    },

    publicAccessToken: String,

    requiresPassword: {
      type: Boolean,
      default: false
    },

    passwordHash: String
  },

  // Version history
  versions: [{
    version: Number,
    encryptedData: String,
    signature: String,
    dataHash: String,
    changedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    changedAt: {
      type: Date,
      default: Date.now
    },
    changeDescription: String
  }],

  currentVersion: {
    type: Number,
    default: 1
  },

  // Selective disclosure tracking
  disclosures: [{
    disclosureId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Disclosure'
    },
    fields: [String],
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],

  // Activity tracking
  activityLog: [{
    action: {
      type: String,
      enum: ['created', 'updated', 'viewed', 'shared', 'deleted', 'restored'],
      default: 'updated'
    },
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    performedAt: {
      type: Date,
      default: Date.now
    },
    details: String,
    ipAddress: String
  }],

  // Status
  status: {
    type: String,
    enum: ['active', 'archived', 'deleted', 'locked'],
    default: 'active',
    index: true
  },

  archived: {
    type: Boolean,
    default: false,
    index: true
  },

  archivedAt: {
    type: Date,
    default: null
  },

  deleted: {
    type: Boolean,
    default: false,
    index: true
  },

  deletedAt: {
    type: Date,
    default: null
  },

  // Backup reference
  backupCreated: {
    type: Boolean,
    default: false
  },

  lastBackupAt: {
    type: Date,
    default: null
  },

  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },

  updatedAt: {
    type: Date,
    default: Date.now
  },

  lastAccessedAt: {
    type: Date,
    default: null
  },

  accessCount: {
    type: Number,
    default: 0
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
vaultSchema.index({ userId: 1, status: 1 });
vaultSchema.index({ userId: 1, category: 1 });
vaultSchema.index({ userId: 1, archived: 1 });
vaultSchema.index({ userId: 1, createdAt: -1 });
vaultSchema.index({ userId: 1, 'metadata.confidentiality': 1 });
vaultSchema.index({ 'metadata.tags': 1 });
vaultSchema.index({ dataHash: 1 });

// TTL index for auto-deletion of expired vaults
vaultSchema.index(
  { 'metadata.expiresAt': 1 },
  { expireAfterSeconds: 0, sparse: true }
);

// ============================================================================
// VIRTUALS
// ============================================================================

/**
 * Virtual: Is vault shared
 */
vaultSchema.virtual('isShared').get(function() {
  return this.accessControl.sharedWith.length > 0 || this.accessControl.public;
});

/**
 * Virtual: Share count
 */
vaultSchema.virtual('shareCount').get(function() {
  return this.accessControl.sharedWith.length;
});

/**
 * Virtual: Is expired
 */
vaultSchema.virtual('isExpired').get(function() {
  if (!this.metadata.expiresAt) return false;
  return new Date() > this.metadata.expiresAt;
});

/**
 * Virtual: Days until expiration
 */
vaultSchema.virtual('daysUntilExpiration').get(function() {
  if (!this.metadata.expiresAt) return null;
  const now = new Date();
  const expiration = new Date(this.metadata.expiresAt);
  return Math.ceil((expiration - now) / (1000 * 60 * 60 * 24));
});

/**
 * Virtual: Display title with icon
 */
vaultSchema.virtual('displayTitle').get(function() {
  const icons = {
    personal_documents: '📄',
    financial: '💰',
    medical: '⚕️',
    legal: '⚖️',
    credentials: '🔐',
    identity: '👤',
    contacts: '👥',
    notes: '📝',
    other: '📦'
  };
  return `${icons[this.category] || '📦'} ${this.title}`;
});

// ============================================================================
// MIDDLEWARE
// ============================================================================

/**
 * Pre-save middleware: Update updatedAt timestamp
 */
vaultSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

/**
 * Pre-save middleware: Log activity
 */
vaultSchema.pre('save', function(next) {
  if (this.isNew) {
    this.activityLog.push({
      action: 'created',
      performedBy: this.accessControl.owner,
      performedAt: new Date()
    });
  }
  next();
});

// ============================================================================
// INSTANCE METHODS
// ============================================================================

/**
 * Check if user has access to this vault
 * 
 * @param {string} userId - User ID
 * @param {string} requiredLevel - Required access level
 * @returns {boolean}
 */
vaultSchema.methods.hasAccess = function(userId, requiredLevel = 'read') {
  // Owner always has access
  if (this.accessControl.owner.toString() === userId.toString()) {
    return true;
  }

  // Check shared access
  const accessLevels = { read: 1, write: 2, admin: 3 };
  const userShare = this.accessControl.sharedWith.find(
    share => share.userId.toString() === userId.toString()
  );

  if (!userShare) {
    return false;
  }

  // Check if share has expired
  if (userShare.expiresAt && new Date() > userShare.expiresAt) {
    return false;
  }

  return accessLevels[userShare.accessLevel] >= accessLevels[requiredLevel];
};

/**
 * Share vault with user
 * 
 * @param {string} userId - User ID to share with
 * @param {string} accessLevel - Access level (read, write, admin)
 * @param {Date} expiresAt - Optional expiration date
 */
vaultSchema.methods.shareWith = function(userId, accessLevel = 'read', expiresAt = null) {
  // Check if already shared
  const existingShare = this.accessControl.sharedWith.find(
    share => share.userId.toString() === userId.toString()
  );

  if (existingShare) {
    existingShare.accessLevel = accessLevel;
    existingShare.expiresAt = expiresAt;
  } else {
    this.accessControl.sharedWith.push({
      userId,
      accessLevel,
      expiresAt,
      grantedAt: new Date()
    });
  }

  this.activityLog.push({
    action: 'shared',
    details: `Shared with user ${userId} at ${accessLevel} level`
  });
};

/**
 * Revoke access for user
 * 
 * @param {string} userId - User ID to revoke access
 */
vaultSchema.methods.revokeAccess = function(userId) {
  this.accessControl.sharedWith = this.accessControl.sharedWith.filter(
    share => share.userId.toString() !== userId.toString()
  );

  this.activityLog.push({
    action: 'updated',
    details: `Revoked access for user ${userId}`
  });
};

/**
 * Create new version
 * 
 * @param {Object} versionData - Version data
 */
vaultSchema.methods.createVersion = function(versionData) {
  this.versions.push({
    version: this.currentVersion,
    encryptedData: versionData.encryptedData,
    signature: versionData.signature,
    dataHash: versionData.dataHash,
    changedBy: versionData.changedBy,
    changeDescription: versionData.description
  });

  this.currentVersion += 1;
};

/**
 * Log access to vault
 * 
 * @param {string} userId - Accessing user ID
 */
vaultSchema.methods.logAccess = function(userId) {
  this.accessCount += 1;
  this.lastAccessedAt = new Date();

  this.activityLog.push({
    action: 'viewed',
    performedBy: userId,
    performedAt: new Date()
  });
};

/**
 * Archive vault
 */
vaultSchema.methods.archive = function() {
  this.archived = true;
  this.status = 'archived';
  this.archivedAt = new Date();

  this.activityLog.push({
    action: 'updated',
    details: 'Vault archived'
  });
};

/**
 * Restore archived vault
 */
vaultSchema.methods.restore = function() {
  this.archived = false;
  this.status = 'active';
  this.archivedAt = null;

  this.activityLog.push({
    action: 'restored',
    details: 'Vault restored from archive'
  });
};

/**
 * Soft delete vault
 */
vaultSchema.methods.softDelete = function() {
  this.deleted = true;
  this.status = 'deleted';
  this.deletedAt = new Date();

  this.activityLog.push({
    action: 'deleted',
    details: 'Vault soft deleted'
  });
};

/**
 * Get vault summary for listing
 * 
 * @returns {Object}
 */
vaultSchema.methods.getSummary = function() {
  return {
    id: this._id,
    title: this.title,
    displayTitle: this.displayTitle,
    category: this.category,
    confidentiality: this.metadata.confidentiality,
    isShared: this.isShared,
    shareCount: this.shareCount,
    tags: this.metadata.tags,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
    lastAccessedAt: this.lastAccessedAt,
    accessCount: this.accessCount,
    status: this.status,
    archived: this.archived
  };
};

/**
 * Get vault details for viewing
 * 
 * @returns {Object}
 */
vaultSchema.methods.getDetails = function() {
  return {
    id: this._id,
    userId: this.userId,
    title: this.title,
    description: this.description,
    category: this.category,
    displayTitle: this.displayTitle,
    metadata: this.metadata,
    isShared: this.isShared,
    sharedWith: this.accessControl.sharedWith,
    public: this.accessControl.public,
    versions: {
      current: this.currentVersion,
      total: this.versions.length
    },
    activityLog: this.activityLog.slice(-10), // Last 10 activities
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
    lastAccessedAt: this.lastAccessedAt,
    status: this.status
  };
};

// ============================================================================
// STATIC METHODS
// ============================================================================

/**
 * Find vaults by user
 * 
 * @param {string} userId - User ID
 * @param {Object} options - Query options
 * @returns {Promise<Array>}
 */
vaultSchema.statics.findByUser = function(userId, options = {}) {
  const query = {
    userId: userId,
    deleted: { $ne: true },
    ...options
  };

  return this.find(query)
    .sort({ updatedAt: -1 })
    .lean();
};

/**
 * Find shared vaults for user
 * 
 * @param {string} userId - User ID
 * @returns {Promise<Array>}
 */
vaultSchema.statics.findSharedVaults = function(userId) {
  return this.find({
    'accessControl.sharedWith.userId': userId,
    deleted: { $ne: true }
  }).lean();
};

/**
 * Find vaults by category
 * 
 * @param {string} userId - User ID
 * @param {string} category - Category
 * @returns {Promise<Array>}
 */
vaultSchema.statics.findByCategory = function(userId, category) {
  return this.find({
    userId: userId,
    category: category,
    deleted: { $ne: true }
  }).lean();
};

/**
 * Find by tags
 * 
 * @param {string} userId - User ID
 * @param {string[]} tags - Tags to search
 * @returns {Promise<Array>}
 */
vaultSchema.statics.findByTags = function(userId, tags) {
  return this.find({
    userId: userId,
    'metadata.tags': { $in: tags },
    deleted: { $ne: true }
  }).lean();
};

// Create and export Vault model
const Vault = mongoose.model('Vault', vaultSchema);

module.exports = Vault;
