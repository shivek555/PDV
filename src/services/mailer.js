/**
 * EMAIL SERVICE
 * 
 * Handles email sending for authentication and notifications
 * Features:
 * - Email verification
 * - Password reset
 * - Notifications
 * - HTML templates
 * - Retry logic
 */

const nodemailer = require('nodemailer');
const dotenv = require('dotenv');

dotenv.config();

// Email service configuration
const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
const SMTP_PORT = process.env.SMTP_PORT || 587;
const SMTP_USER = process.env.SMTP_USER || 'your-email@gmail.com';
const SMTP_PASSWORD = process.env.SMTP_PASSWORD || 'your-app-password';
const SMTP_FROM = process.env.SMTP_FROM || 'noreply@privacyvault.com';

// Create transporter
const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_PORT === 587, // true for 465, false for other ports
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASSWORD
  }
});

/**
 * Verify email connection
 * 
 * @returns {Promise<boolean>}
 */
async function verifyConnection() {
  try {
    await transporter.verify();
    console.log('✅ Email service connected');
    return true;
  } catch (error) {
    console.error('❌ Email service connection failed:', error.message);
    return false;
  }
}

/**
 * Send email verification message
 * 
 * @param {string} email - Recipient email
 * @param {string} username - Username
 * @param {string} verificationToken - Verification token
 * @param {string} baseUrl - Application base URL
 * @returns {Promise<Object>}
 */
async function sendVerificationEmail(email, username, verificationToken, baseUrl) {
  try {
    const verificationLink = `${baseUrl}/verify/${verificationToken}`;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: 'Arial', sans-serif; background-color: #f4f4f4; }
          .container { max-width: 600px; margin: 20px auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
          .header { text-align: center; padding-bottom: 20px; border-bottom: 2px solid #007bff; }
          .header h1 { color: #007bff; margin: 0; }
          .content { padding: 20px 0; }
          .content p { color: #333; line-height: 1.6; margin: 10px 0; }
          .button { display: inline-block; padding: 12px 30px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .footer { text-align: center; padding-top: 20px; border-top: 1px solid #eee; color: #666; font-size: 12px; }
          .warning { background-color: #fff3cd; padding: 10px; border-radius: 4px; margin: 10px 0; color: #856404; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🛡️ Privacy Vault</h1>
            <p>Email Verification</p>
          </div>
          <div class="content">
            <p>Hello <strong>${username}</strong>,</p>
            <p>Welcome to Privacy Vault! Please verify your email address to activate your account.</p>
            <p>Click the button below to verify your email:</p>
            <a href="${verificationLink}" class="button">Verify Email Address</a>
            <p>Or copy and paste this link in your browser:</p>
            <p style="word-break: break-all; background: #f9f9f9; padding: 10px; border-radius: 4px;">${verificationLink}</p>
            <div class="warning">
              ⚠️ <strong>This link expires in 24 hours.</strong>
            </div>
            <p>If you did not create this account, please ignore this email.</p>
          </div>
          <div class="footer">
            <p>© 2025 Privacy Vault - Enterprise Edition</p>
            <p>This is an automated message. Please do not reply to this email.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const info = await transporter.sendMail({
      from: SMTP_FROM,
      to: email,
      subject: '🛡️ Verify Your Email - Privacy Vault',
      html: htmlContent,
      text: `Welcome to Privacy Vault! Please verify your email by visiting: ${verificationLink}`
    });

    console.log(`✓ Verification email sent to ${email} (Message ID: ${info.messageId})`);

    return {
      success: true,
      messageId: info.messageId,
      email: email,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('❌ Failed to send verification email:', error.message);
    throw new Error(`Email sending failed: ${error.message}`);
  }
}

/**
 * Send password reset email
 * 
 * @param {string} email - Recipient email
 * @param {string} username - Username
 * @param {string} resetToken - Reset token
 * @param {string} baseUrl - Application base URL
 * @returns {Promise<Object>}
 */
async function sendPasswordResetEmail(email, username, resetToken, baseUrl) {
  try {
    const resetLink = `${baseUrl}/reset-password/${resetToken}`;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: 'Arial', sans-serif; background-color: #f4f4f4; }
          .container { max-width: 600px; margin: 20px auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
          .header { text-align: center; padding-bottom: 20px; border-bottom: 2px solid #dc3545; }
          .header h1 { color: #dc3545; margin: 0; }
          .content { padding: 20px 0; }
          .content p { color: #333; line-height: 1.6; margin: 10px 0; }
          .button { display: inline-block; padding: 12px 30px; background-color: #dc3545; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .footer { text-align: center; padding-top: 20px; border-top: 1px solid #eee; color: #666; font-size: 12px; }
          .warning { background-color: #f8d7da; padding: 10px; border-radius: 4px; margin: 10px 0; color: #721c24; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🛡️ Privacy Vault</h1>
            <p>Password Reset Request</p>
          </div>
          <div class="content">
            <p>Hello <strong>${username}</strong>,</p>
            <p>You requested a password reset for your Privacy Vault account.</p>
            <p>Click the button below to create a new password:</p>
            <a href="${resetLink}" class="button">Reset Password</a>
            <p>Or copy and paste this link in your browser:</p>
            <p style="word-break: break-all; background: #f9f9f9; padding: 10px; border-radius: 4px;">${resetLink}</p>
            <div class="warning">
              ⚠️ <strong>This link expires in 1 hour.</strong>
            </div>
            <p>If you did not request this reset, please ignore this email and your password will remain unchanged.</p>
            <p>For security reasons, never share this link with anyone.</p>
          </div>
          <div class="footer">
            <p>© 2025 Privacy Vault - Enterprise Edition</p>
            <p>This is an automated message. Please do not reply to this email.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const info = await transporter.sendMail({
      from: SMTP_FROM,
      to: email,
      subject: '🔐 Password Reset - Privacy Vault',
      html: htmlContent,
      text: `Reset your password by visiting: ${resetLink}`
    });

    console.log(`✓ Password reset email sent to ${email} (Message ID: ${info.messageId})`);

    return {
      success: true,
      messageId: info.messageId,
      email: email,
      expiresIn: '1 hour',
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('❌ Failed to send password reset email:', error.message);
    throw new Error(`Email sending failed: ${error.message}`);
  }
}

/**
 * Send disclosure notification email
 * 
 * @param {string} recipientEmail - Recipient email
 * @param {string} senderName - Sender name
 * @param {string} disclosureToken - Disclosure access token
 * @param {Array} fields - Shared fields
 * @param {string} baseUrl - Application base URL
 * @returns {Promise<Object>}
 */
async function sendDisclosureNotificationEmail(
  recipientEmail,
  senderName,
  disclosureToken,
  fields,
  baseUrl
) {
  try {
    const disclosureLink = `${baseUrl}/share/${disclosureToken}`;
    const fieldsHtml = fields.map(field => `<li>${field}</li>`).join('');

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: 'Arial', sans-serif; background-color: #f4f4f4; }
          .container { max-width: 600px; margin: 20px auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
          .header { text-align: center; padding-bottom: 20px; border-bottom: 2px solid #28a745; }
          .header h1 { color: #28a745; margin: 0; }
          .content { padding: 20px 0; }
          .content p { color: #333; line-height: 1.6; margin: 10px 0; }
          .button { display: inline-block; padding: 12px 30px; background-color: #28a745; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .footer { text-align: center; padding-top: 20px; border-top: 1px solid #eee; color: #666; font-size: 12px; }
          .fields-list { background-color: #f9f9f9; padding: 15px; border-radius: 4px; margin: 10px 0; }
          .fields-list ul { margin: 0; padding-left: 20px; }
          .fields-list li { margin: 5px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>📋 Privacy Vault</h1>
            <p>Selective Disclosure Shared With You</p>
          </div>
          <div class="content">
            <p>Hello,</p>
            <p><strong>${senderName}</strong> has shared some information with you through Privacy Vault.</p>
            <p>The following fields have been shared:</p>
            <div class="fields-list">
              <ul>
                ${fieldsHtml}
              </ul>
            </div>
            <p>Click the button below to view the shared information:</p>
            <a href="${disclosureLink}" class="button">View Shared Information</a>
            <p>Or copy and paste this link in your browser:</p>
            <p style="word-break: break-all; background: #f9f9f9; padding: 10px; border-radius: 4px;">${disclosureLink}</p>
            <p>This sharing link is temporary and will expire after a certain period.</p>
          </div>
          <div class="footer">
            <p>© 2025 Privacy Vault - Enterprise Edition</p>
            <p>This is an automated message. Please do not reply to this email.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const info = await transporter.sendMail({
      from: SMTP_FROM,
      to: recipientEmail,
      subject: `📋 ${senderName} Shared Information With You - Privacy Vault`,
      html: htmlContent,
      text: `${senderName} shared information with you. View it here: ${disclosureLink}`
    });

    console.log(`✓ Disclosure notification sent to ${recipientEmail} (Message ID: ${info.messageId})`);

    return {
      success: true,
      messageId: info.messageId,
      email: recipientEmail,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('❌ Failed to send disclosure email:', error.message);
    throw new Error(`Email sending failed: ${error.message}`);
  }
}

/**
 * Send two-factor authentication email
 * 
 * @param {string} email - Recipient email
 * @param {string} code - 2FA code
 * @returns {Promise<Object>}
 */
async function send2FAEmail(email, code) {
  try {
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: 'Arial', sans-serif; background-color: #f4f4f4; }
          .container { max-width: 600px; margin: 20px auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
          .header { text-align: center; padding-bottom: 20px; border-bottom: 2px solid #ffc107; }
          .header h1 { color: #ffc107; margin: 0; }
          .code { text-align: center; background-color: #f9f9f9; padding: 30px; margin: 20px 0; border-radius: 4px; }
          .code p { font-size: 12px; color: #666; margin: 0 0 10px 0; }
          .code .number { font-size: 48px; font-weight: bold; color: #333; letter-spacing: 5px; font-family: 'Courier New', monospace; }
          .content { padding: 20px 0; }
          .content p { color: #333; line-height: 1.6; margin: 10px 0; }
          .footer { text-align: center; padding-top: 20px; border-top: 1px solid #eee; color: #666; font-size: 12px; }
          .warning { background-color: #ffe6e6; padding: 10px; border-radius: 4px; margin: 10px 0; color: #c00; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🛡️ Privacy Vault</h1>
            <p>Two-Factor Authentication Code</p>
          </div>
          <div class="code">
            <p>Your authentication code:</p>
            <div class="number">${code}</div>
            <p>This code expires in 10 minutes</p>
          </div>
          <div class="content">
            <p>Someone is trying to access your Privacy Vault account.</p>
            <div class="warning">
              ⚠️ <strong>Do not share this code with anyone.</strong>
            </div>
            <p>If you did not attempt to login, someone may be trying to access your account. Please reset your password immediately.</p>
          </div>
          <div class="footer">
            <p>© 2025 Privacy Vault - Enterprise Edition</p>
            <p>This is an automated message. Please do not reply to this email.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const info = await transporter.sendMail({
      from: SMTP_FROM,
      to: email,
      subject: '🔐 Your Two-Factor Authentication Code - Privacy Vault',
      html: htmlContent,
      text: `Your 2FA code is: ${code}. This code expires in 10 minutes.`
    });

    console.log(`✓ 2FA email sent to ${email} (Message ID: ${info.messageId})`);

    return {
      success: true,
      messageId: info.messageId,
      email: email,
      expiresIn: '10 minutes',
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('❌ Failed to send 2FA email:', error.message);
    throw new Error(`Email sending failed: ${error.message}`);
  }
}

/**
 * Send generic notification email
 * 
 * @param {string} email - Recipient email
 * @param {string} subject - Email subject
 * @param {string} htmlContent - HTML content
 * @returns {Promise<Object>}
 */
async function sendNotification(email, subject, htmlContent) {
  try {
    const info = await transporter.sendMail({
      from: SMTP_FROM,
      to: email,
      subject: subject,
      html: htmlContent
    });

    console.log(`✓ Notification sent to ${email} (Message ID: ${info.messageId})`);

    return {
      success: true,
      messageId: info.messageId,
      email: email,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('❌ Failed to send notification:', error.message);
    throw error;
  }
}

/**
 * Send batch emails
 * 
 * @param {Array} recipients - Array of recipient objects {email, subject, html}
 * @returns {Promise<Array>}
 */
async function sendBatch(recipients) {
  try {
    const results = await Promise.allSettled(
      recipients.map(recipient =>
        transporter.sendMail({
          from: SMTP_FROM,
          to: recipient.email,
          subject: recipient.subject,
          html: recipient.html
        })
      )
    );

    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    console.log(`✓ Batch emails sent: ${successful} successful, ${failed} failed`);

    return {
      total: recipients.length,
      successful,
      failed,
      results,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('❌ Failed to send batch emails:', error.message);
    throw error;
  }
}

// Export functions
module.exports = {
  verifyConnection,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendDisclosureNotificationEmail,
  send2FAEmail,
  sendNotification,
  sendBatch
};
