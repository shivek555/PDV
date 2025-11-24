/**
 * AUTHENTICATION ROUTES
 * 
 * Handles all authentication endpoints
 * Routes:
 * - POST /api/auth/register - Register new user
 * - POST /api/auth/login - Login user
 * - POST /api/auth/verify-email - Verify email
 * - POST /api/auth/resend-verification - Resend verification email
 * - POST /api/auth/forgot-password - Request password reset
 * - POST /api/auth/reset-password - Reset password
 * - POST /api/auth/refresh - Refresh access token
 * - POST /api/auth/logout - Logout user
 * - GET /api/auth/me - Get current user
 * - GET /api/auth/search-user - Search user by email (for sharing)
 */

const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authMiddleware, optionalAuthMiddleware } = require('../middleware/auth');
const { loginRateLimiter, signupRateLimiter, forgotPasswordRateLimiter } = require('../middleware/rateLimiter');
const { validateSignup, validateLogin, handleValidationErrors } = require('../middleware/validate');
const { asyncHandler } = require('../middleware/errorHandler');
const User = require('../models/User'); // ✅ User model import

/**
 * @route   POST /api/auth/register
 * @desc    Register new user
 * @access  Public
 * @body    { username, email, password, confirmPassword, firstName, lastName }
 * @returns { user, token, refreshToken }
 */
router.post(
  '/register',
  signupRateLimiter,
  validateSignup,
  asyncHandler(authController.register)
);

/**
 * @route   POST /api/auth/login
 * @desc    Login user
 * @access  Public
 * @body    { email, password }
 * @returns { user, token, refreshToken, sessionId }
 */
router.post(
  '/login',
  loginRateLimiter,
  validateLogin,
  asyncHandler(authController.login)
);

/**
 * @route   GET /api/auth/verify/:token
 * @desc    Verify email address
 * @access  Public
 * @params  { token }
 * @returns { user }
 */
router.get(
  '/verify/:token',
  asyncHandler(authController.verifyEmail)
);

/**
 * @route   POST /api/auth/resend-verification
 * @desc    Resend email verification
 * @access  Public
 * @body    { email }
 * @returns { message }
 */
router.post(
  '/resend-verification',
  asyncHandler(authController.resendVerificationEmail)
);

/**
 * @route   POST /api/auth/forgot-password
 * @desc    Request password reset
 * @access  Public
 * @body    { email }
 * @returns { message }
 */
router.post(
  '/forgot-password',
  forgotPasswordRateLimiter,
  asyncHandler(authController.forgotPassword)
);

/**
 * @route   POST /api/auth/reset-password
 * @desc    Reset user password
 * @access  Public
 * @body    { token, password, confirmPassword }
 * @returns { user }
 */
router.post(
  '/reset-password',
  asyncHandler(authController.resetPassword)
);

/**
 * @route   POST /api/auth/refresh
 * @desc    Refresh access token
 * @access  Public
 * @body    { refreshToken }
 * @returns { token, refreshToken }
 */
router.post(
  '/refresh',
  asyncHandler(authController.refreshAccessToken)
);

/**
 * @route   POST /api/auth/logout
 * @desc    Logout user
 * @access  Private
 * @returns { message }
 */
router.post(
  '/logout',
  authMiddleware,
  asyncHandler(authController.logout)
);

/**
 * @route   GET /api/auth/me
 * @desc    Get current authenticated user
 * @access  Private
 * @returns { user }
 */
router.get(
  '/me',
  authMiddleware,
  asyncHandler(authController.getCurrentUser)
);
/**
 * @route   POST /api/auth/login/otp/request
 * @desc    Request OTP for login
 * @access  Public
 */
router.post(
  '/login/otp/request',
  loginRateLimiter,
  asyncHandler(authController.requestLoginOTP)
);

/**
 * @route   POST /api/auth/login/otp/verify
 * @desc    Verify OTP and complete login
 * @access  Public
 */
router.post(
  '/login/otp/verify',
  loginRateLimiter,
  asyncHandler(authController.verifyLoginOTP)
);

/**
 * @route   GET /api/auth/search-user
 * @desc    Search user by email (for sharing vaults)
 * @access  Private
 * @query   { email }
 * @returns { user: { id, email, username } }
 */
router.get('/search-user', authMiddleware, asyncHandler(async (req, res) => {
  try {
    const { email } = req.query;
    
    console.log('🔍 Searching for user with email:', email);
    
    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }
    
    // ✅ Find user without .select() to ensure _id is included
    const user = await User.findOne({ 
      email: email.toLowerCase().trim() 
    });
    
    console.log('👤 Search result:', user);
    console.log('👤 User._id:', user?._id);
    console.log('👤 User._id type:', typeof user?._id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found with this email'
      });
    }
    
    // ✅ Safely extract ID
    const userId = user._id || user.id;
    
    if (!userId) {
      console.error('❌ User found but no ID:', user);
      return res.status(500).json({
        success: false,
        message: 'User data is invalid (no ID)'
      });
    }
    
    res.status(200).json({
      success: true,
      data: {
        user: {
          id: userId.toString(),
          userId: userId.toString(),
          email: user.email,
          username: user.username
        }
      }
    });
  } catch (error) {
    console.error('❌ Search user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to search user',
      error: error.message
    });
  }
}));

module.exports = router;
