const Vault = require('../models/Vault');
const User = require('../models/User');
const { asyncHandler, NotFoundError, AuthorizationError, ValidationError } = require('../middleware/errorHandler');
const { validateSchema, createVaultSchema, updateVaultSchema } = require('../middleware/validate');
const { 
  cacheVaultData, 
  getCachedVaultData, 
  invalidateVaultCache,
  cacheUserVaults,
  getCachedUserVaults,
  invalidateUserVaultsCache
} = require('../services/caching');
const { hashData } = require('../services/encryption');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken'); // ✅ NEW: For token verification

const NODE_ENV = process.env.NODE_ENV || 'development';

/**
 * Create new vault
 * ✅ FIXED: Matches Vault model requirements exactly
 */
const createVault = asyncHandler(async (req, res) => {
  try {
    const { title, description, category, encryptedData, metadata } = req.body;
    const userId = req.user.id;

    // Validate required fields
    if (!title || title.trim().length === 0) {
      throw new ValidationError('Validation failed', { title: 'Title is required' });
    }

    if (!category || category.trim().length === 0) {
      throw new ValidationError('Validation failed', { category: 'Category is required' });
    }

    const vaultData = encryptedData || JSON.stringify({ empty: true });

    console.log(`📝 Creating vault: ${title} for user ${userId}`);

    // ✅ Generate encryption fields (required by Vault model)
    const crypto = require('crypto');
    const salt = crypto.randomBytes(32).toString('hex');
    const iv = crypto.randomBytes(16).toString('hex');
    const authTag = crypto.randomBytes(16).toString('hex');
    
    const dataHash = hashData(vaultData);

    // ✅ Create vault with correct field values
    const vault = new Vault({
      userId,
      title: title.trim(),
      description: description?.trim() || '',
      category,
      encryptedData: vaultData,
      dataHash,
      encryption: {
        algorithm: 'AES-256-GCM',
        salt: salt,
        iv: iv,
        authTag: authTag
      },
      metadata: {
        confidentiality: metadata?.confidentiality || 'confidential',
        sensitivity: metadata?.sensitivity || 5,
        priority: metadata?.priority || 'medium',
        tags: metadata?.tags || [],
        expiresAt: metadata?.expiresAt || null,
        customFields: metadata?.customFields || new Map()
      },
      accessControl: {
        owner: userId,
        sharedWith: [],
        public: false,
        requiresPassword: false
      },
      signature: {
        algorithm: 'RSA-SHA256',
        value: dataHash,
        signedBy: userId,
        signedAt: new Date()
      },
      status: 'active',
      archived: false,
      deleted: false,
      currentVersion: 1,
      versions: [],
      disclosures: [],
      activityLog: []
    });

    await vault.save();
    await User.findByIdAndUpdate(userId, { $inc: { vaultCount: 1 } });
    await invalidateUserVaultsCache(userId);

    console.log(`✓ Vault created: ${vault._id}`);

    res.status(201).json({
      success: true,
      message: 'Vault created successfully',
      data: { vault: vault.getSummary() }
    });
  } catch (error) {
    console.error('❌ Create vault error:', error.message);
    throw error;
  }
});

/**
 * Get vault by ID
 */
const getVault = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    console.log(`📖 Fetching vault: ${id}`);

    const vault = await Vault.findById(id);

    if (!vault) {
      throw new NotFoundError('Vault');
    }

    if (!vault.hasAccess(userId, 'read')) {
      throw new AuthorizationError('You do not have access to this vault');
    }

    vault.logAccess(userId);
    await vault.save();

    console.log(`✓ Vault retrieved: ${id}`);

    res.status(200).json({
      success: true,
      data: { 
        vault: vault.getDetails(),
        encryptedData: vault.encryptedData
      }
    });
  } catch (error) {
    console.error('❌ Get vault error:', error.message);
    throw error;
  }
});

/**
 * Get all vaults for user
 */
const getUserVaults = asyncHandler(async (req, res) => {
  try {
    const userId = req.user.id;
    const { category, tags, page = 1, limit = 20, search, includeShared } = req.query;

    console.log(`📚 Fetching vaults for user: ${userId} (includeShared: ${includeShared})`);

    if (!category && !tags && !search && page == 1 && includeShared !== 'true') {
      const cachedVaults = await getCachedUserVaults(userId);
      if (cachedVaults) {
        console.log(`✓ Vaults retrieved from cache for user: ${userId}`);
        return res.status(200).json({
          success: true,
          data: { vaults: cachedVaults, total: cachedVaults.length, cached: true }
        });
      }
    }

    let query = {};
    
    if (includeShared === 'true') {
      query = {
        $or: [
          { userId },
          { 'accessControl.sharedWith.userId': userId }
        ],
        deleted: { $ne: true }
      };
    } else {
      query = { userId, deleted: { $ne: true } };
    }

    if (category) query.category = category;
    if (tags) query['metadata.tags'] = { $in: tags.split(',') };
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const vaults = await Vault.find(query)
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await Vault.countDocuments(query);

    const summaries = vaults.map(v => ({
      id: v._id,
      title: v.title,
      displayTitle: v.title,
      description: v.description,
      category: v.category,
      createdAt: v.createdAt,
      updatedAt: v.updatedAt,
      accessCount: v.accessCount || 0,
      isShared: (v.accessControl?.sharedWith?.length > 0) || false,
      archived: v.archived || false,
      sharedWithMe: v.userId?.toString() !== userId
    }));

    if (!category && !tags && !search && page == 1 && includeShared !== 'true') {
      await cacheUserVaults(userId, summaries, 600);
    }

    console.log(`✓ Retrieved ${vaults.length} vaults for user: ${userId}`);

    res.status(200).json({
      success: true,
      data: {
        vaults: summaries,
        total,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });
  } catch (error) {
    console.error('❌ Get user vaults error:', error.message);
    throw error;
  }
});

/**
 * Update vault
 */
const updateVault = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, encryptedData, metadata } = req.body;
    const userId = req.user.id;

    console.log(`✏️  Updating vault: ${id}`);

    const vault = await Vault.findById(id);

    if (!vault) {
      throw new NotFoundError('Vault');
    }

    const isOwner = vault.accessControl?.owner?.toString() === userId || vault.userId?.toString() === userId;
    const hasWriteAccess = vault.hasAccess && vault.hasAccess(userId, 'write');
    
    if (!isOwner && !hasWriteAccess) {
      throw new AuthorizationError('You do not have write access to this vault');
    }

    if (title) vault.title = title.trim();
    if (description !== undefined) vault.description = description.trim();
    if (metadata) {
      vault.metadata = { 
        ...vault.metadata, 
        ...metadata,
        confidentiality: metadata.confidentiality || vault.metadata.confidentiality
      };
    }

    if (encryptedData) {
      const oldData = vault.encryptedData;
      vault.encryptedData = encryptedData;
      vault.dataHash = hashData(encryptedData);

      vault.createVersion({
        encryptedData: oldData,
        signature: vault.signature.value,
        dataHash: hashData(oldData),
        changedBy: userId,
        description: `Updated: ${title || 'vault data'}`
      });
    }

    vault.activityLog.push({
      action: 'updated',
      performedBy: userId,
      performedAt: new Date(),
      details: `Updated ${title ? 'title' : ''} ${encryptedData ? 'data' : ''}`.trim()
    });

    await vault.save();

    await invalidateVaultCache(id);
    await invalidateUserVaultsCache(userId);
    if (!isOwner) {
      await invalidateUserVaultsCache(vault.userId || vault.accessControl.owner);
    }

    console.log(`✓ Vault updated: ${id}`);

    res.status(200).json({
      success: true,
      message: 'Vault updated successfully',
      data: { vault: vault.getDetails() }
    });
  } catch (error) {
    console.error('❌ Update vault error:', error.message);
    throw error;
  }
});

/**
 * Delete vault
 */
const deleteVault = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { permanent = false } = req.body;

    console.log(`🗑️  Deleting vault: ${id} (permanent: ${permanent})`);

    const vault = await Vault.findById(id);

    if (!vault) {
      throw new NotFoundError('Vault');
    }

    const ownerId = vault.accessControl?.owner || vault.userId;
    if (ownerId.toString() !== userId) {
      throw new AuthorizationError('Only vault owner can delete this vault');
    }

    if (permanent) {
      await Vault.findByIdAndDelete(id);
      console.log(`✓ Vault permanently deleted: ${id}`);
    } else {
      vault.softDelete();
      await vault.save();
      console.log(`✓ Vault soft deleted: ${id}`);
    }

    await User.findByIdAndUpdate(userId, { $inc: { vaultCount: -1 } });
    await invalidateVaultCache(id);
    await invalidateUserVaultsCache(userId);

    res.status(200).json({
      success: true,
      message: permanent ? 'Vault deleted permanently' : 'Vault deleted'
    });
  } catch (error) {
    console.error('❌ Delete vault error:', error.message);
    throw error;
  }
});

/**
 * Share vault
 */
const shareVault = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { userId: recipientUserId, accessLevel = 'read', expiresIn } = req.body;
    const currentUserId = req.user.id;

    console.log(`🔗 Sharing vault ${id} with user ${recipientUserId}`);

    const recipientUser = await User.findById(recipientUserId);
    if (!recipientUser) {
      throw new ValidationError('Recipient user not found', { userId: 'User does not exist' });
    }

    const vault = await Vault.findById(id);

    if (!vault) {
      throw new NotFoundError('Vault');
    }

    const ownerId = vault.accessControl?.owner || vault.userId;
    if (ownerId.toString() !== currentUserId) {
      throw new AuthorizationError('Only vault owner can share this vault');
    }

    const alreadyShared = vault.accessControl?.sharedWith?.some(
      share => share.userId?.toString() === recipientUserId
    );

    if (alreadyShared) {
      throw new ValidationError('Vault already shared with this user', { userId: 'Already has access' });
    }

    let expiresAt = null;
    if (expiresIn) {
      expiresAt = new Date(Date.now() + expiresIn * 1000);
    }

    vault.shareWith(recipientUserId, accessLevel, expiresAt);
    await vault.save();

    await invalidateVaultCache(id);
    await invalidateUserVaultsCache(currentUserId);
    await invalidateUserVaultsCache(recipientUserId);

    console.log(`✓ Vault shared: ${id} with ${recipientUserId}`);

    res.status(200).json({
      success: true,
      message: 'Vault shared successfully',
      data: { vault: vault.getSummary() }
    });
  } catch (error) {
    console.error('❌ Share vault error:', error.message);
    throw error;
  }
});

/**
 * Revoke vault access
 */
const revokeAccess = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.body;
    const currentUserId = req.user.id;

    console.log(`🚫 Revoking access to vault ${id} for user ${userId}`);

    const vault = await Vault.findById(id);

    if (!vault) {
      throw new NotFoundError('Vault');
    }

    const ownerId = vault.accessControl?.owner || vault.userId;
    if (ownerId.toString() !== currentUserId) {
      throw new AuthorizationError('Only vault owner can revoke access');
    }

    vault.revokeAccess(userId);
    await vault.save();

    await invalidateVaultCache(id);
    await invalidateUserVaultsCache(currentUserId);
    await invalidateUserVaultsCache(userId);

    console.log(`✓ Access revoked for vault: ${id}`);

    res.status(200).json({
      success: true,
      message: 'Access revoked successfully',
      data: { vault: vault.getSummary() }
    });
  } catch (error) {
    console.error('❌ Revoke access error:', error.message);
    throw error;
  }
});

/**
 * Archive vault
 */
const archiveVault = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    console.log(`📦 Archiving vault: ${id}`);

    const vault = await Vault.findById(id);

    if (!vault) {
      throw new NotFoundError('Vault');
    }

    if (!vault.hasAccess(userId, 'write')) {
      throw new AuthorizationError('You do not have permission to archive this vault');
    }

    vault.archive();
    await vault.save();

    await invalidateVaultCache(id);
    await invalidateUserVaultsCache(userId);

    console.log(`✓ Vault archived: ${id}`);

    res.status(200).json({
      success: true,
      message: 'Vault archived successfully',
      data: { vault: vault.getSummary() }
    });
  } catch (error) {
    console.error('❌ Archive vault error:', error.message);
    throw error;
  }
});

/**
 * Get vault statistics
 */
const getVaultStats = asyncHandler(async (req, res) => {
  try {
    const userId = req.user.id;

    console.log(`📊 Fetching vault statistics for user: ${userId}`);

    const vaults = await Vault.find({ userId, deleted: { $ne: true } });

    const stats = {
      total: vaults.length,
      byCategory: {},
      byConfidentiality: {},
      shared: 0,
      archived: 0,
      totalAccess: 0
    };

    vaults.forEach(vault => {
      stats.byCategory[vault.category] = (stats.byCategory[vault.category] || 0) + 1;
      const conf = vault.metadata?.confidentiality || 'confidential';
      stats.byConfidentiality[conf] = (stats.byConfidentiality[conf] || 0) + 1;
      if (vault.accessControl?.sharedWith?.length > 0) stats.shared += 1;
      if (vault.archived) stats.archived += 1;
      stats.totalAccess += vault.accessCount || 0;
    });

    res.status(200).json({
      success: true,
      data: { stats }
    });
  } catch (error) {
    console.error('❌ Get vault stats error:', error.message);
    throw error;
  }
});

/**
 * Upload vault files
 */
const uploadVaultFiles = asyncHandler(async (req, res) => {
  try {
    const { vaultId } = req.params;
    const userId = req.user.id;

    console.log(`📤 Uploading files for vault: ${vaultId}`);

    const vault = await Vault.findById(vaultId);

    if (!vault) {
      throw new NotFoundError('Vault');
    }

    const isOwner = vault.accessControl?.owner?.toString() === userId || vault.userId?.toString() === userId;
    const hasWriteAccess = vault.hasAccess && vault.hasAccess(userId, 'write');
    
    if (!isOwner && !hasWriteAccess) {
      throw new AuthorizationError('You do not have write access to this vault');
    }

    if (!req.files || req.files.length === 0) {
      throw new ValidationError('No files uploaded', { files: 'At least one file required' });
    }

    // ✅ Log uploaded files details
    console.log('📂 Files received:', req.files.map(f => ({
      original: f.originalname,
      saved: f.filename,
      path: f.path,
      size: f.size
    })));

    const uploadedFiles = req.files.map(file => ({
      originalName: file.originalname,
      filename: file.filename,
      size: file.size,
      mimetype: file.mimetype,
      path: file.path,
      uploadedAt: new Date()
    }));

    console.log(`✓ Uploaded ${uploadedFiles.length} files for vault: ${vaultId}`);

    res.status(200).json({
      success: true,
      message: 'Files uploaded successfully',
      data: { files: uploadedFiles }
    });
  } catch (error) {
    console.error('❌ Upload files error:', error.message);
    throw error;
  }
});

/**
 * Download vault file
 * ✅ UPDATED: Accept token from query params
 */
const downloadVaultFile = asyncHandler(async (req, res) => {
  try {
    const { id, filename } = req.params;
    
    // ✅ Get token from query params or header
    const token = req.query.token || req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'No authentication token provided',
        code: 'NO_TOKEN'
      });
    }
    
    // ✅ Verify token and get user
    let userId;
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      userId = decoded.id;
    } catch (err) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token',
        code: 'INVALID_TOKEN'
      });
    }

    console.log(`📥 Downloading file: ${filename} from vault: ${id} by user: ${userId}`);

    const vault = await Vault.findById(id);

    if (!vault) {
      return res.status(404).json({
        success: false,
        message: 'Vault not found'
      });
    }

    // ✅ Check access
    const isOwner = vault.accessControl?.owner?.toString() === userId || vault.userId?.toString() === userId;
    
    let hasDownloadAccess = isOwner;
    if (!isOwner) {
      const userAccess = vault.accessControl?.sharedWith?.find(
        share => share.userId?.toString() === userId
      );
      hasDownloadAccess = userAccess && (userAccess.accessLevel === 'write' || userAccess.accessLevel === 'admin');
    }

    if (!hasDownloadAccess) {
      return res.status(403).json({
        success: false,
        message: 'You need write or admin access to download files from this vault'
      });
    }

    // Construct file path
    const { uploadsDir } = require('../middleware/upload');
    const filePath = path.join(uploadsDir, filename);

    // ✅ Log file path for debugging
    console.log('📂 Looking for file at:', filePath);
    console.log('📂 File exists?', fs.existsSync(filePath));

    if (!fs.existsSync(filePath)) {
      console.error('❌ File not found:', filePath);
      return res.status(404).json({
        success: false,
        message: 'File not found on server'
      });
    }

    // Log access
    vault.logAccess(userId);
    await vault.save();

    console.log(`✓ File downloaded: ${filename}`);

    // Send file
    res.download(filePath, filename, (err) => {
      if (err) {
        console.error('Download error:', err);
        if (!res.headersSent) {
          res.status(500).json({ success: false, message: 'Download failed' });
        }
      }
    });
  } catch (error) {
    console.error('❌ Download file error:', error.message);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
});

/**
 * View vault file (inline)
 * ✅ UPDATED: Accept token from query params
 */
const viewVaultFile = asyncHandler(async (req, res) => {
  try {
    const { id, filename } = req.params;
    
    // ✅ Get token from query params or header
    const token = req.query.token || req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'No authentication token provided',
        code: 'NO_TOKEN'
      });
    }
    
    // ✅ Verify token and get user
    let userId;
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      userId = decoded.id;
    } catch (err) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token',
        code: 'INVALID_TOKEN'
      });
    }

    console.log(`👁️  Viewing file: ${filename} from vault: ${id} by user: ${userId}`);

    const vault = await Vault.findById(id);

    if (!vault) {
      return res.status(404).json({
        success: false,
        message: 'Vault not found'
      });
    }

    // ✅ Check access
    const isOwner = vault.accessControl?.owner?.toString() === userId || vault.userId?.toString() === userId;
    
    let hasViewAccess = isOwner;
    if (!isOwner) {
      const userAccess = vault.accessControl?.sharedWith?.find(
        share => share.userId?.toString() === userId
      );
      hasViewAccess = userAccess && (userAccess.accessLevel === 'write' || userAccess.accessLevel === 'admin');
    }

    if (!hasViewAccess) {
      return res.status(403).json({
        success: false,
        message: 'You need write or admin access to view files from this vault'
      });
    }

    const { uploadsDir } = require('../middleware/upload');
    const filePath = path.join(uploadsDir, filename);

    // ✅ Log file path for debugging
    console.log('📂 Looking for file at:', filePath);
    console.log('📂 File exists?', fs.existsSync(filePath));

    if (!fs.existsSync(filePath)) {
      console.error('❌ File not found:', filePath);
      return res.status(404).json({
        success: false,
        message: 'File not found on server'
      });
    }

    // Log access
    vault.logAccess(userId);
    await vault.save();

    console.log(`✓ File viewed: ${filename}`);

    // Send file for inline viewing
    res.sendFile(filePath);
  } catch (error) {
    console.error('❌ View file error:', error.message);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
});

// Export controller functions
module.exports = {
  createVault,
  getVault,
  getUserVaults,
  updateVault,
  deleteVault,
  shareVault,
  revokeAccess,
  archiveVault,
  getVaultStats,
  uploadVaultFiles,
  downloadVaultFile,
  viewVaultFile
};
