/**
 * DISCLOSURE ROUTES
 * 
 * Handles selective disclosure endpoints
 * Routes:
 * - POST /api/disclosure - Create disclosure
 * - GET /api/disclosure - List user disclosures
 * - GET /api/disclosure/:token - Get disclosure by token
 * - POST /api/disclosure/:token/verify - Verify disclosure
 * - POST /api/disclosure/:token/revoke - Revoke disclosure
 * - GET /api/disclosure/:token/audit - Get audit log
 * - POST /api/disclosure/:token/share - Share disclosure via email
 * - GET /api/disclosure/stats - Get disclosure statistics
 */

const express = require('express');
const router = express.Router();
const disclosureController = require('../controllers/disclosureController');
const { authMiddleware, optionalAuthMiddleware } = require('../middleware/auth');
const { shareVaultRateLimiter } = require('../middleware/rateLimiter');
const { asyncHandler } = require('../middleware/errorHandler');

/**
 * @route   POST /api/disclosure
 * @desc    Create selective disclosure
 * @access  Private
 * @body    { vaultId, recipientEmail, fields, expiresIn }
 * @returns { disclosure }
 */
router.post(
  '/',
  authMiddleware,
  shareVaultRateLimiter,
  asyncHandler(disclosureController.createDisclosure)
);

/**
 * @route   GET /api/disclosure
 * @desc    Get all disclosures created by user
 * @access  Private
 * @query   { status, page, limit }
 * @returns { disclosures[], pagination }
 */
router.get(
  '/',
  authMiddleware,
  asyncHandler(disclosureController.getUserDisclosures)
);

/**
 * @route   GET /api/disclosure/stats
 * @desc    Get disclosure statistics
 * @access  Private
 * @returns { stats }
 */
router.get(
  '/stats',
  authMiddleware,
  asyncHandler(disclosureController.getDisclosureStats)
);

/**
 * @route   GET /api/disclosure/:token
 * @desc    Get disclosure by token (public access)
 * @access  Public
 * @params  { token }
 * @returns { disclosure }
 */
router.get(
  '/:token',
  optionalAuthMiddleware,
  asyncHandler(disclosureController.getDisclosure)
);

/**
 * @route   POST /api/disclosure/:token/verify
 * @desc    Verify disclosure integrity
 * @access  Public
 * @params  { token }
 * @body    { dataHash }
 * @returns { valid, message }
 */
router.post(
  '/:token/verify',
  optionalAuthMiddleware,
  asyncHandler(disclosureController.verifyDisclosure)
);

/**
 * @route   POST /api/disclosure/:token/revoke
 * @desc    Revoke disclosure
 * @access  Private
 * @params  { token }
 * @returns { message }
 */
router.post(
  '/:token/revoke',
  authMiddleware,
  asyncHandler(disclosureController.revokeDisclosure)
);

/**
 * @route   GET /api/disclosure/:token/audit
 * @desc    Get disclosure audit log
 * @access  Private
 * @params  { token }
 * @returns { auditLog }
 */
router.get(
  '/:token/audit',
  authMiddleware,
  asyncHandler(disclosureController.getDisclosureAuditLog)
);

/**
 * @route   POST /api/disclosure/:token/share
 * @desc    Share disclosure via email
 * @access  Private
 * @params  { token }
 * @body    { recipientEmail, message }
 * @returns { message }
 */
router.post(
  '/:token/share',
  authMiddleware,
  shareVaultRateLimiter,
  asyncHandler(disclosureController.shareDisclosureViaEmail)
);

module.exports = router;
