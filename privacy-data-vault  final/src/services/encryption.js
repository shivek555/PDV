/**
 * ENCRYPTION SERVICE
 * 
 * Provides AES-256-GCM encryption and decryption
 * Features:
 * - AES-256-GCM symmetric encryption
 * - PBKDF2 key derivation
 * - Random IV generation
 * - Authentication tag verification
 * - Salt-based key generation
 */

const crypto = require('crypto');

// Encryption configuration
const ALGORITHM = 'aes-256-gcm';
const ITERATIONS = 100000; // PBKDF2 iterations
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16; // 128 bits
const SALT_LENGTH = 32; // 256 bits
const AUTH_TAG_LENGTH = 16; // 128 bits

/**
 * Derive encryption key from password using PBKDF2
 * 
 * PBKDF2 (Password-Based Key Derivation Function 2) is used to:
 * - Stretch weak passwords into strong encryption keys
 * - Make dictionary attacks computationally expensive
 * - Support multiple iterations for future-proofing
 * 
 * @param {string} password - Master password
 * @param {Buffer} salt - Random salt (32 bytes)
 * @returns {Buffer} Derived key (32 bytes for AES-256)
 */
function deriveKey(password, salt = null) {
  // Generate random salt if not provided
  if (!salt) {
    salt = crypto.randomBytes(SALT_LENGTH);
  }

  // Derive key using PBKDF2-SHA256
  // High iteration count makes brute force attacks expensive
  const derivedKey = crypto.pbkdf2Sync(
    password,
    salt,
    ITERATIONS,
    KEY_LENGTH,
    'sha256'
  );

  return { key: derivedKey, salt };
}

/**
 * Generate random IV (Initialization Vector)
 * Must be unique for each encryption with the same key
 * 
 * @returns {Buffer} Random IV (16 bytes)
 */
function generateIV() {
  return crypto.randomBytes(IV_LENGTH);
}

/**
 * Encrypt data using AES-256-GCM
 * 
 * AES-256-GCM provides:
 * - Confidentiality (256-bit key strength)
 * - Authentication (detects tampering)
 * - No padding vulnerabilities
 * 
 * @param {string|Object} data - Data to encrypt
 * @param {string} password - Master password
 * @returns {Object} Encrypted data with metadata
 * @throws {Error} If encryption fails
 */
function encrypt(data, password) {
  try {
    // Convert data to JSON string if object
    const plaintext = typeof data === 'string' ? data : JSON.stringify(data);

    // Derive key from password
    const { key, salt } = deriveKey(password);

    // Generate IV
    const iv = generateIV();

    // Create cipher
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    // Encrypt data
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    // Get authentication tag (for GCM mode)
    const authTag = cipher.getAuthTag();

    console.log(`✓ Data encrypted successfully (${plaintext.length} bytes)`);

    // Return encrypted data with metadata
    return {
      encryptedData: encrypted,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
      salt: salt.toString('hex'),
      algorithm: ALGORITHM,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('❌ Encryption error:', error.message);
    throw new Error(`Encryption failed: ${error.message}`);
  }
}

/**
 * Decrypt data using AES-256-GCM
 * 
 * Decryption reverses the encryption process:
 * - Derives the same key from password and salt
 * - Uses stored IV and auth tag
 * - Verifies data integrity via authentication tag
 * 
 * @param {string} encryptedData - Hex-encoded encrypted data
 * @param {string} password - Master password
 * @param {string} iv - Hex-encoded IV
 * @param {string} authTag - Hex-encoded authentication tag
 * @param {string} salt - Hex-encoded salt
 * @returns {Object|string} Decrypted data
 * @throws {Error} If decryption fails or authentication fails
 */
function decrypt(encryptedData, password, iv, authTag, salt) {
  try {
    // Convert hex strings to buffers
    const ivBuffer = Buffer.from(iv, 'hex');
    const authTagBuffer = Buffer.from(authTag, 'hex');
    const saltBuffer = Buffer.from(salt, 'hex');

    // Derive key from password and salt
    const { key } = deriveKey(password, saltBuffer);

    // Create decipher
    const decipher = crypto.createDecipheriv(ALGORITHM, key, ivBuffer);

    // Set authentication tag (for GCM verification)
    decipher.setAuthTag(authTagBuffer);

    // Decrypt data
    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    console.log(`✓ Data decrypted successfully (${decrypted.length} bytes)`);

    // Try to parse as JSON, otherwise return as string
    try {
      return JSON.parse(decrypted);
    } catch {
      return decrypted;
    }
  } catch (error) {
    console.error('❌ Decryption error:', error.message);
    throw new Error(`Decryption failed: ${error.message}`);
  }
}

/**
 * Encrypt data with a key (for selective disclosure)
 * Used when key is already derived
 * 
 * @param {string|Object} data - Data to encrypt
 * @param {Buffer} key - Encryption key
 * @returns {Object} Encrypted data with metadata
 */
function encryptWithKey(data, key) {
  try {
    const plaintext = typeof data === 'string' ? data : JSON.stringify(data);
    const iv = generateIV();

    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    return {
      encryptedData: encrypted,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
      algorithm: ALGORITHM,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('❌ Encryption with key error:', error.message);
    throw error;
  }
}

/**
 * Decrypt data with a key (for selective disclosure)
 * 
 * @param {string} encryptedData - Hex-encoded encrypted data
 * @param {Buffer} key - Encryption key
 * @param {string} iv - Hex-encoded IV
 * @param {string} authTag - Hex-encoded authentication tag
 * @returns {Object|string} Decrypted data
 */
function decryptWithKey(encryptedData, key, iv, authTag) {
  try {
    const ivBuffer = Buffer.from(iv, 'hex');
    const authTagBuffer = Buffer.from(authTag, 'hex');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, ivBuffer);
    decipher.setAuthTag(authTagBuffer);

    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    try {
      return JSON.parse(decrypted);
    } catch {
      return decrypted;
    }
  } catch (error) {
    console.error('❌ Decryption with key error:', error.message);
    throw error;
  }
}

/**
 * Generate random encryption key
 * Used for per-field encryption in selective disclosure
 * 
 * @returns {Buffer} Random key (32 bytes)
 */
function generateKey() {
  return crypto.randomBytes(KEY_LENGTH);
}

/**
 * Hash data using SHA-256
 * Used for data integrity verification
 * 
 * @param {string|Object} data - Data to hash
 * @returns {string} Hex-encoded SHA-256 hash
 */
function hashData(data) {
  const plaintext = typeof data === 'string' ? data : JSON.stringify(data);
  const hash = crypto.createHash('sha256');
  hash.update(plaintext);
  return hash.digest('hex');
}

/**
 * Verify data integrity using hash
 * 
 * @param {string|Object} data - Original data
 * @param {string} expectedHash - Hash to verify against
 * @returns {boolean} Whether hash matches
 */
function verifyHash(data, expectedHash) {
  const computed = hashData(data);
  const matches = computed === expectedHash;
  
  if (matches) {
    console.log('✓ Data integrity verified');
  } else {
    console.error('❌ Data integrity check failed');
  }

  return matches;
}

/**
 * Generate MD5 hash (for compatibility, NOT for passwords)
 * MD5 is cryptographically broken but useful for checksums
 * 
 * @param {string} data - Data to hash
 * @returns {string} Hex-encoded MD5 hash
 */
function hashMD5(data) {
  const hash = crypto.createHash('md5');
  hash.update(data);
  return hash.digest('hex');
}

/**
 * Generate SHA-512 hash for additional security
 * Useful for certain compliance requirements
 * 
 * @param {string|Object} data - Data to hash
 * @returns {string} Hex-encoded SHA-512 hash
 */
function hashSHA512(data) {
  const plaintext = typeof data === 'string' ? data : JSON.stringify(data);
  const hash = crypto.createHash('sha512');
  hash.update(plaintext);
  return hash.digest('hex');
}

/**
 * Encrypt multiple fields selectively
 * Each field gets its own IV and auth tag
 * 
 * @param {Object} fields - Object with field names and values
 * @param {string} password - Master password
 * @returns {Object} Encrypted fields with metadata
 */
function encryptSelective(fields, password) {
  const encryptedFields = {};

  for (const [fieldName, fieldValue] of Object.entries(fields)) {
    try {
      const encrypted = encrypt(fieldValue, password);
      encryptedFields[fieldName] = encrypted;
      console.log(`✓ Field encrypted: ${fieldName}`);
    } catch (error) {
      console.error(`❌ Failed to encrypt field ${fieldName}:`, error.message);
      throw error;
    }
  }

  return encryptedFields;
}

/**
 * Decrypt multiple fields selectively
 * 
 * @param {Object} encryptedFields - Object with encrypted field data
 * @param {string} password - Master password
 * @returns {Object} Decrypted fields
 */
function decryptSelective(encryptedFields, password) {
  const decryptedFields = {};

  for (const [fieldName, encData] of Object.entries(encryptedFields)) {
    try {
      const decrypted = decrypt(
        encData.encryptedData,
        password,
        encData.iv,
        encData.authTag,
        encData.salt
      );
      decryptedFields[fieldName] = decrypted;
      console.log(`✓ Field decrypted: ${fieldName}`);
    } catch (error) {
      console.error(`❌ Failed to decrypt field ${fieldName}:`, error.message);
      throw error;
    }
  }

  return decryptedFields;
}

/**
 * Validate encryption metadata
 * 
 * @param {Object} metadata - Encryption metadata
 * @returns {boolean} Whether metadata is valid
 */
function validateEncryptionMetadata(metadata) {
  if (!metadata) return false;

  const required = ['encryptedData', 'iv', 'authTag', 'salt'];
  
  for (const field of required) {
    if (!metadata[field]) {
      console.error(`❌ Missing encryption metadata: ${field}`);
      return false;
    }
  }

  // Validate hex strings
  try {
    Buffer.from(metadata.iv, 'hex');
    Buffer.from(metadata.authTag, 'hex');
    Buffer.from(metadata.salt, 'hex');
    Buffer.from(metadata.encryptedData, 'hex');
    return true;
  } catch (error) {
    console.error('❌ Invalid encryption metadata format:', error.message);
    return false;
  }
}

/**
 * Get encryption strength info
 * 
 * @returns {Object}
 */
function getEncryptionInfo() {
  return {
    algorithm: ALGORITHM,
    keyLength: KEY_LENGTH * 8, // bits
    ivLength: IV_LENGTH * 8,
    saltLength: SALT_LENGTH * 8,
    authTagLength: AUTH_TAG_LENGTH * 8,
    pbkdf2Iterations: ITERATIONS,
    pbkdf2Digest: 'sha256',
    strength: 'Enterprise Grade (256-bit)'
  };
}

// Export functions
module.exports = {
  encrypt,
  decrypt,
  encryptWithKey,
  decryptWithKey,
  generateKey,
  deriveKey,
  generateIV,
  hashData,
  verifyHash,
  hashMD5,
  hashSHA512,
  encryptSelective,
  decryptSelective,
  validateEncryptionMetadata,
  getEncryptionInfo
};
