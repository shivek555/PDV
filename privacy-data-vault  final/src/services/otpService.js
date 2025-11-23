/**
 * OTP SERVICE
 * Handles OTP generation and verification
 */

const crypto = require('crypto');
const { authenticator } = require('otplib');

class OTPService {
  /**
   * Generate 6-digit OTP
   * @returns {string}
   */
  static generateOTP() {
    return crypto.randomInt(100000, 999999).toString();
  }

  /**
   * Generate OTP with expiry
   * @param {number} expiryMinutes - OTP validity in minutes
   * @returns {Object} { otp, expiresAt }
   */
  static generateOTPWithExpiry(expiryMinutes = 10) {
    const otp = this.generateOTP();
    const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);
    
    return { otp, expiresAt };
  }

  /**
   * Hash OTP for storage
   * @param {string} otp
   * @returns {string}
   */
  static hashOTP(otp) {
    return crypto.createHash('sha256').update(otp).digest('hex');
  }

  /**
   * Verify OTP
   * @param {string} inputOTP
   * @param {string} storedHashedOTP
   * @returns {boolean}
   */
  static verifyOTP(inputOTP, storedHashedOTP) {
    const hashedInput = this.hashOTP(inputOTP);
    return hashedInput === storedHashedOTP;
  }

  /**
   * Check if OTP is expired
   * @param {Date} expiresAt
   * @returns {boolean}
   */
  static isExpired(expiresAt) {
    return new Date() > new Date(expiresAt);
  }
}

module.exports = OTPService;
