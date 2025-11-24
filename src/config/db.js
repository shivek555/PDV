// src/config/db.js
const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

// Prefer Atlas SRV; fallback to legacy var, then local
const DB_URI =
  process.env.MONGODB_URI ||
  process.env.MONGO_URI ||
  'mongodb://127.0.0.1:27017/privacy-vault';

const MONGO_OPTIONS = {
  maxPoolSize: 10,
  minPoolSize: 5,
  retryWrites: true,
  w: 'majority',
  connectTimeoutMS: 10000,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
  maxIdleTimeMS: 60000,
  family: 4
};

// Mask credentials in logs for mongodb / mongodb+srv
function mask(uri) {
  try {
    return uri.replace(
      /(mongodb(\+srv)?:\/\/)([^:\/?#]+):([^@]+)@/i,
      (_m, pfx, _srv, user) => `${pfx}${user}:****@`
    );
  } catch {
    return uri;
  }
}

/**
 * Connect to MongoDB
 */
async function connectDB() {
  try {
    console.log('🔗 Attempting MongoDB connection...');
    console.log(`📍 Connection URI: ${mask(DB_URI)}`);

    const connection = await mongoose.connect(DB_URI, MONGO_OPTIONS);

    console.log('✅ MongoDB connected successfully');
    console.log(`   Host: ${connection.connection.host}`);
    console.log(`   Database: ${connection.connection.name}`);
    console.log(`   Port: ${connection.connection.port}`);

    setupConnectionHandlers();
    return connection;
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    throw error;
  }
}

/**
 * Setup MongoDB connection event handlers
 */
function setupConnectionHandlers() {
  mongoose.connection.on('connected', () => {
    console.log('✅ Mongoose connected to MongoDB');
  });

  mongoose.connection.on('disconnected', () => {
    console.warn('⚠️  Mongoose disconnected from MongoDB');
  });

  mongoose.connection.on('error', (error) => {
    console.error('❌ MongoDB connection error:', error.message);
  });

  mongoose.connection.on('reconnected', () => {
    console.log('🔄 Mongoose reconnected to MongoDB');
  });

  mongoose.connection.on('timeout', () => {
    console.error('❌ MongoDB connection timeout');
  });
}

/**
 * Disconnect from MongoDB
 */
async function disconnectDB() {
  try {
    await mongoose.disconnect();
    console.log('✅ MongoDB disconnected');
  } catch (error) {
    console.error('❌ Error disconnecting from MongoDB:', error.message);
    throw error;
  }
}

/**
 * Connection status
 */
function getConnectionStatus() {
  return {
    connected: mongoose.connection.readyState === 1,
    readyState: mongoose.connection.readyState,
    host: mongoose.connection.host,
    port: mongoose.connection.port,
    database: mongoose.connection.name,
    models: Object.keys(mongoose.modelNames()),
    timestamp: new Date().toISOString()
  };
}

/**
 * Create indexes (avoid duplicates already defined in schemas)
 */
async function createIndexes() {
  try {
    console.log('📑 Creating database indexes...');

    const User = require('../models/User');
    const Vault = require('../models/Vault');

    // User indexes
    await User.collection.createIndex({ email: 1 }, { unique: true });
    await User.collection.createIndex({ username: 1 }, { unique: true });
    await User.collection.createIndex({ createdAt: 1 });
    await User.collection.createIndex({ role: 1 });
    await User.collection.createIndex({ verified: 1 });

    // Vault indexes
    await Vault.collection.createIndex({ userId: 1 });
    await Vault.collection.createIndex({ userId: 1, category: 1 });
    await Vault.collection.createIndex({ createdAt: 1 });
    // IMPORTANT: remove duplicate if schema also defines this index to avoid warnings
    // await Vault.collection.createIndex({ dataHash: 1 });
    await Vault.collection.createIndex({ 'metadata.tags': 1 });
    await Vault.collection.createIndex({ 'metadata.confidentiality': 1 });

    console.log('✅ Database indexes created successfully');
  } catch (error) {
    console.error('⚠️  Error creating indexes:', error.message);
  }
}

/**
 * DB health check
 */
async function checkDatabaseHealth() {
  try {
    const status = getConnectionStatus();
    if (!status.connected) throw new Error('Database not connected');

    const adminDb = mongoose.connection.db.admin();
    const pingResult = await adminDb.ping();

    return {
      healthy: true,
      message: 'Database is healthy',
      connection: status,
      ping: pingResult,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return {
      healthy: false,
      message: 'Database health check failed',
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Danger zone helpers (dev only)
 */
async function dropAllCollections() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('❌ Cannot drop collections in production environment');
  }
  try {
    console.warn('⚠️  Dropping all database collections...');
    const collections = mongoose.connection.collections;
    for (const key in collections) {
      const collection = collections[key];
      await collection.deleteMany({});
      console.log(`   ✓ Cleared collection: ${key}`);
    }
    console.log('✅ All collections dropped successfully');
  } catch (error) {
    console.error('❌ Error dropping collections:', error.message);
    throw error;
  }
}

async function clearCollection(collectionName) {
  try {
    const result = await mongoose.connection.collection(collectionName).deleteMany({});
    console.log(`✅ Collection '${collectionName}' cleared: ${result.deletedCount} documents deleted`);
    return result;
  } catch (error) {
    console.error(`❌ Error clearing collection '${collectionName}':`, error.message);
    throw error;
  }
}

async function getDatabaseStats() {
  try {
    const adminDb = mongoose.connection.db.admin();
    const stats = await adminDb.serverStatus();
    return {
      version: stats.version,
      uptime: stats.uptime,
      connections: {
        current: stats.connections.current,
        available: stats.connections.available,
        totalCreated: stats.connections.totalCreated
      },
      memory: {
        resident: stats.mem.resident,
        virtual: stats.mem.virtual
      },
      operations: {
        insertCount: stats.opcounters.insert,
        queryCount: stats.opcounters.query,
        updateCount: stats.opcounters.update,
        deleteCount: stats.opcounters.delete
      },
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('❌ Error getting database stats:', error.message);
    throw error;
  }
}

module.exports = {
  connectDB,
  disconnectDB,
  getConnectionStatus,
  createIndexes,
  checkDatabaseHealth,
  dropAllCollections,
  clearCollection,
  getDatabaseStats
};
