/**
 * AUTHENTICATION CONTROLLER
 * 
 * Handles user authentication operations
 * Features:
 * - User registration
 * - User login (standard & OTP-based)
 * - Email verification
 * - Password reset
 * - Token refresh
 * - Logout
 */

const User = require('../models/User');
const { generateToken, generateRefreshToken } = require('../middleware/auth');
const { sendVerificationEmail, sendPasswordResetEmail, sendEmail } = require('../services/mailer');
const { cacheSession, invalidateUserCache } = require('../services/caching');
const { cacheSet, cacheDel } = require('../config/redis');
const { asyncHandler, ValidationError, AuthError, ConflictError } = require('../middleware/errorHandler');
const { validateSchema, signupSchema, loginSchema } = require('../middleware/validate');
const OTPService = require('../services/otpService'); // ✅ NEW
const uuid = require('uuid');

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';

/**
 * Register new user
 * 
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
const register = asyncHandler(async (req, res) => {
  try {
    const { username, email, password, firstName, lastName } = req.body;

    // Validate input
    const { error, value } = signupSchema.validate(req.body, { abortEarly: false });
    if (error) {
      throw new ValidationError('Validation failed', error.details);
    }

    console.log(`📝 Registration attempt: ${email}`);

    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [{ email: email.toLowerCase() }, { username: username.toLowerCase() }]
    });

    if (existingUser) {
      if (existingUser.email === email.toLowerCase()) {
        throw new ConflictError('Email already registered');
      }
      throw new ConflictError('Username already taken');
    }

    // Create new user
    const user = new User({
      username: username.toLowerCase(),
      email: email.toLowerCase(),
      password,
      firstName,
      lastName
    });

    // Save user (password will be hashed by pre-save hook)
    await user.save();
    console.log(`✓ User registered: ${user.username}`);

    // Generate verification token
    const verificationToken = user.generateVerificationToken();
    await user.save();

    // Cache verification token
    await cacheSet(
      `verify_token:${verificationToken}`,
      user._id.toString(),
      86400 // 24 hours
    );

    // Send verification email
    try {
      await sendVerificationEmail(
        user.email,
        user.username,
        verificationToken,
        BASE_URL
      );
      console.log(`✓ Verification email sent to ${user.email}`);
    } catch (emailError) {
      console.error('⚠️  Failed to send verification email:', emailError.message);
      // Continue anyway, user can request resend
    }

    // Generate tokens
    const token = generateToken(user);
    const refreshToken = generateRefreshToken(user);

    // Cache refresh token
    await cacheSession(`refresh_token:${user._id}`, {
      token: refreshToken,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    });

    res.status(201).json({
      success: true,
      message: 'Registration successful. Please verify your email.',
      data: {
        user: user.getDashboardProfile(),
        token,
        refreshToken
      }
    });
  } catch (error) {
    console.error('❌ Registration error:', error.message);
    throw error;
  }
});

/**
 * Login user (standard)
 * ✅ FIXED: Now properly selects password field for comparison
 * 
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
const login = asyncHandler(async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    const { error } = loginSchema.validate(req.body);
    if (error) {
      throw new ValidationError('Validation failed', { email: error.message });
    }

    console.log(`🔐 Login attempt: ${email}`);

    // ✅ FIX: Find user WITH password field (select: false bypass)
    const user = await User.findOne({ 
      email: email.toLowerCase() 
    }).select('+password +active +suspended +lockoutUntil +loginAttempts +suspendedUntil');

    if (!user) {
      throw new AuthError('Invalid email or password');
    }

    // Check if account is locked
    if (user.isLocked) {
      const minutesLeft = Math.ceil((user.lockoutUntil - new Date()) / (1000 * 60));
      throw new AuthError(`Account locked. Try again in ${minutesLeft} minutes`);
    }

    // Check if account is suspended
    if (user.isSuspended) {
      throw new AuthError('Account is suspended');
    }

    // Check if account is active
    if (!user.active) {
      throw new AuthError('Account is inactive');
    }

    // ✅ Verify password (now user.password is available)
    const isPasswordValid = await user.comparePassword(password);

    if (!isPasswordValid) {
      // Increment failed login attempts
      await user.incrementLoginAttempts();
      throw new AuthError('Invalid email or password');
    }

    // Reset login attempts on successful login
    await user.resetLoginAttempts();

    // Record login
    await user.recordLogin(req.ip);
    console.log(`✓ User logged in: ${user.username}`);

    // Generate tokens
    const token = generateToken(user);
    const refreshToken = generateRefreshToken(user);

    // Cache session and refresh token
    const sessionId = uuid.v4();
    await cacheSession(`session:${sessionId}`, {
      userId: user._id,
      token,
      refreshToken,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
    });

    await cacheSet(
      `refresh_token:${user._id}`,
      refreshToken,
      7 * 24 * 60 * 60 // 7 days
    );

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        user: user.getDashboardProfile(),
        token,
        refreshToken,
        sessionId
      }
    });
  } catch (error) {
    console.error('❌ Login error:', error.message);
    throw error;
  }
});

/**
 * ✅ NEW: Request OTP for login
 * Step 1: Verify password, then send OTP to email
 * 
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
const requestLoginOTP = asyncHandler(async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      throw new ValidationError('Email and password are required');
    }

    console.log(`🔐 OTP login requested for: ${email}`);

    // Find user with password
    const user = await User.findOne({ 
      email: email.toLowerCase() 
    }).select('+password +active +suspended +lockoutUntil +loginAttempts');

    if (!user) {
      throw new AuthError('Invalid credentials');
    }

    // Check account status
    if (user.isLocked) {
      const minutesLeft = Math.ceil((user.lockoutUntil - new Date()) / (1000 * 60));
      throw new AuthError(`Account locked. Try again in ${minutesLeft} minutes`);
    }

    if (user.isSuspended) {
      throw new AuthError('Account is suspended');
    }

    if (!user.active) {
      throw new AuthError('Account is inactive');
    }

    // Verify password first
    const isPasswordValid = await user.comparePassword(password);

    if (!isPasswordValid) {
      await user.incrementLoginAttempts();
      throw new AuthError('Invalid credentials');
    }

    // Generate OTP
    const { otp, expiresAt } = OTPService.generateOTPWithExpiry(10); // 10 minutes
    const hashedOTP = OTPService.hashOTP(otp);

    // Store OTP
    user.loginOTP = hashedOTP;
    user.loginOTPExpires = expiresAt;
    user.otpAttempts = 0;
    await user.save();

    // Send OTP via email
    try {
      await sendEmail({
        to: user.email,
        subject: '🔐 Your Login OTP - Privacy Data Vault',
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
              .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
              .otp-box { background: white; border: 2px dashed #667eea; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #667eea; margin: 20px 0; border-radius: 8px; }
              .info { background: #e7f3ff; border-left: 4px solid #2196F3; padding: 15px; margin: 20px 0; }
              .footer { text-align: center; color: #999; font-size: 12px; margin-top: 20px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>🔐 Login OTP</h1>
              </div>
              <div class="content">
                <p>Hello <strong>${user.username}</strong>,</p>
                <p>Your One-Time Password (OTP) for login is:</p>
                
                <div class="otp-box">${otp}</div>
                
                <div class="info">
                  <strong>⏱️ Valid for 10 minutes</strong><br>
                  This OTP will expire at ${expiresAt.toLocaleString()}
                </div>
                
                <p><strong>Security Tips:</strong></p>
                <ul>
                  <li>Never share this OTP with anyone</li>
                  <li>We will never ask for your OTP via phone or SMS</li>
                  <li>If you didn't request this, please secure your account immediately</li>
                </ul>
                
                <div class="footer">
                  <p>This is an automated message from Privacy Data Vault</p>
                  <p>© ${new Date().getFullYear()} Privacy Data Vault. All rights reserved.</p>
                </div>
              </div>
            </div>
          </body>
          </html>
        `
      });

      console.log(`✓ OTP sent to: ${user.email}`);
    } catch (error) {
      console.error('Failed to send OTP email:', error);
      throw new Error('Failed to send OTP. Please try again.');
    }

    res.status(200).json({
      success: true,
      message: 'OTP sent to your email',
      data: {
        email: user.email,
        expiresIn: 600, // 10 minutes in seconds
        maskedEmail: user.email.replace(/(.{2})(.*)(@.*)/, '$1***$3')
      }
    });
  } catch (error) {
    console.error('❌ Request OTP error:', error.message);
    throw error;
  }
});

/**
 * ✅ NEW: Verify OTP and complete login
 * Step 2: Verify OTP and issue tokens
 * 
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
const verifyLoginOTP = asyncHandler(async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      throw new ValidationError('Email and OTP are required');
    }

    console.log(`🔓 OTP verification for: ${email}`);

    // Find user with OTP fields
    const user = await User.findOne({ 
      email: email.toLowerCase() 
    }).select('+loginOTP +loginOTPExpires +otpAttempts');

    if (!user || !user.loginOTP) {
      throw new AuthError('Invalid or expired OTP');
    }

    // Check if OTP is expired
    if (OTPService.isExpired(user.loginOTPExpires)) {
      user.loginOTP = null;
      user.loginOTPExpires = null;
      user.otpAttempts = 0;
      await user.save();
      throw new AuthError('OTP has expired. Please request a new one.');
    }

    // Verify OTP
    const isOTPValid = OTPService.verifyOTP(otp, user.loginOTP);

    if (!isOTPValid) {
      user.otpAttempts += 1;
      await user.save();

      if (user.otpAttempts >= 3) {
        user.loginOTP = null;
        user.loginOTPExpires = null;
        user.otpAttempts = 0;
        await user.save();
        throw new AuthError('Too many incorrect OTP attempts. Please request a new OTP.');
      }

      throw new AuthError(`Invalid OTP. ${3 - user.otpAttempts} attempts remaining.`);
    }

    // OTP is valid - clear OTP fields
    user.loginOTP = null;
    user.loginOTPExpires = null;
    user.otpAttempts = 0;
    await user.recordLogin(req.ip);

    // Generate tokens
    const token = generateToken(user);
    const refreshToken = generateRefreshToken(user);

    // Cache session
    const sessionId = uuid.v4();
    await cacheSession(`session:${sessionId}`, {
      userId: user._id,
      token,
      refreshToken,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
    });

    await cacheSet(
      `refresh_token:${user._id}`,
      refreshToken,
      7 * 24 * 60 * 60
    );

    console.log(`✓ OTP login successful for: ${user.email}`);

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        user: user.getDashboardProfile(),
        token: token,
        refreshToken: refreshToken,
        sessionId
      }
    });
  } catch (error) {
    console.error('❌ Verify OTP error:', error.message);
    throw error;
  }
});

/**
 * Verify email
 * 
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
const verifyEmail = asyncHandler(async (req, res) => {
  try {
    const { token } = req.params;

    console.log(`📧 Email verification attempt: ${token.substring(0, 10)}...`);

    // Find user by verification token
    const user = await User.findOne({ verificationToken: token });

    if (!user) {
      throw new AuthError('Invalid or expired verification token');
    }

    // Mark email as verified
    user.verified = true;
    user.verificationToken = null;
    await user.save();

    // Invalidate user cache
    await invalidateUserCache(user._id.toString());

    console.log(`✓ Email verified: ${user.email}`);

    res.status(200).json({
      success: true,
      message: 'Email verified successfully',
      data: {
        user: user.getDashboardProfile()
      }
    });
  } catch (error) {
    console.error('❌ Email verification error:', error.message);
    throw error;
  }
});

/**
 * Resend verification email
 * 
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
const resendVerificationEmail = asyncHandler(async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      throw new ValidationError('Email is required', { email: 'Email is required' });
    }

    console.log(`📧 Resend verification email: ${email}`);

    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      // Don't reveal if user exists for security
      return res.status(200).json({
        success: true,
        message: 'If email exists, verification link has been sent'
      });
    }

    if (user.verified) {
      return res.status(200).json({
        success: true,
        message: 'Email already verified'
      });
    }

    // Generate new verification token
    const verificationToken = user.generateVerificationToken();
    await user.save();

    // Cache token
    await cacheSet(
      `verify_token:${verificationToken}`,
      user._id.toString(),
      86400
    );

    // Send email
    await sendVerificationEmail(
      user.email,
      user.username,
      verificationToken,
      BASE_URL
    );

    console.log(`✓ Verification email resent to ${user.email}`);

    res.status(200).json({
      success: true,
      message: 'Verification email sent'
    });
  } catch (error) {
    console.error('❌ Resend verification error:', error.message);
    throw error;
  }
});

/**
 * Request password reset
 * 
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
const forgotPassword = asyncHandler(async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      throw new ValidationError('Email is required', { email: 'Email is required' });
    }

    console.log(`🔑 Password reset request: ${email}`);

    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      // Don't reveal if user exists for security
      return res.status(200).json({
        success: true,
        message: 'If email exists, password reset link has been sent'
      });
    }

    // Generate reset token
    const resetToken = user.generateResetToken();
    await user.save();

    // Cache reset token
    await cacheSet(
      `reset_token:${resetToken}`,
      user._id.toString(),
      3600 // 1 hour
    );

    // Send email
    await sendPasswordResetEmail(
      user.email,
      user.username,
      resetToken,
      BASE_URL
    );

    console.log(`✓ Password reset email sent to ${user.email}`);

    res.status(200).json({
      success: true,
      message: 'Password reset link sent to email'
    });
  } catch (error) {
    console.error('❌ Forgot password error:', error.message);
    throw error;
  }
});

/**
 * Reset password
 * 
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
const resetPassword = asyncHandler(async (req, res) => {
  try {
    const { token, password, confirmPassword } = req.body;

    if (!token || !password) {
      throw new ValidationError('Token and password are required', {
        token: !token ? 'Token is required' : undefined,
        password: !password ? 'Password is required' : undefined
      });
    }

    if (password !== confirmPassword) {
      throw new ValidationError('Passwords do not match', {
        confirmPassword: 'Passwords do not match'
      });
    }

    console.log(`🔑 Password reset: ${token.substring(0, 10)}...`);

    // Find user
    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: new Date() }
    });

    if (!user) {
      throw new AuthError('Invalid or expired password reset token');
    }

    // Update password (will be hashed by pre-save hook)
    user.password = password;
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;
    await user.save();

    // Invalidate all user sessions
    await invalidateUserCache(user._id.toString());

    console.log(`✓ Password reset for user: ${user.username}`);

    res.status(200).json({
      success: true,
      message: 'Password reset successfully',
      data: {
        user: user.getDashboardProfile()
      }
    });
  } catch (error) {
    console.error('❌ Reset password error:', error.message);
    throw error;
  }
});

/**
 * Refresh token
 * 
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
const refreshAccessToken = asyncHandler(async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      throw new AuthError('Refresh token is required');
    }

    console.log(`🔄 Token refresh attempt`);

    // Get user from middleware (if already validated)
    if (req.tokens) {
      return res.status(200).json({
        success: true,
        message: 'Token refreshed',
        data: {
          token: req.tokens.token,
          refreshToken: req.tokens.refreshToken
        }
      });
    }

    // Manual validation if not in middleware
    const user = await User.findById(req.user?.id);

    if (!user) {
      throw new AuthError('User not found');
    }

    const newToken = generateToken(user);
    const newRefreshToken = generateRefreshToken(user);

    // Cache new refresh token
    await cacheSet(
      `refresh_token:${user._id}`,
      newRefreshToken,
      7 * 24 * 60 * 60
    );

    console.log(`✓ Token refreshed for user: ${user.username}`);

    res.status(200).json({
      success: true,
      message: 'Token refreshed',
      data: {
        token: newToken,
        refreshToken: newRefreshToken
      }
    });
  } catch (error) {
    console.error('❌ Token refresh error:', error.message);
    throw error;
  }
});

/**
 * Logout user
 * 
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
const logout = asyncHandler(async (req, res) => {
  try {
    if (!req.user) {
      throw new AuthError('User not authenticated');
    }

    console.log(`👋 User logout: ${req.user.username}`);

    // Invalidate refresh token
    await cacheDel(`refresh_token:${req.user.id}`);

    // Invalidate user cache
    await invalidateUserCache(req.user.id);

    res.status(200).json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    console.error('❌ Logout error:', error.message);
    throw error;
  }
});

/**
 * Get current user
 * 
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
const getCurrentUser = asyncHandler(async (req, res) => {
  try {
    if (!req.user) {
      throw new AuthError('User not authenticated');
    }

    const user = await User.findById(req.user.id);

    if (!user) {
      throw new AuthError('User not found');
    }

    res.status(200).json({
      success: true,
      data: {
        user: user.getDashboardProfile()
      }
    });
  } catch (error) {
    console.error('❌ Get current user error:', error.message);
    throw error;
  }
});

// Export controller functions
module.exports = {
  register,
  login,
  requestLoginOTP,    // ✅ NEW
  verifyLoginOTP,     // ✅ NEW
  verifyEmail,
  resendVerificationEmail,
  forgotPassword,
  resetPassword,
  refreshAccessToken,
  logout,
  getCurrentUser
};
