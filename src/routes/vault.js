/**
 * VAULT ROUTES
 * 
 * Handles all vault management endpoints
 * Routes:
 * - POST /api/vault - Create vault
 * - GET /api/vault - List user vaults
 * - GET /api/vault/:id - Get vault details
 * - PUT /api/vault/:id - Update vault
 * - DELETE /api/vault/:id - Delete vault
 * - POST /api/vault/:id/share - Share vault
 * - POST /api/vault/:id/revoke - Revoke access
 * - POST /api/vault/:id/archive - Archive vault
 * - GET /api/vault/stats - Get vault statistics
 * - POST /api/vault/:vaultId/upload - Upload files to vault
 * - GET /api/vault/:id/download/:filename - Download file
 * - GET /api/vault/:id/view/:filename - View file
 */

const express = require('express');
const router = express.Router();
const vaultController = require('../controllers/vaultController');
const { authMiddleware, requireVerifiedEmail } = require('../middleware/auth');
const { ownershipMiddleware } = require('../middleware/role');
const { 
  createVaultRateLimiter, 
  deleteVaultRateLimiter,
  shareVaultRateLimiter 
} = require('../middleware/rateLimiter');
const { 
  cacheVaultData,
  invalidateOnMutation 
} = require('../middleware/cacheMiddleware.js');
const { validateVaultId } = require('../middleware/validate');
const { asyncHandler } = require('../middleware/errorHandler');
const { upload } = require('../middleware/upload'); // ✅ NEW: Import multer upload

// All vault routes require authentication
router.use(authMiddleware);

/**
 * @route   POST /api/vault
 * @desc    Create new vault
 * @access  Private
 * @body    { title, description, category, encryptedData, metadata }
 * @returns { vault }
 */
router.post(
  '/',
  requireVerifiedEmail,
  createVaultRateLimiter,
  invalidateOnMutation(),
  asyncHandler(vaultController.createVault)
);

/**
 * @route   GET /api/vault
 * @desc    Get all vaults for authenticated user
 * @access  Private
 * @query   { category, tags, page, limit, search, includeShared }
 * @returns { vaults[], pagination }
 */
router.get(
  '/',
  cacheVaultData(600),
  asyncHandler(vaultController.getUserVaults)
);

/**
 * @route   GET /api/vault/stats
 * @desc    Get vault statistics for user
 * @access  Private
 * @returns { stats }
 */
router.get(
  '/stats',
  asyncHandler(vaultController.getVaultStats)
);

/**
 * @route   GET /api/vault/:id
 * @desc    Get vault by ID
 * @access  Private
 * @params  { id }
 * @returns { vault }
 */
router.get(
  '/:id',
  validateVaultId,
  cacheVaultData(600),
  asyncHandler(vaultController.getVault)
);

/**
 * @route   PUT /api/vault/:id
 * @desc    Update vault
 * @access  Private
 * @params  { id }
 * @body    { title, description, encryptedData, metadata }
 * @returns { vault }
 */
router.put(
  '/:id',
  validateVaultId,
  ownershipMiddleware('Vault', 'id', 'userId'),
  invalidateOnMutation(),
  asyncHandler(vaultController.updateVault)
);

/**
 * @route   DELETE /api/vault/:id
 * @desc    Delete vault (soft or permanent)
 * @access  Private
 * @params  { id }
 * @body    { permanent }
 * @returns { message }
 */
router.delete(
  '/:id',
  validateVaultId,
  deleteVaultRateLimiter,
  invalidateOnMutation(),
  asyncHandler(vaultController.deleteVault)
);

/**
 * @route   POST /api/vault/:id/share
 * @desc    Share vault with another user
 * @access  Private
 * @params  { id }
 * @body    { userId, accessLevel, expiresIn }
 * @returns { vault }
 */
router.post(
  '/:id/share',
  validateVaultId,
  shareVaultRateLimiter,
  invalidateOnMutation(),
  asyncHandler(vaultController.shareVault)
);

/**
 * @route   POST /api/vault/:id/revoke
 * @desc    Revoke user access to vault
 * @access  Private
 * @params  { id }
 * @body    { userId }
 * @returns { vault }
 */
router.post(
  '/:id/revoke',
  validateVaultId,
  invalidateOnMutation(),
  asyncHandler(vaultController.revokeAccess)
);

/**
 * @route   POST /api/vault/:id/archive
 * @desc    Archive vault
 * @access  Private
 * @params  { id }
 * @returns { vault }
 */
router.post(
  '/:id/archive',
  validateVaultId,
  invalidateOnMutation(),
  asyncHandler(vaultController.archiveVault)
);

// ✅ NEW: File operations routes

/**
 * @route   POST /api/vault/:vaultId/upload
 * @desc    Upload files to vault
 * @access  Private (requires write or admin access)
 * @params  { vaultId }
 * @body    FormData with files
 * @returns { files[] }
 */
router.post(
  '/:vaultId/upload',
  upload.array('files', 10), // Max 10 files at once
  invalidateOnMutation(),
  asyncHandler(vaultController.uploadVaultFiles)
);

/**
 * @route   GET /api/vault/:id/download/:filename
 * @desc    Download file from vault
 * @access  Private (requires write or admin access)
 * @params  { id, filename }
 * @returns File download
 */
router.get(
  '/:id/download/:filename',
  asyncHandler(vaultController.downloadVaultFile)
);

/**
 * @route   GET /api/vault/:id/view/:filename
 * @desc    View file from vault (inline)
 * @access  Private (requires write or admin access)
 * @params  { id, filename }
 * @returns File for inline viewing
 */
router.get(
  '/:id/view/:filename',
  asyncHandler(vaultController.viewVaultFile)
);

module.exports = router;
