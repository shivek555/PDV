/**
 * DIGITAL SIGNATURE SERVICE
 * 
 * Provides RSA digital signature generation and verification
 * Features:
 * - RSA-4096 key pair generation
 * - SHA-256 and SHA-512 signing
 * - Signature verification
 * - Key export/import
 * - PEM format support
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Signature configuration
const KEY_SIZE = 4096; // RSA key size in bits
const HASH_ALGORITHM = 'sha256';

/**
 * Generate RSA-4096 key pair
 * 
 * RSA-4096 provides:
 * - Strong asymmetric encryption
 * - Digital signature capability
 * - Forward compatibility
 * - Enterprise security standards
 * 
 * Note: Key generation is computationally expensive
 * Only generate once per user and store securely
 * 
 * @returns {Object} Public and private keys in PEM format
 * @throws {Error} If key generation fails
 */
function generateKeyPair() {
  try {
    console.log('🔑 Generating RSA-4096 key pair (this may take 10-30 seconds)...');

    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: KEY_SIZE,
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem'
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem'
      }
    });

    console.log('✅ RSA-4096 key pair generated successfully');

    return {
      publicKey,
      privateKey,
      algorithm: 'RSA-4096',
      hashAlgorithm: HASH_ALGORITHM,
      generatedAt: new Date().toISOString()
    };
  } catch (error) {
    console.error('❌ Key pair generation failed:', error.message);
    throw new Error(`Key generation failed: ${error.message}`);
  }
}

/**
 * Sign data using private key
 * 
 * Digital signatures provide:
 * - Non-repudiation (signer cannot deny signing)
 * - Authentication (verifies signer identity)
 * - Integrity (detects tampering)
 * 
 * @param {string|Object} data - Data to sign
 * @param {string} privateKey - RSA private key in PEM format
 * @param {string} algorithm - Hash algorithm (sha256, sha512)
 * @returns {string} Hex-encoded signature
 * @throws {Error} If signing fails
 */
function sign(data, privateKey, algorithm = 'sha256') {
  try {
    // Convert data to string if object
    const dataString = typeof data === 'string' ? data : JSON.stringify(data);

    // Create signer
    const signer = crypto.createSign(algorithm);
    signer.update(dataString);

    // Sign with private key
    const signature = signer.sign(privateKey, 'hex');

    console.log(`✓ Data signed with ${algorithm.toUpperCase()} (${signature.length / 2} bytes)`);

    return signature;
  } catch (error) {
    console.error('❌ Signing error:', error.message);
    throw new Error(`Signing failed: ${error.message}`);
  }
}

/**
 * Verify signature using public key
 * 
 * Verification confirms:
 * - Data has not been tampered with
 * - Signature was created with the corresponding private key
 * - Signer identity (if public key is authenticated)
 * 
 * @param {string|Object} data - Original data
 * @param {string} signature - Hex-encoded signature
 * @param {string} publicKey - RSA public key in PEM format
 * @param {string} algorithm - Hash algorithm used for signing
 * @returns {boolean} Whether signature is valid
 */
function verify(data, signature, publicKey, algorithm = 'sha256') {
  try {
    // Convert data to string if object
    const dataString = typeof data === 'string' ? data : JSON.stringify(data);

    // Create verifier
    const verifier = crypto.createVerify(algorithm);
    verifier.update(dataString);

    // Verify signature
    const isValid = verifier.verify(publicKey, signature, 'hex');

    if (isValid) {
      console.log(`✓ Signature verified with ${algorithm.toUpperCase()}`);
    } else {
      console.warn(`✗ Signature verification failed`);
    }

    return isValid;
  } catch (error) {
    console.error('❌ Verification error:', error.message);
    return false;
  }
}

/**
 * Sign data with SHA-512 (stronger hash)
 * 
 * @param {string|Object} data - Data to sign
 * @param {string} privateKey - RSA private key
 * @returns {string} Hex-encoded signature
 */
function signSHA512(data, privateKey) {
  return sign(data, privateKey, 'sha512');
}

/**
 * Verify signature with SHA-512
 * 
 * @param {string|Object} data - Original data
 * @param {string} signature - Hex-encoded signature
 * @param {string} publicKey - RSA public key
 * @returns {boolean} Whether signature is valid
 */
function verifySHA512(data, signature, publicKey) {
  return verify(data, signature, publicKey, 'sha512');
}

/**
 * Create a signed certificate for data
 * Includes data, signature, signer info, and timestamp
 * 
 * @param {string|Object} data - Data to certify
 * @param {string} privateKey - Signer's private key
 * @param {Object} signerInfo - Information about signer
 * @param {string} algorithm - Hash algorithm
 * @returns {Object} Signed certificate
 */
function createSignedCertificate(data, privateKey, signerInfo = {}, algorithm = 'sha256') {
  try {
    const signature = sign(data, privateKey, algorithm);

    return {
      data: typeof data === 'string' ? data : JSON.stringify(data),
      signature,
      algorithm: algorithm.toUpperCase(),
      keySize: KEY_SIZE,
      signer: {
        name: signerInfo.name || 'Unknown',
        email: signerInfo.email || 'unknown@example.com',
        userId: signerInfo.userId || null
      },
      signedAt: new Date().toISOString(),
      validatedAt: null
    };
  } catch (error) {
    console.error('❌ Certificate creation failed:', error.message);
    throw error;
  }
}

/**
 * Validate a signed certificate
 * 
 * @param {Object} certificate - Signed certificate object
 * @param {string} publicKey - Signer's public key
 * @returns {Object} Validation result
 */
function validateSignedCertificate(certificate, publicKey) {
  try {
    const isValid = verify(
      certificate.data,
      certificate.signature,
      publicKey,
      certificate.algorithm.toLowerCase()
    );

    return {
      valid: isValid,
      certificate: certificate,
      validatedAt: new Date().toISOString(),
      signer: certificate.signer,
      message: isValid ? 'Certificate is valid' : 'Certificate signature is invalid'
    };
  } catch (error) {
    console.error('❌ Certificate validation failed:', error.message);
    return {
      valid: false,
      error: error.message,
      validatedAt: new Date().toISOString()
    };
  }
}

/**
 * Save key pair to files (development only)
 * 
 * WARNING: In production, use secure key management services
 * like AWS KMS, Azure Key Vault, or HashiCorp Vault
 * 
 * @param {string} publicKey - Public key in PEM format
 * @param {string} privateKey - Private key in PEM format
 * @param {string} baseDir - Directory to save keys
 * @returns {Object} File paths
 */
function saveKeyPair(publicKey, privateKey, baseDir = './keys') {
  try {
    // Create keys directory if it doesn't exist
    if (!fs.existsSync(baseDir)) {
      fs.mkdirSync(baseDir, { recursive: true, mode: 0o700 });
      console.log(`✓ Keys directory created: ${baseDir}`);
    }

    const publicKeyPath = path.join(baseDir, 'public.pem');
    const privateKeyPath = path.join(baseDir, 'private.pem');

    // Write keys with restricted permissions
    fs.writeFileSync(publicKeyPath, publicKey, { mode: 0o644 });
    fs.writeFileSync(privateKeyPath, privateKey, { mode: 0o600 }); // Owner read-write only

    console.log(`✓ Public key saved: ${publicKeyPath}`);
    console.log(`✓ Private key saved: ${privateKeyPath} (mode: 600)`);

    return { publicKeyPath, privateKeyPath };
  } catch (error) {
    console.error('❌ Failed to save keys:', error.message);
    throw error;
  }
}

/**
 * Load key pair from files
 * 
 * @param {string} baseDir - Directory containing keys
 * @returns {Object} Public and private keys
 */
function loadKeyPair(baseDir = './keys') {
  try {
    const publicKeyPath = path.join(baseDir, 'public.pem');
    const privateKeyPath = path.join(baseDir, 'private.pem');

    const publicKey = fs.readFileSync(publicKeyPath, 'utf8');
    const privateKey = fs.readFileSync(privateKeyPath, 'utf8');

    console.log('✓ Key pair loaded from files');

    return { publicKey, privateKey };
  } catch (error) {
    console.error('❌ Failed to load keys:', error.message);
    throw error;
  }
}

/**
 * Extract public key from private key
 * 
 * @param {string} privateKey - RSA private key in PEM format
 * @returns {string} Public key in PEM format
 */
function extractPublicKey(privateKey) {
  try {
    const keyObject = crypto.createPrivateKey(privateKey);
    const publicKey = crypto.createPublicKey(keyObject);
    
    const publicKeyPEM = publicKey.export({
      type: 'spki',
      format: 'pem'
    });

    console.log('✓ Public key extracted from private key');
    return publicKeyPEM;
  } catch (error) {
    console.error('❌ Failed to extract public key:', error.message);
    throw error;
  }
}

/**
 * Get key information
 * 
 * @param {string} key - RSA key (public or private)
 * @returns {Object} Key information
 */
function getKeyInfo(key) {
  try {
    const keyObject = crypto.createPrivateKey(key).asymmetricKeyType === 'rsa'
      ? crypto.createPrivateKey(key)
      : crypto.createPublicKey(key);

    const keyDetails = keyObject.asymmetricKeyDetails;

    return {
      keyType: keyObject.type, // 'private' or 'public'
      asymmetricKeyType: keyObject.asymmetricKeyType, // 'rsa'
      modulusLength: keyDetails.modulusLength, // Key size in bits
      publicExponent: keyDetails.publicExponent,
      generatedAt: new Date().toISOString()
    };
  } catch (error) {
    console.error('❌ Failed to get key info:', error.message);
    return null;
  }
}

/**
 * Sign multiple documents
 * Batch signing for efficiency
 * 
 * @param {Array} documents - Array of documents to sign
 * @param {string} privateKey - Signer's private key
 * @param {Object} signerInfo - Signer information
 * @returns {Array} Signed certificates
 */
function signMultiple(documents, privateKey, signerInfo = {}) {
  try {
    const signedDocs = documents.map((doc, index) => {
      const certificate = createSignedCertificate(doc, privateKey, signerInfo);
      console.log(`✓ Document ${index + 1} signed`);
      return certificate;
    });

    console.log(`✓ Batch signed ${documents.length} documents`);
    return signedDocs;
  } catch (error) {
    console.error('❌ Batch signing failed:', error.message);
    throw error;
  }
}

/**
 * Verify multiple documents
 * Batch verification for efficiency
 * 
 * @param {Array} certificates - Array of signed certificates
 * @param {string} publicKey - Signer's public key
 * @returns {Array} Validation results
 */
function verifyMultiple(certificates, publicKey) {
  try {
    const results = certificates.map((cert, index) => {
      const result = validateSignedCertificate(cert, publicKey);
      console.log(`✓ Document ${index + 1} verified (${result.valid ? 'valid' : 'invalid'})`);
      return result;
    });

    const validCount = results.filter(r => r.valid).length;
    console.log(`✓ Batch verification complete: ${validCount}/${certificates.length} valid`);
    
    return results;
  } catch (error) {
    console.error('❌ Batch verification failed:', error.message);
    throw error;
  }
}

/**
 * Get signature information
 * 
 * @returns {Object}
 */
function getSignatureInfo() {
  return {
    algorithm: 'RSA',
    keySize: `${KEY_SIZE}-bit`,
    hashAlgorithm: HASH_ALGORITHM.toUpperCase(),
    strength: 'Enterprise Grade',
    features: [
      'Digital signatures',
      'Non-repudiation',
      'Data integrity',
      'Authentication',
      'Batch operations'
    ]
  };
}

// Export functions
module.exports = {
  generateKeyPair,
  sign,
  verify,
  signSHA512,
  verifySHA512,
  createSignedCertificate,
  validateSignedCertificate,
  saveKeyPair,
  loadKeyPair,
  extractPublicKey,
  getKeyInfo,
  signMultiple,
  verifyMultiple,
  getSignatureInfo
};
