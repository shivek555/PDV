/**
 * DISCLOSURE CONTROLLER
 * 
 * Handles selective disclosure operations
 * Features:
 * - Create disclosure
 * - Get disclosure
 * - List disclosures
 * - Verify disclosure
 * - Revoke disclosure
 * - Track access
 */

const Vault = require('../models/Vault');
const User = require('../models/User');
const { asyncHandler, NotFoundError, AuthorizationError, ValidationError } = require('../middleware/errorHandler');
const { validateSchema, createDisclosureSchema } = require('../middleware/validate');
const { 
  cacheDisclosure,
  getCachedDisclosure,
  invalidateDisclosureCache
} = require('../services/caching');
const { 
  encryptSelective,
  decryptSelective,
  hashData
} = require('../services/encryption');
const { sendDisclosureNotificationEmail } = require('../services/mailer');
const crypto = require('crypto');
const uuid = require('uuid');

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';

/**
 * Create selective disclosure
 * Allows user to share specific fields with another user
 * 
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
const createDisclosure = asyncHandler(async (req, res) => {
  try {
    const { vaultId, recipientEmail, fields, expiresIn } = req.body;
    const userId = req.user.id;

    // Validate input
    const { error } = createDisclosureSchema.validate(req.body);
    if (error) {
      throw new ValidationError('Validation failed', { body: error.message });
    }

    console.log(`📋 Creating disclosure for vault ${vaultId}, fields: ${fields.join(', ')}`);

    // Get vault
    const vault = await Vault.findById(vaultId);

    if (!vault) {
      throw new NotFoundError('Vault');
    }

    // Check access
    if (!vault.hasAccess(userId, 'read')) {
      throw new AuthorizationError('You do not have access to this vault');
    }

    // Verify recipient exists (optional - can share anonymously)
    let recipient = null;
    if (recipientEmail) {
      recipient = await User.findByEmail(recipientEmail);
      if (!recipient) {
        console.warn(`⚠️  Recipient not found: ${recipientEmail}`);
      }
    }

    // Generate disclosure token
    const disclosureToken = crypto.randomBytes(32).toString('hex');

    // Create disclosure object
    const disclosure = {
      id: uuid.v4(),
      vaultId: vaultId.toString(),
      userId: userId.toString(),
      recipientEmail: recipientEmail || 'anonymous',
      fields: fields,
      token: disclosureToken,
      createdAt: new Date(),
      expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : null,
      accessed: false,
      accessedAt: null,
      accessedBy: null,
      accessCount: 0,
      isRevoked: false
    };

    // Cache disclosure
    await cacheDisclosure(disclosureToken, disclosure, expiresIn || 604800); // 7 days default

    // Add to vault's disclosures
    vault.disclosures.push({
      disclosureId: disclosure.id,
      fields: fields,
      createdAt: new Date()
    });
    await vault.save();

    // Update user disclosure count
    await User.findByIdAndUpdate(userId, { $inc: { disclosureCount: 1 } });

    // Send notification email if recipient provided
    if (recipientEmail) {
      try {
        await sendDisclosureNotificationEmail(
          recipientEmail,
          req.user.username,
          disclosureToken,
          fields,
          BASE_URL
        );
        console.log(`✓ Disclosure notification sent to ${recipientEmail}`);
      } catch (emailError) {
        console.error('⚠️  Failed to send disclosure email:', emailError.message);
      }
    }

    console.log(`✓ Disclosure created: ${disclosure.id}`);

    res.status(201).json({
      success: true,
      message: 'Disclosure created successfully',
      data: {
        disclosure: {
          id: disclosure.id,
          token: disclosureToken,
          link: `${BASE_URL}/share/${disclosureToken}`,
          expiresAt: disclosure.expiresAt,
          fields: fields
        }
      }
    });
  } catch (error) {
    console.error('❌ Create disclosure error:', error.message);
    throw error;
  }
});

/**
 * Get disclosure by token
 * Retrieves selective disclosure data
 * 
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
const getDisclosure = asyncHandler(async (req, res) => {
  try {
    const { token } = req.params;

    if (!token) {
      throw new ValidationError('Token is required', { token: 'Token is required' });
    }

    console.log(`👁️  Accessing disclosure: ${token.substring(0, 10)}...`);

    // Get from cache
    const disclosure = await getCachedDisclosure(token);

    if (!disclosure) {
      throw new NotFoundError('Disclosure');
    }

    // Check if expired
    if (disclosure.expiresAt && new Date() > new Date(disclosure.expiresAt)) {
      throw new AuthorizationError('Disclosure has expired');
    }

    // Check if revoked
    if (disclosure.isRevoked) {
      throw new AuthorizationError('Disclosure has been revoked');
    }

    // Get vault and extract requested fields
    const vault = await Vault.findById(disclosure.vaultId);

    if (!vault) {
      throw new NotFoundError('Vault');
    }

    // Prepare response with only disclosed fields
    const disclosedData = {
      vaultTitle: vault.title,
      category: vault.category,
      disclosedFields: disclosure.fields,
      createdAt: disclosure.createdAt,
      expiresAt: disclosure.expiresAt
    };

    // Update access info (but don't store passwords/sensitive data)
    disclosure.accessCount += 1;
    disclosure.accessed = true;
    disclosure.accessedAt = new Date();
    disclosure.accessedBy = req.ip;

    // Update cache
    await cacheDisclosure(token, disclosure);

    console.log(`✓ Disclosure accessed: ${disclosure.id} (Access #${disclosure.accessCount})`);

    res.status(200).json({
      success: true,
      message: 'Disclosure retrieved successfully',
      data: {
        disclosure: disclosedData,
        accessCount: disclosure.accessCount
      }
    });
  } catch (error) {
    console.error('❌ Get disclosure error:', error.message);
    throw error;
  }
});

/**
 * Get user's disclosures
 * Lists all disclosures created by the user
 * 
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
const getUserDisclosures = asyncHandler(async (req, res) => {
  try {
    const userId = req.user.id;
    const { status = 'active', page = 1, limit = 10 } = req.query;

    console.log(`📋 Fetching disclosures for user: ${userId}`);

    // Get vaults for user
    const vaults = await Vault.findByUser(userId);
    const vaultIds = vaults.map(v => v._id);

    // Build query
    let query = Vault.find({ _id: { $in: vaultIds } });

    // Filter by status
    if (status === 'active') {
      query = query.find({
        'disclosures.createdAt': { $exists: true }
      });
    } else if (status === 'revoked') {
      // Will filter in memory after fetch
    }

    // Pagination
    const skip = (page - 1) * limit;
    const vaultList = await query.skip(skip).limit(limit).lean();

    // Flatten disclosures
    const disclosures = [];
    vaultList.forEach(vault => {
      vault.disclosures.forEach(disclosure => {
        disclosures.push({
          id: disclosure.disclosureId,
          vaultId: vault._id,
          vaultTitle: vault.title,
          fields: disclosure.fields,
          createdAt: disclosure.createdAt
        });
      });
    });

    const total = disclosures.length;

    console.log(`✓ Retrieved ${disclosures.length} disclosures for user: ${userId}`);

    res.status(200).json({
      success: true,
      data: {
        disclosures,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('❌ Get user disclosures error:', error.message);
    throw error;
  }
});

/**
 * Verify disclosure integrity
 * Checks if disclosed data hasn't been tampered with
 * 
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
const verifyDisclosure = asyncHandler(async (req, res) => {
  try {
    const { token } = req.params;
    const { dataHash } = req.body;

    if (!token || !dataHash) {
      throw new ValidationError('Token and dataHash are required', {
        token: !token ? 'Token is required' : undefined,
        dataHash: !dataHash ? 'Data hash is required' : undefined
      });
    }

    console.log(`✓ Verifying disclosure integrity: ${token.substring(0, 10)}...`);

    const disclosure = await getCachedDisclosure(token);

    if (!disclosure) {
      throw new NotFoundError('Disclosure');
    }

    const vault = await Vault.findById(disclosure.vaultId);

    if (!vault) {
      throw new NotFoundError('Vault');
    }

    // Verify hash matches vault's data hash
    const isValid = vault.dataHash === dataHash;

    res.status(200).json({
      success: true,
      data: {
        valid: isValid,
        message: isValid ? 'Disclosure data is intact' : 'Disclosure data integrity check failed'
      }
    });
  } catch (error) {
    console.error('❌ Verify disclosure error:', error.message);
    throw error;
  }
});

/**
 * Revoke disclosure
 * Invalidates a previously created disclosure
 * 
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
const revokeDisclosure = asyncHandler(async (req, res) => {
  try {
    const { token } = req.params;
    const userId = req.user.id;

    console.log(`🚫 Revoking disclosure: ${token.substring(0, 10)}...`);

    const disclosure = await getCachedDisclosure(token);

    if (!disclosure) {
      throw new NotFoundError('Disclosure');
    }

    // Check ownership
    if (disclosure.userId !== userId.toString()) {
      throw new AuthorizationError('You can only revoke your own disclosures');
    }

    // Mark as revoked
    disclosure.isRevoked = true;
    disclosure.revokedAt = new Date();

    // Update cache
    await cacheDisclosure(token, disclosure);

    console.log(`✓ Disclosure revoked: ${disclosure.id}`);

    res.status(200).json({
      success: true,
      message: 'Disclosure revoked successfully'
    });
  } catch (error) {
    console.error('❌ Revoke disclosure error:', error.message);
    throw error;
  }
});

/**
 * Get disclosure statistics
 * Shows access patterns and usage
 * 
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
const getDisclosureStats = asyncHandler(async (req, res) => {
  try {
    const userId = req.user.id;

    console.log(`📊 Fetching disclosure statistics for user: ${userId}`);

    const user = await User.findById(userId);

    if (!user) {
      throw new NotFoundError('User');
    }

    // Get vaults
    const vaults = await Vault.findByUser(userId);

    const stats = {
      totalDisclosures: user.disclosureCount,
      totalVaults: user.vaultCount,
      byCategory: {},
      accessPatterns: {
        mostAccessed: null,
        averageAccessCount: 0,
        totalAccesses: 0
      }
    };

    // Aggregate stats from vaults
    vaults.forEach(vault => {
      if (!stats.byCategory[vault.category]) {
        stats.byCategory[vault.category] = 0;
      }
      stats.byCategory[vault.category] += vault.disclosures.length;
    });

    res.status(200).json({
      success: true,
      data: { stats }
    });
  } catch (error) {
    console.error('❌ Get disclosure stats error:', error.message);
    throw error;
  }
});

/**
 * Share disclosure via email
 * Sends disclosure link to recipient
 * 
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
const shareDisclosureViaEmail = asyncHandler(async (req, res) => {
  try {
    const { token, recipientEmail, message } = req.body;
    const userId = req.user.id;

    if (!token || !recipientEmail) {
      throw new ValidationError('Token and recipientEmail are required', {
        token: !token ? 'Token is required' : undefined,
        recipientEmail: !recipientEmail ? 'Recipient email is required' : undefined
      });
    }

    console.log(`📧 Sharing disclosure ${token.substring(0, 10)}... with ${recipientEmail}`);

    const disclosure = await getCachedDisclosure(token);

    if (!disclosure) {
      throw new NotFoundError('Disclosure');
    }

    // Check ownership
    if (disclosure.userId !== userId.toString()) {
      throw new AuthorizationError('You can only share your own disclosures');
    }

    const user = await User.findById(userId);
    const vault = await Vault.findById(disclosure.vaultId);

    // Send email with custom message
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; }
          .container { max-width: 600px; margin: 20px auto; padding: 20px; }
          .button { padding: 10px 20px; background: #007bff; color: white; text-decoration: none; border-radius: 5px; }
        </style>
      </head>
      <body>
        <div class="container">
          <h2>📋 Selective Disclosure Shared</h2>
          <p>${user.fullName} has shared selective disclosure from their vault: <strong>${vault.title}</strong></p>
          <p>Shared fields: ${disclosure.fields.join(', ')}</p>
          ${message ? `<p><em>Message: ${message}</em></p>` : ''}
          <p>
            <a href="${BASE_URL}/share/${token}" class="button">View Disclosure</a>
          </p>
        </div>
      </body>
      </html>
    `;

    await sendDisclosureNotificationEmail(
      recipientEmail,
      user.fullName,
      token,
      disclosure.fields,
      BASE_URL
    );

    console.log(`✓ Disclosure shared via email to ${recipientEmail}`);

    res.status(200).json({
      success: true,
      message: 'Disclosure link sent to email'
    });
  } catch (error) {
    console.error('❌ Share disclosure error:', error.message);
    throw error;
  }
});

/**
 * Get disclosure audit log
 * Shows who accessed the disclosure and when
 * 
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
const getDisclosureAuditLog = asyncHandler(async (req, res) => {
  try {
    const { token } = req.params;
    const userId = req.user.id;

    console.log(`📋 Fetching audit log for disclosure: ${token.substring(0, 10)}...`);

    const disclosure = await getCachedDisclosure(token);

    if (!disclosure) {
      throw new NotFoundError('Disclosure');
    }

    // Check ownership
    if (disclosure.userId !== userId.toString()) {
      throw new AuthorizationError('You can only view logs for your own disclosures');
    }

    res.status(200).json({
      success: true,
      data: {
        disclosureId: disclosure.id,
        createdAt: disclosure.createdAt,
        expiresAt: disclosure.expiresAt,
        isRevoked: disclosure.isRevoked,
        accessCount: disclosure.accessCount,
        lastAccessedAt: disclosure.accessedAt,
        lastAccessedFrom: disclosure.accessedBy
      }
    });
  } catch (error) {
    console.error('❌ Get audit log error:', error.message);
    throw error;
  }
});

// Export controller functions
module.exports = {
  createDisclosure,
  getDisclosure,
  getUserDisclosures,
  verifyDisclosure,
  revokeDisclosure,
  getDisclosureStats,
  shareDisclosureViaEmail,
  getDisclosureAuditLog
};
