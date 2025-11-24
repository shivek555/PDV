# 🛡️ Privacy Data Vault

A comprehensive, secure full-stack web application for managing, encrypting, and sharing sensitive data with advanced security features including OTP-based authentication, digital signatures, and e-signatures.

**Status:** Production Ready | **Version:** 1.0.0

---

## 📋 Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Technology Stack](#technology-stack)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Running the Application](#running-the-application)
- [Docker Setup](#docker-setup)
- [API Endpoints](#api-endpoints)
- [Project Structure](#project-structure)
- [Usage Guide](#usage-guide)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)
- [Contact](#contact)

---

## 🎯 Overview

Privacy Data Vault is a secure platform designed for users to:
- Create and manage encrypted vaults for sensitive information
- Share vaults securely with other users
- Sign documents digitally using RSA keys
- Capture e-signatures via canvas
- Access accounts using password or one-time passwords (OTP)
- Maintain complete audit logs and session tracking

The application prioritizes security, usability, and compliance with modern web standards.

---

## ✨ Key Features

### Authentication & Security
- **Password-based Login** - Secure bcrypt password hashing
- **OTP Login** - One-Time Password authentication via email (10-minute expiry)
- **Email Verification** - Verify user email during registration
- **Password Reset** - Secure password reset workflow with token validation
- **Session Management** - JWT tokens with automatic refresh mechanism
- **Account Lockout** - Automatic account lockout after failed login attempts
- **Rate Limiting** - Redis-powered rate limiting on auth endpoints

### Vault Management
- **Create Vaults** - Create private encrypted data vaults
- **Share Vaults** - Share with specific users with granular permissions
- **Search Users** - Search and invite users for vault sharing
- **Permission Control** - Read, write, and delete permissions

### Digital Signatures
- **RSA Key Generation** - Generate 2048-bit RSA key pairs per user
- **Digital Signatures** - Sign documents cryptographically using SHA256-RSA
- **Signature Verification** - Verify document authenticity and integrity
- **E-Signatures** - Capture handwritten signatures via canvas
- **Signature Storage** - Store signatures with metadata (timestamp, signer info)

### User Management
- **Profile Management** - Update profile information and preferences
- **Two-Factor Authentication** - Optional 2FA with backup codes
- **Role-Based Access Control** - User, moderator, admin, superadmin roles
- **Activity Tracking** - Track login history and IP addresses
- **Account Status** - Active, suspended, or locked states

### Additional Features
- **Dark/Light Theme** - User preference for UI theme
- **Multi-language Support** - English (extensible)
- **Responsive Design** - Works on desktop, tablet, mobile
- **Audit Logs** - Complete audit trail of actions
- **Error Handling** - Comprehensive error messages and validation

---

## 🛠️ Technology Stack

### Backend
- **Runtime:** Node.js 18+ (LTS)
- **Framework:** Express.js
- **Database:** MongoDB with Mongoose ODM
- **Authentication:** JWT (JSON Web Tokens), bcryptjs
- **Caching:** Redis
- **Email:** Nodemailer with SMTP
- **Cryptography:** node-forge (RSA), crypto module (SHA256)
- **Rate Limiting:** express-rate-limit with Redis store
- **UUID:** uuid library

### Frontend
- **Template Engine:** EJS
- **Client-side JS:** Vanilla JavaScript (ES6+)
- **Styling:** CSS3
- **Form Handling:** HTML5 forms
- **Canvas:** HTML5 Canvas for e-signature capture

### DevOps & Deployment
- **Containerization:** Docker
- **Orchestration:** Docker Compose
- **Environment Management:** dotenv

### Development Tools
- **Package Manager:** npm
- **Version Control:** Git
- **Linting:** (Optional) ESLint

---

## 📦 Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** >= 18.x ([Download](https://nodejs.org/))
- **npm** >= 9.x (comes with Node.js)
- **Docker** >= 20.10 ([Download](https://www.docker.com/))
- **Docker Compose** >= 1.29 ([Download](https://docs.docker.com/compose/install/))
- **MongoDB** - Local or MongoDB Atlas account
- **SMTP Server Access** - Gmail (recommended) or any SMTP provider
- **Git** - For version control

### System Requirements
- **RAM:** Minimum 2GB (4GB recommended)
- **Disk:** Minimum 500MB free space
- **OS:** Windows, macOS, Linux
- **Browser:** Chrome, Firefox, Safari, Edge (latest versions)

---

## 🚀 Installation

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/privacy-data-vault.git
cd privacy-data-vault
```

### 2. Install Dependencies

```bash
npm install
```

This will install all required packages from `package.json`.

### 3. Create Environment File

Copy the example environment file and update with your values:

```bash
cp .env.example .env
```

---

## ⚙️ Configuration

### Environment Variables

Create a `.env` file in your project root with the following variables:

```env
# Server Configuration
PORT=3000
NODE_ENV=development
BASE_URL=http://localhost:3000

# Database
MONGODB_URI=mongodb://localhost:27017/pdpv
# OR for MongoDB Atlas:
# MONGODB_URI=mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/pdpv

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-min-32-chars
JWT_EXPIRES_IN=1d
JWT_REFRESH_SECRET=your-super-secret-refresh-key-min-32-chars
JWT_REFRESH_EXPIRES_IN=7d

# SMTP Email Configuration
SMTPHOST=smtp.gmail.com
SMTPPORT=587
SMTPUSER=your-email@gmail.com
SMTPPASSWORD=your-app-specific-password
SMTPFROM=noreply@privacyvault.com

# Redis Configuration (Optional)
REDIS_URL=redis://localhost:6379
REDIS_PASSWORD=

# Logging
LOG_LEVEL=info
```

### Gmail Setup for Email Sending

1. Enable 2-Factor Authentication on your Gmail account
2. Generate an [App Password](https://myaccount.google.com/apppasswords)
3. Use the generated password in `SMTPPASSWORD`

### MongoDB Setup

**Option A: Local MongoDB**
```bash
# Install MongoDB Community Edition
# Start MongoDB service
mongod
```

**Option B: MongoDB Atlas (Cloud)**
1. Create account at https://www.mongodb.com/cloud/atlas
2. Create a cluster
3. Get connection string and add to `.env`

### Redis Setup (Optional, for advanced rate limiting)

```bash
# Install Redis
# macOS:
brew install redis
redis-server

# Windows (WSL):
wsl redis-server
```

---

## ▶️ Running the Application

### Development Mode

```bash
# Install development dependencies
npm install --save-dev nodemon

# Start with auto-reload
npm start
```

Server will start at `http://localhost:3000`

### Production Mode

```bash
NODE_ENV=production npm start
```

---

## 🐳 Docker Setup

### Building Docker Image

```bash
# Build image
docker build -t privacy-data-vault .

# Build with no cache
docker build --no-cache -t privacy-data-vault .
```

### Running with Docker

**Single Container (with external MongoDB):**

```bash
docker run -p 3000:3000 \
  --env-file .env \
  privacy-data-vault
```

**With Docker Compose (includes MongoDB):**

```bash
# Start all services
docker-compose up --build

# Run in background
docker-compose up -d --build

# Stop services
docker-compose down

# View logs
docker-compose logs -f app
```

### Docker Compose Services

The `docker-compose.yml` includes:
- **app** - Node.js application on port 3000
- **mongo** - MongoDB on port 27017
- **redis** - Redis on port 6379 (optional)

### Dockerfile Optimization

The provided `Dockerfile` uses:
- Alpine Linux base image (lightweight)
- Multi-stage build (optimal size)
- Proper dependency caching
- Non-root user execution (security)

---

## 📡 API Endpoints

### Authentication Routes

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/api/auth/register` | Register new user | Public |
| POST | `/api/auth/login` | Login with password | Public |
| POST | `/api/auth/login/otp/request` | Request OTP for login | Public |
| POST | `/api/auth/login/otp/verify` | Verify OTP and login | Public |
| GET | `/api/auth/verify/:token` | Verify email address | Public |
| POST | `/api/auth/resend-verification` | Resend verification email | Public |
| POST | `/api/auth/forgot-password` | Request password reset | Public |
| POST | `/api/auth/reset-password` | Reset password | Public |
| POST | `/api/auth/refresh` | Refresh access token | Public |
| POST | `/api/auth/logout` | Logout user | Private |
| GET | `/api/auth/me` | Get current user profile | Private |
| GET | `/api/auth/search-user` | Search user by email | Private |

### Vault Routes (Example)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/api/vault/create` | Create new vault | Private |
| GET | `/api/vault/list` | List user vaults | Private |
| GET | `/api/vault/:id` | Get vault details | Private |
| PUT | `/api/vault/:id` | Update vault | Private |
| DELETE | `/api/vault/:id` | Delete vault | Private |
| POST | `/api/vault/:id/share` | Share vault with user | Private |

### Signature Routes

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/api/signature/generate-keys` | Generate RSA key pair | Private |
| POST | `/api/signature/sign-document` | Digitally sign document | Private |
| POST | `/api/signature/e-sign` | Create e-signature | Private |
| GET | `/api/signature/verify/:vaultId` | Verify document signature | Private |

---

## 📁 Project Structure

```
privacy-data-vault/
├── src/
│   ├── models/
│   │   ├── User.js                 # User schema and methods
│   │   ├── Vault.js                # Vault schema
│   │   └── Document.js             # Document schema
│   ├── controllers/
│   │   ├── authController.js       # Auth logic (login, OTP, register)
│   │   ├── vaultController.js      # Vault operations
│   │   └── signatureController.js  # Signature operations
│   ├── routes/
│   │   ├── auth.js                 # Auth endpoints
│   │   ├── vault.js                # Vault endpoints
│   │   └── signature.js            # Signature endpoints
│   ├── middleware/
│   │   ├── auth.js                 # JWT verification
│   │   ├── errorHandler.js         # Error handling
│   │   ├── validate.js             # Input validation
│   │   └── rateLimiter.js          # Rate limiting
│   ├── services/
│   │   ├── mailer.js               # Email sending
│   │   ├── otpService.js           # OTP generation/verification
│   │   ├── signatureService.js     # Signature operations
│   │   ├── caching.js              # Caching logic
│   │   └── encryption.js           # Data encryption
│   ├── config/
│   │   ├── database.js             # MongoDB connection
│   │   ├── redis.js                # Redis connection
│   │   └── constants.js            # App constants
│   └── utils/
│       ├── logger.js               # Logging utility
│       └── helpers.js              # Helper functions
├── views/
│   ├── layout.ejs                  # Main layout template
│   ├── login.ejs                   # Login page (with OTP support)
│   ├── signup.ejs                  # Signup page
│   ├── dashboard.ejs               # Dashboard
│   ├── vault.ejs                   # Vault details
│   └── error.ejs                   # Error page
├── public/
│   ├── css/
│   │   ├── style.css               # Main styles
│   │   └── responsive.css          # Responsive styles
│   ├── js/
│   │   ├── login.js                # Login page logic (with OTP)
│   │   ├── dashboard.js            # Dashboard logic
│   │   └── signature-pad.js        # E-signature canvas
│   ├── images/
│   │   └── favicon.ico             # Favicon
│   └── uploads/                    # Uploaded files storage
├── server.js                       # Express server entry point
├── app.js                          # Express app configuration
├── package.json                    # Dependencies
├── package-lock.json               # Dependency lock file
├── .env.example                    # Example environment variables
├── .gitignore                      # Git ignore rules
├── Dockerfile                      # Docker configuration
├── docker-compose.yml              # Docker Compose configuration
├── .dockerignore                   # Docker build ignore
├── README.md                       # This file
└── LICENSE                         # License file
```

---

## 📖 Usage Guide

### User Registration

1. Navigate to `/signup`
2. Fill in username, email, password
3. Verify email via link sent to inbox
4. Login with credentials

### Standard Login

1. Go to login page `/login`
2. Enter email and password
3. Click "Login"
4. Redirected to dashboard on success

### OTP Login

1. Go to login page `/login`
2. Click "Use OTP Login Instead"
3. Enter email and password
4. Click "Request OTP"
5. Check email for 6-digit OTP (10-minute validity)
6. Enter OTP and click "Verify & Login"
7. Access dashboard

### Creating a Vault

1. From dashboard, click "Create Vault"
2. Enter vault name and description
3. Upload sensitive files (optional)
4. Click "Create"

### Sharing a Vault

1. Open vault details
2. Click "Share Vault"
3. Search for user by email
4. Grant permissions (read/write/delete)
5. Click "Share"

### Digital Signatures

1. Go to signature section
2. Click "Generate Keys" (one-time)
3. Upload document
4. Click "Sign Document"
5. Download signed document with RSA signature

### E-Signatures

1. Open vault for signing
2. Click "E-Sign"
3. Draw signature on canvas
4. Click "Save Signature"
5. Signature embedded in document

---

## 🔧 Troubleshooting

### Common Issues

#### 1. MongoDB Connection Failed

**Error:** `MongoServerError: connect ECONNREFUSED`

**Solution:**
```bash
# Ensure MongoDB is running
# Local:
mongod

# Or use MongoDB Atlas connection string in .env
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/dbname
```

#### 2. Email Not Sending

**Error:** `Failed to send OTP email`

**Solution:**
- Verify SMTP credentials in `.env`
- Use Gmail App Password (not regular password if 2FA enabled)
- Check firewall allows SMTP port 587
- Gmail may block "less secure apps" - use app-specific password

#### 3. Docker Module Not Found

**Error:** `Error: Cannot find module 'bcryptjs'`

**Solution:**
```bash
# Rebuild without cache
docker build --no-cache -t privacy-data-vault .

# Ensure package.json has all dependencies
npm install
```

#### 4. UUID ESM Import Error

**Error:** `ERR_REQUIRE_ESM: require() of ES Module`

**Solution:**
In `authController.js`, change:
```js
// From:
const uuid = require('uuid');

// To:
const { v4: uuidv4 } = require('uuid');

// And use uuidv4() instead of uuid()
```

#### 5. OTP Not Displaying/Sending

**Check:**
- Frontend: Is login.js loaded with OTP code?
- Backend: Check server console for `OTP sent to:` message
- Email: Check spam folder
- `.env`: Verify SMTP config is correct

#### 6. Favicon Not Showing

**Solution:**
```bash
# Place favicon.ico in /public folder
# Clear browser cache (Ctrl+Shift+R)
# Ensure correct link tag in HTML:
<link rel="icon" type="image/x-icon" href="/favicon.ico">
```

#### 7. Redis Connection Issues

**Error:** `⚠️ Redis not ready...`

**Solution:**
- Start Redis: `redis-server`
- Or remove Redis requirement for development
- Use docker-compose which includes Redis

---

## 📝 Contributing

We welcome contributions! Please follow these steps:

1. **Fork** the repository
2. **Create** a feature branch (`git checkout -b feature/AmazingFeature`)
3. **Commit** changes (`git commit -m 'Add some AmazingFeature'`)
4. **Push** to branch (`git push origin feature/AmazingFeature`)
5. **Open** a Pull Request

### Coding Standards

- Use ES6+ syntax
- Follow existing code style
- Add comments for complex logic
- Test changes before submitting PR
- Update README for new features

### Reporting Issues

1. Check existing issues first
2. Provide detailed description
3. Include error messages and logs
4. Share reproduction steps
5. Specify your environment (Node version, OS, etc.)

---

## 📄 License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.

### MIT License Summary

You are free to:
- ✅ Use for commercial and private purposes
- ✅ Modify the code
- ✅ Distribute the code
- ✅ Sublicense

You must:
- 📋 Include a copy of the license
- 📋 State significant changes made
- 📋 Include original copyright notice

You cannot:
- ❌ Hold the authors liable for anything
- ❌ Use trademark names from the project

**Full License Text:**

```
MIT License

Copyright (c) 2025 Shivek S Mittal

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## 📞 Contact & Support

### Creator
**Shivek S Mittal**
- 📧 Email: shivekmittalr@gmail.com
- 💼 LinkedIn: [linkedin.com/in/shivek-s-mittal](https://linkedin.com/in/shivek-s-mittal)
- 🐙 GitHub: [github.com/ShivekMittal](https://github.com/ShivekMittal)

### Support

For issues, questions, or suggestions:

1. **GitHub Issues:** Create an issue on the [repository](https://github.com/yourusername/privacy-data-vault/issues)
2. **Email:** shivekmittalr@gmail.com
3. **Documentation:** Check [Wiki](https://github.com/yourusername/privacy-data-vault/wiki)

---

## 🙏 Acknowledgments

- [Express.js](https://expressjs.com/) - Web framework
- [MongoDB](https://www.mongodb.com/) - Database
- [node-forge](https://github.com/digitalbazaar/forge) - Cryptography
- [Nodemailer](https://nodemailer.com/) - Email sending
- [JWT](https://jwt.io/) - Token authentication
- Community contributors and feedback

---

## 📊 Project Statistics

- **Language:** JavaScript (Node.js)
- **Frontend:** EJS + Vanilla JS
- **Database:** MongoDB
- **Lines of Code:** ~5000+
- **Features:** 30+
- **Endpoints:** 25+
- **Supported Browsers:** Chrome, Firefox, Safari, Edge
- **Mobile Support:** Responsive design

---

## 🎓 Learning Resources

This project demonstrates:
- Full-stack MERN-like architecture
- JWT authentication with refresh tokens
- OTP-based multi-factor authentication
- RSA cryptography and digital signatures
- Docker containerization
- Email integration
- RESTful API design
- Database modeling with MongoDB
- Error handling and validation
- Security best practices

Ideal for learning enterprise-level Node.js development!

---

## 🚀 Future Enhancements

- [ ] WebSocket support for real-time collaboration
- [ ] File encryption at rest
- [ ] Biometric authentication
- [ ] Advanced audit logging dashboard
- [ ] API rate limiting per user tier
- [ ] Multi-language support (i18n)
- [ ] Progressive Web App (PWA) features
- [ ] Webhook integrations
- [ ] GraphQL API option
- [ ] Machine learning for threat detection

---

## 📅 Version History

### v1.0.0 (November 24, 2025)
- Initial release
- User authentication with OTP
- Vault management system
- Digital signatures (RSA)
- E-signature support
- Docker containerization
- Complete API documentation
- Responsive UI
- Email verification
- Password reset workflow

---

## ✨ Show Your Support

If this project helped you, please:
- ⭐ Star the repository
- 🍴 Fork for your use
- 💬 Share feedback
- 🐛 Report bugs
- 🤝 Contribute improvements

---

**Thank you for using Privacy Data Vault! Stay secure. 🔐**

---

*Last Updated: November 24, 2025*  
*Made with ❤️ by Shivek S Mittal*
