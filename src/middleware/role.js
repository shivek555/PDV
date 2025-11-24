/**
 * ROLE-BASED ACCESS CONTROL (RBAC) MIDDLEWARE
 * 
 * Implements role-based authorization
 * Features:
 * - Role checking
 * - Permission verification
 * - Resource ownership validation
 * - Access denial logging
 */

const User = require('../models/User');

// Role hierarchy
const ROLE_HIERARCHY = {
  superadmin: 4,
  admin: 3,
  moderator: 2,
  user: 1
};

// Role permissions mapping
const ROLE_PERMISSIONS = {
  superadmin: [
    'read_vault',
    'create_vault',
    'update_vault',
    'delete_vault',
    'share_vault',
    'manage_users',
    'view_logs',
    'manage_system',
    'manage_permissions'
  ],
  admin: [
    'read_vault',
    'create_vault',
    'update_vault',
    'delete_vault',
    'share_vault',
    'manage_users',
    'view_logs'
  ],
  moderator: [
    'read_vault',
    'create_vault',
    'update_vault',
    'delete_vault',
    'share_vault',
    'view_logs'
  ],
  user: [
    'read_vault',
    'create_vault',
    'update_vault',
    'delete_vault',
    'share_vault'
  ]
};

/**
 * Check if user has required role(s)
 * Middleware factory that returns middleware function
 * 
 * @param {string|Array} requiredRoles - Role(s) required
 * @returns {Function} Middleware function
 */
function roleMiddleware(requiredRoles) {
  return async (req, res, next) => {
    try {
      // Ensure user is authenticated
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required',
          code: 'NOT_AUTHENTICATED'
        });
      }

      // Normalize to array
      const rolesArray = Array.isArray(requiredRoles) ? requiredRoles : [requiredRoles];

      // Get current user from database for latest role info
      const user = await User.findById(req.user.id);

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found',
          code: 'USER_NOT_FOUND'
        });
      }

      // Check if user has required role
      if (!rolesArray.includes(user.role)) {
        console.warn(`⚠️  Access denied for user ${user.username}: required role(s) ${rolesArray.join(', ')}, has ${user.role}`);

        return res.status(403).json({
          success: false,
          message: 'Insufficient permissions',
          code: 'INSUFFICIENT_ROLE',
          requiredRoles: rolesArray,
          userRole: user.role
        });
      }

      // Update user info in request
      req.user.role = user.role;
      req.user.permissions = user.permissions || [];

      console.log(`✓ Role check passed for user ${user.username}: ${user.role}`);
      next();
    } catch (error) {
      console.error('❌ Role middleware error:', error.message);
      res.status(500).json({
        success: false,
        message: 'Authorization error',
        code: 'AUTH_ERROR'
      });
    }
  };
}

/**
 * Check if user has required permission(s)
 * 
 * @param {string|Array} requiredPermissions - Permission(s) required
 * @returns {Function} Middleware function
 */
function permissionMiddleware(requiredPermissions) {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required',
          code: 'NOT_AUTHENTICATED'
        });
      }

      const user = await User.findById(req.user.id);

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found',
          code: 'USER_NOT_FOUND'
        });
      }

      // Normalize to array
      const permissionsArray = Array.isArray(requiredPermissions) 
        ? requiredPermissions 
        : [requiredPermissions];

      // Get user's permissions (from role + custom)
      const userPermissions = [
        ...getRolePermissions(user.role),
        ...user.permissions
      ];

      // Remove duplicates
      const uniquePermissions = [...new Set(userPermissions)];

      // Check if user has all required permissions
      const hasPermission = permissionsArray.every(perm => 
        uniquePermissions.includes(perm)
      );

      if (!hasPermission) {
        console.warn(`⚠️  Permission denied for user ${user.username}: required ${permissionsArray.join(', ')}`);

        return res.status(403).json({
          success: false,
          message: 'Permission denied',
          code: 'PERMISSION_DENIED',
          requiredPermissions: permissionsArray
        });
      }

      req.user.permissions = uniquePermissions;
      console.log(`✓ Permission check passed for user ${user.username}`);
      next();
    } catch (error) {
      console.error('❌ Permission middleware error:', error.message);
      res.status(500).json({
        success: false,
        message: 'Authorization error',
        code: 'AUTH_ERROR'
      });
    }
  };
}

/**
 * Verify resource ownership
 * Ensures user owns the resource they're trying to access
 * 
 * @param {string} modelName - Model name (User, Vault, etc.)
 * @param {string} paramName - URL parameter name (id, vaultId, etc.)
 * @param {string} ownerField - Field in model that indicates owner
 * @returns {Function} Middleware function
 */
function ownershipMiddleware(modelName, paramName = 'id', ownerField = 'userId') {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required',
          code: 'NOT_AUTHENTICATED'
        });
      }

      const resourceId = req.params[paramName];

      if (!resourceId) {
        return res.status(400).json({
          success: false,
          message: `Missing ${paramName} parameter`,
          code: 'MISSING_PARAM'
        });
      }

      // Import model dynamically
      let Model;
      try {
        Model = require(`../models/${modelName}`);
      } catch (error) {
        return res.status(500).json({
          success: false,
          message: `Model ${modelName} not found`,
          code: 'MODEL_NOT_FOUND'
        });
      }

      const resource = await Model.findById(resourceId);

      if (!resource) {
        return res.status(404).json({
          success: false,
          message: `${modelName} not found`,
          code: 'RESOURCE_NOT_FOUND'
        });
      }

      // Check ownership
      const owner = resource[ownerField];
      const isOwner = owner.toString() === req.user.id.toString();

      // Allow access if owner or admin
      const user = await User.findById(req.user.id);
      const isAdmin = ['admin', 'superadmin'].includes(user.role);

      if (!isOwner && !isAdmin) {
        console.warn(`⚠️  Access denied for user ${req.user.username}: not owner of ${modelName}`);

        return res.status(403).json({
          success: false,
          message: 'You do not have permission to access this resource',
          code: 'NOT_OWNER'
        });
      }

      // Attach resource to request
      req.resource = resource;

      console.log(`✓ Ownership verified for user ${req.user.username} on ${modelName}`);
      next();
    } catch (error) {
      console.error('❌ Ownership middleware error:', error.message);
      res.status(500).json({
        success: false,
        message: 'Authorization error',
        code: 'AUTH_ERROR'
      });
    }
  };
}

/**
 * Allow only specific roles to access resource
 * More restrictive variant of roleMiddleware
 * 
 * @param {Array} allowedRoles - Only these roles can access
 * @returns {Function} Middleware function
 */
function restrictToRoles(allowedRoles) {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required',
          code: 'NOT_AUTHENTICATED'
        });
      }

      const user = await User.findById(req.user.id);

      if (!allowedRoles.includes(user.role)) {
        console.warn(`⚠️  Access restricted for user ${user.username}: role ${user.role} not allowed`);

        return res.status(403).json({
          success: false,
          message: 'Access restricted to specific roles',
          code: 'ROLE_RESTRICTED',
          allowedRoles
        });
      }

      next();
    } catch (error) {
      console.error('❌ Role restriction error:', error.message);
      res.status(500).json({
        success: false,
        message: 'Authorization error',
        code: 'AUTH_ERROR'
      });
    }
  };
}

/**
 * Get permissions for a role
 * 
 * @param {string} role - User role
 * @returns {Array} Permissions array
 */
function getRolePermissions(role) {
  return ROLE_PERMISSIONS[role] || [];
}

/**
 * Check if role1 has higher or equal privilege than role2
 * 
 * @param {string} role1 - First role
 * @param {string} role2 - Second role
 * @returns {boolean}
 */
function hasHigherOrEqualPrivilege(role1, role2) {
  return ROLE_HIERARCHY[role1] >= ROLE_HIERARCHY[role2];
}

/**
 * Check if role has permission
 * 
 * @param {string} role - User role
 * @param {string} permission - Permission to check
 * @returns {boolean}
 */
function roleHasPermission(role, permission) {
  return getRolePermissions(role).includes(permission);
}

/**
 * Get role hierarchy level
 * 
 * @param {string} role - User role
 * @returns {number}
 */
function getRoleLevel(role) {
  return ROLE_HIERARCHY[role] || 0;
}

/**
 * Require minimum role level
 * 
 * @param {number} minLevel - Minimum hierarchy level
 * @returns {Function} Middleware function
 */
function requireRoleLevel(minLevel) {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required',
          code: 'NOT_AUTHENTICATED'
        });
      }

      const user = await User.findById(req.user.id);
      const userLevel = getRoleLevel(user.role);

      if (userLevel < minLevel) {
        console.warn(`⚠️  Insufficient role level for user ${user.username}: required ${minLevel}, has ${userLevel}`);

        return res.status(403).json({
          success: false,
          message: 'Insufficient role level',
          code: 'INSUFFICIENT_ROLE_LEVEL',
          requiredLevel: minLevel,
          userLevel
        });
      }

      next();
    } catch (error) {
      console.error('❌ Role level check error:', error.message);
      res.status(500).json({
        success: false,
        message: 'Authorization error',
        code: 'AUTH_ERROR'
      });
    }
  };
}

/**
 * Require specific permissions with AND logic (all required)
 * 
 * @param {Array} permissions - All permissions required
 * @returns {Function} Middleware function
 */
function requireAllPermissions(permissions) {
  return permissionMiddleware(permissions);
}

/**
 * Require specific permissions with OR logic (any required)
 * 
 * @param {Array} permissions - Any of these permissions required
 * @returns {Function} Middleware function
 */
function requireAnyPermission(permissions) {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required',
          code: 'NOT_AUTHENTICATED'
        });
      }

      const user = await User.findById(req.user.id);
      const userPermissions = [
        ...getRolePermissions(user.role),
        ...user.permissions
      ];

      const hasAnyPermission = permissions.some(perm => 
        userPermissions.includes(perm)
      );

      if (!hasAnyPermission) {
        console.warn(`⚠️  Permission denied for user ${user.username}: requires any of ${permissions.join(', ')}`);

        return res.status(403).json({
          success: false,
          message: 'Permission denied',
          code: 'PERMISSION_DENIED',
          requiredPermissions: permissions
        });
      }

      req.user.permissions = userPermissions;
      next();
    } catch (error) {
      console.error('❌ Any permission check error:', error.message);
      res.status(500).json({
        success: false,
        message: 'Authorization error',
        code: 'AUTH_ERROR'
      });
    }
  };
}

// Export functions
module.exports = {
  roleMiddleware,
  permissionMiddleware,
  ownershipMiddleware,
  restrictToRoles,
  requireRoleLevel,
  requireAllPermissions,
  requireAnyPermission,
  getRolePermissions,
  hasHigherOrEqualPrivilege,
  roleHasPermission,
  getRoleLevel,
  ROLE_HIERARCHY,
  ROLE_PERMISSIONS
};
