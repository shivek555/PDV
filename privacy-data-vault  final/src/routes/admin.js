/**
 * ADMIN ROUTES
 * 
 * Handles administrative endpoints
 * Routes:
 * - GET /api/admin/users - Get all users
 * - GET /api/admin/users/:userId - Get user details
 * - POST /api/admin/users/:userId/suspend - Suspend user
 * - POST /api/admin/users/:userId/unsuspend - Unsuspend user
 * - POST /api/admin/users/:userId/role - Change user role
 * - DELETE /api/admin/users/:userId - Delete user
 * - GET /api/admin/stats - Get system statistics
 * - GET /api/admin/health - Get system health
 * - GET /api/admin/logs - Get activity logs
 * - POST /api/admin/export - Export system data
 */

const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { authMiddleware } = require('../middleware/auth');
const { roleMiddleware } = require('../middleware/role');
const { asyncHandler } = require('../middleware/errorHandler');

// All admin routes require authentication and admin role
router.use(authMiddleware);
router.use(roleMiddleware(['admin', 'superadmin']));

/**
 * @route   GET /api/admin/users
 * @desc    Get all users (paginated)
 * @access  Private (Admin only)
 * @query   { page, limit, role, search, verified }
 * @returns { users[], pagination }
 */
router.get(
  '/users',
  asyncHandler(adminController.getAllUsers)
);

/**
 * @route   GET /api/admin/users/:userId
 * @desc    Get user details
 * @access  Private (Admin only)
 * @params  { userId }
 * @returns { user, stats }
 */
router.get(
  '/users/:userId',
  asyncHandler(adminController.getUserById)
);

/**
 * @route   POST /api/admin/users/:userId/suspend
 * @desc    Suspend user account
 * @access  Private (Admin only)
 * @params  { userId }
 * @body    { reason, duration }
 * @returns { user }
 */
router.post(
  '/users/:userId/suspend',
  asyncHandler(adminController.suspendUser)
);

/**
 * @route   POST /api/admin/users/:userId/unsuspend
 * @desc    Unsuspend user account
 * @access  Private (Admin only)
 * @params  { userId }
 * @returns { user }
 */
router.post(
  '/users/:userId/unsuspend',
  asyncHandler(adminController.unsuspendUser)
);

/**
 * @route   POST /api/admin/users/:userId/role
 * @desc    Change user role
 * @access  Private (Admin only)
 * @params  { userId }
 * @body    { newRole }
 * @returns { user }
 */
router.post(
  '/users/:userId/role',
  asyncHandler(adminController.changeUserRole)
);

/**
 * @route   DELETE /api/admin/users/:userId
 * @desc    Delete user account
 * @access  Private (Admin only)
 * @params  { userId }
 * @body    { permanent }
 * @returns { message }
 */
router.delete(
  '/users/:userId',
  asyncHandler(adminController.deleteUser)
);

/**
 * @route   GET /api/admin/stats
 * @desc    Get system statistics
 * @access  Private (Admin only)
 * @returns { stats }
 */
router.get(
  '/stats',
  asyncHandler(adminController.getSystemStats)
);

/**
 * @route   GET /api/admin/health
 * @desc    Get system health status
 * @access  Private (Admin only)
 * @returns { health }
 */
router.get(
  '/health',
  asyncHandler(adminController.getSystemHealth)
);

/**
 * @route   GET /api/admin/logs
 * @desc    Get activity logs
 * @access  Private (Admin only)
 * @query   { page, limit }
 * @returns { activities[], pagination }
 */
router.get(
  '/logs',
  asyncHandler(adminController.getActivityLog)
);

/**
 * @route   POST /api/admin/export
 * @desc    Export system data
 * @access  Private (Admin only)
 * @query   { dataType }
 * @returns { exportData }
 */
router.post(
  '/export',
  asyncHandler(adminController.exportSystemData)
);

module.exports = router;
