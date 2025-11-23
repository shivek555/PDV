/**
 * ADMIN CONTROLLER
 * 
 * Handles administrative operations
 * Features:
 * - User management
 * - System monitoring
 * - Audit logging
 * - Statistics
 * - Settings management
 */

const User = require('../models/User');
const Vault = require('../models/Vault');
const { asyncHandler, NotFoundError, AuthorizationError, ValidationError } = require('../middleware/errorHandler');
const { getRedisInfo, getMemoryStats } = require('../config/redis');
const { checkDatabaseHealth, getDatabaseStats } = require('../config/db');

const NODE_ENV = process.env.NODE_ENV || 'development';

/**
 * Get all users
 * Admin only - retrieves all users with pagination
 * 
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
const getAllUsers = asyncHandler(async (req, res) => {
  try {
    const { page = 1, limit = 10, role, search, verified } = req.query;

    console.log(`👥 Fetching all users (admin requested by ${req.user.username})`);

    // Build query
    let query = User.find();

    if (role) {
      query = query.find({ role });
    }

    if (verified !== undefined) {
      query = query.find({ verified: verified === 'true' });
    }

    if (search) {
      query = query.find({
        $or: [
          { username: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { firstName: { $regex: search, $options: 'i' } },
          { lastName: { $regex: search, $options: 'i' } }
        ]
      });
    }

    // Pagination
    const skip = (page - 1) * limit;
    const users = await query
      .skip(skip)
      .limit(limit)
      .select('-password -resetPasswordToken -verificationToken')
      .lean();

    const total = await User.countDocuments(query.getFilter());

    console.log(`✓ Retrieved ${users.length} users`);

    res.status(200).json({
      success: true,
      data: {
        users: users.map(u => ({
          ...u,
          isLocked: u.lockoutUntil && u.lockoutUntil > new Date(),
          isSuspended: u.suspended && (!u.suspendedUntil || u.suspendedUntil > new Date())
        })),
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('❌ Get all users error:', error.message);
    throw error;
  }
});

/**
 * Get user by ID
 * 
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
const getUserById = asyncHandler(async (req, res) => {
  try {
    const { userId } = req.params;

    console.log(`👤 Fetching user: ${userId}`);

    const user = await User.findById(userId)
      .select('-password -resetPasswordToken -verificationToken');

    if (!user) {
      throw new NotFoundError('User');
    }

    const userVaults = await Vault.countDocuments({ userId });
    const sharedVaults = await Vault.countDocuments({
      'accessControl.sharedWith.userId': userId
    });

    res.status(200).json({
      success: true,
      data: {
        user: {
          ...user.toObject(),
          stats: {
            vaults: userVaults,
            sharedVaults,
            accountAge: user.accountAge,
            lastLogin: user.lastLogin
          }
        }
      }
    });
  } catch (error) {
    console.error('❌ Get user error:', error.message);
    throw error;
  }
});

/**
 * Suspend user account
 * 
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
const suspendUser = asyncHandler(async (req, res) => {
  try {
    const { userId } = req.params;
    const { reason, duration } = req.body;

    if (!reason) {
      throw new ValidationError('Reason is required', { reason: 'Reason is required' });
    }

    console.log(`🚫 Suspending user: ${userId}`);

    const user = await User.findById(userId);

    if (!user) {
      throw new NotFoundError('User');
    }

    // Prevent suspending superadmin
    if (user.role === 'superadmin') {
      throw new AuthorizationError('Cannot suspend superadmin users');
    }

    user.suspended = true;
    user.suspensionReason = reason;
    
    if (duration) {
      user.suspendedUntil = new Date(Date.now() + duration * 1000);
    }

    await user.save();

    console.log(`✓ User suspended: ${userId}`);

    res.status(200).json({
      success: true,
      message: 'User suspended successfully',
      data: { user: user.getDashboardProfile() }
    });
  } catch (error) {
    console.error('❌ Suspend user error:', error.message);
    throw error;
  }
});

/**
 * Unsuspend user account
 * 
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
const unsuspendUser = asyncHandler(async (req, res) => {
  try {
    const { userId } = req.params;

    console.log(`✓ Unsuspending user: ${userId}`);

    const user = await User.findById(userId);

    if (!user) {
      throw new NotFoundError('User');
    }

    user.suspended = false;
    user.suspensionReason = null;
    user.suspendedUntil = null;
    await user.save();

    console.log(`✓ User unsuspended: ${userId}`);

    res.status(200).json({
      success: true,
      message: 'User unsuspended successfully',
      data: { user: user.getDashboardProfile() }
    });
  } catch (error) {
    console.error('❌ Unsuspend user error:', error.message);
    throw error;
  }
});

/**
 * Change user role
 * 
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
const changeUserRole = asyncHandler(async (req, res) => {
  try {
    const { userId } = req.params;
    const { newRole } = req.body;

    if (!newRole) {
      throw new ValidationError('New role is required', { newRole: 'New role is required' });
    }

    const validRoles = ['user', 'moderator', 'admin', 'superadmin'];
    if (!validRoles.includes(newRole)) {
      throw new ValidationError('Invalid role', { newRole: `Role must be one of: ${validRoles.join(', ')}` });
    }

    console.log(`👤 Changing user ${userId} role to ${newRole}`);

    const user = await User.findById(userId);

    if (!user) {
      throw new NotFoundError('User');
    }

    const oldRole = user.role;
    user.role = newRole;
    await user.save();

    console.log(`✓ User role changed: ${userId} (${oldRole} -> ${newRole})`);

    res.status(200).json({
      success: true,
      message: `User role changed from ${oldRole} to ${newRole}`,
      data: { user: user.getDashboardProfile() }
    });
  } catch (error) {
    console.error('❌ Change user role error:', error.message);
    throw error;
  }
});

/**
 * Delete user account
 * 
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
const deleteUser = asyncHandler(async (req, res) => {
  try {
    const { userId } = req.params;
    const { permanent = false } = req.body;

    console.log(`🗑️  Deleting user: ${userId} (permanent: ${permanent})`);

    const user = await User.findById(userId);

    if (!user) {
      throw new NotFoundError('User');
    }

    if (permanent) {
      // Hard delete
      await User.findByIdAndDelete(userId);
      // Also delete all vaults
      await Vault.deleteMany({ userId });
      console.log(`✓ User permanently deleted: ${userId}`);
    } else {
      // Soft delete - mark as inactive
      user.active = false;
      await user.save();
      console.log(`✓ User deactivated: ${userId}`);
    }

    res.status(200).json({
      success: true,
      message: permanent ? 'User deleted permanently' : 'User deactivated'
    });
  } catch (error) {
    console.error('❌ Delete user error:', error.message);
    throw error;
  }
});

/**
 * Get system statistics
 * 
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
const getSystemStats = asyncHandler(async (req, res) => {
  try {
    console.log(`📊 Fetching system statistics`);

    // User stats
    const totalUsers = await User.countDocuments();
    const verifiedUsers = await User.countDocuments({ verified: true });
    const activeUsers = await User.countDocuments({ active: true });
    const suspendedUsers = await User.countDocuments({ suspended: true });

    // Role breakdown
    const usersByRole = await User.aggregate([
      { $group: { _id: '$role', count: { $sum: 1 } } }
    ]);

    // Vault stats
    const totalVaults = await Vault.countDocuments();
    const activeVaults = await Vault.countDocuments({ status: 'active' });
    const archivedVaults = await Vault.countDocuments({ archived: true });

    // Category breakdown
    const vaultsByCategory = await Vault.aggregate([
      { $group: { _id: '$category', count: { $sum: 1 } } }
    ]);

    // Database stats
    const dbHealth = await checkDatabaseHealth();
    const dbStats = await getDatabaseStats();

    // Redis stats
    const redisInfo = await getRedisInfo();
    const memoryStats = await getMemoryStats();

    const stats = {
      users: {
        total: totalUsers,
        verified: verifiedUsers,
        active: activeUsers,
        suspended: suspendedUsers,
        byRole: usersByRole.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {})
      },
      vaults: {
        total: totalVaults,
        active: activeVaults,
        archived: archivedVaults,
        byCategory: vaultsByCategory.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {})
      },
      database: {
        healthy: dbHealth.healthy,
        ...dbHealth.connection
      },
      cache: {
        connected: redisInfo.connected,
        memory: memoryStats
      },
      timestamp: new Date().toISOString()
    };

    res.status(200).json({
      success: true,
      data: { stats }
    });
  } catch (error) {
    console.error('❌ Get system stats error:', error.message);
    throw error;
  }
});

/**
 * Get system health
 * 
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
const getSystemHealth = asyncHandler(async (req, res) => {
  try {
    console.log(`🏥 Checking system health`);

    const dbHealth = await checkDatabaseHealth();
    const redisInfo = await getRedisInfo();

    const health = {
      status: dbHealth.healthy && redisInfo.connected ? 'healthy' : 'degraded',
      services: {
        database: {
          status: dbHealth.healthy ? 'up' : 'down',
          details: dbHealth.connection
        },
        cache: {
          status: redisInfo.connected ? 'up' : 'down',
          timestamp: redisInfo.timestamp
        }
      },
      timestamp: new Date().toISOString()
    };

    res.status(200).json({
      success: true,
      data: { health }
    });
  } catch (error) {
    console.error('❌ Get system health error:', error.message);
    throw error;
  }
});

/**
 * Get activity log
 * 
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
const getActivityLog = asyncHandler(async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;

    console.log(`📜 Fetching activity log`);

    // Get recent vault activities
    const skip = (page - 1) * limit;
    const vaults = await Vault.find()
      .select('activityLog')
      .skip(skip)
      .limit(limit)
      .lean();

    const activities = [];
    vaults.forEach(vault => {
      vault.activityLog?.forEach(log => {
        activities.push({
          vaultId: vault._id,
          ...log
        });
      });
    });

    // Sort by date descending
    activities.sort((a, b) => new Date(b.performedAt) - new Date(a.performedAt));

    res.status(200).json({
      success: true,
      data: {
        activities: activities.slice(0, limit),
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: activities.length
        }
      }
    });
  } catch (error) {
    console.error('❌ Get activity log error:', error.message);
    throw error;
  }
});

/**
 * Export system data
 * 
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
const exportSystemData = asyncHandler(async (req, res) => {
  try {
    const { dataType = 'all' } = req.query;

    console.log(`📤 Exporting system data: ${dataType}`);

    const exportData = {
      timestamp: new Date().toISOString(),
      environment: NODE_ENV
    };

    if (dataType === 'users' || dataType === 'all') {
      exportData.users = await User.find().select('-password').lean();
    }

    if (dataType === 'vaults' || dataType === 'all') {
      exportData.vaults = await Vault.find().lean();
    }

    if (dataType === 'stats' || dataType === 'all') {
      const totalUsers = await User.countDocuments();
      const totalVaults = await Vault.countDocuments();
      exportData.stats = {
        totalUsers,
        totalVaults,
        timestamp: new Date().toISOString()
      };
    }

    res.set('Content-Type', 'application/json');
    res.set('Content-Disposition', `attachment; filename="export-${Date.now()}.json"`);
    res.json(exportData);

    console.log(`✓ System data exported`);
  } catch (error) {
    console.error('❌ Export system data error:', error.message);
    throw error;
  }
});

// Export controller functions
module.exports = {
  getAllUsers,
  getUserById,
  suspendUser,
  unsuspendUser,
  changeUserRole,
  deleteUser,
  getSystemStats,
  getSystemHealth,
  getActivityLog,
  exportSystemData
};
