/**
 * Privacy-First Data Vault - Main JavaScript
 * Client-side utilities and API interactions
 * Location: /public/js/app.js
 *
 * Dependencies expected on page (before this script):
 * - axios (window.axios)
 * - bootstrap JS (optional, for alerts/modals used by VaultUtils)
 */

// Guard: require axios in global
if (typeof window === 'undefined' || typeof window.axios === 'undefined') {
  throw new Error('axios must be loaded before /js/app.js');
}

class VaultAPI {
  constructor(options = {}) {
    this.baseURL = options.baseURL || '/api';
    this.token = localStorage.getItem('accessToken');
    this._isRefreshing = false;          // single-flight guard
    this._refreshWaiters = [];           // queued waiters during refresh
    this._attachInterceptors();
  }

  _attachInterceptors() {
    const axios = window.axios;
    axios.defaults.baseURL = this.baseURL;

    // Request interceptor: attach token
    axios.interceptors.request.use((config) => {
      const token = localStorage.getItem('accessToken');
      if (token) {
        config.headers = config.headers || {};
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });

    // Response interceptor: handle 401 with single-flight refresh
    axios.interceptors.response.use(
      (response) => response,
      async (error) => {
        const original = error.config || {};
        const status = error?.response?.status;

        // Network errors: bubble up
        if (!status) {
          return Promise.reject(error);
        }

        // Only handle first 401 per request
        if (status === 401 && !original._retry) {
          original._retry = true;
          try {
            await this._refreshSingleFlight(); // ensures only one refresh runs
            const newToken = localStorage.getItem('accessToken');
            original.headers = original.headers || {};
            original.headers.Authorization = `Bearer ${newToken}`;
            return axios(original); // retry with new token
          } catch (e) {
            this.handleAuthError();
            return Promise.reject(e);
          }
        }

        return Promise.reject(error);
      }
    );
  }

  // Single-flight refresh: queue concurrent 401s behind one refresh call
  async _refreshSingleFlight() {
    if (this._isRefreshing) {
      return new Promise((resolve, reject) => {
        this._refreshWaiters.push({ resolve, reject });
      });
    }
    this._isRefreshing = true;
    try {
      const newToken = await this.refreshToken();
      this._refreshWaiters.forEach(w => w.resolve(newToken));
      this._refreshWaiters = [];
      return newToken;
    } catch (e) {
      this._refreshWaiters.forEach(w => w.reject(e));
      this._refreshWaiters = [];
      throw e;
    } finally {
      this._isRefreshing = false;
    }
  }

  // Refresh access token
  async refreshToken() {
    const axios = window.axios;
    const refreshToken = localStorage.getItem('refreshToken');
    if (!refreshToken) throw new Error('No refresh token available');

    try {
      const resp = await axios.post('/auth/refresh', { refreshToken });
      const { accessToken, refreshToken: newRefreshToken } = resp.data.data || {};
      if (!accessToken) throw new Error('No accessToken in refresh response');
      localStorage.setItem('accessToken', accessToken);
      if (newRefreshToken) localStorage.setItem('refreshToken', newRefreshToken);
      return accessToken;
    } catch (err) {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      throw err;
    }
  }

  // Handle authentication errors
  handleAuthError() {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    window.location.href = '/login';
  }

  // Authentication methods
  async login(email, password) {
    const resp = await axios.post('/auth/login', { email, password });
    return resp.data;
  }

  async signup(userData) {
    const resp = await axios.post('/auth/signup', userData);
    return resp.data;
  }

  async verifyOTP(email, otp) {
    const resp = await axios.post('/auth/verify-otp', { email, otp });
    return resp.data;
  }

  async logout() {
    try { await axios.post('/auth/logout'); } catch (_) { /* ignore */ }
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    window.location.href = '/login';
  }

  // User profile methods
  async getProfile() {
    const resp = await axios.get('/auth/me');
    return resp.data;
  }

  async updateProfile(profileData) {
    const resp = await axios.put('/auth/profile', { profile: profileData });
    return resp.data;
  }

  async changePassword(currentPassword, newPassword) {
    const resp = await axios.post('/auth/change-password', {
      currentPassword, newPassword, confirmNewPassword: newPassword
    });
    return resp.data;
  }

  // Vault methods
  async getVaultStats() {
    const resp = await axios.get('/vault/stats');
    return resp.data;
  }

  async viewVault(password) {
    const resp = await axios.get('/vault/view', { params: { password } });
    return resp.data;
  }

  async addAttributes(password, attributes) {
    const resp = await axios.post('/vault/add', { password, attributes });
    return resp.data;
  }

  async createDisclosure(password, selectedFields, purpose, requestedBy, expiresIn) {
    const resp = await axios.post('/vault/share', {
      password, selectedFields, purpose, requestedBy, expiresIn
    });
    return resp.data;
  }

  async verifyDisclosure(disclosureData) {
    const resp = await axios.post('/vault/verify', { disclosureData });
    return resp.data;
  }

  async getDisclosureHistory(page = 1, limit = 10, status = null) {
    const params = { page, limit };
    if (status) params.status = status;
    const resp = await axios.get('/vault/disclosures', { params });
    return resp.data;
  }

  async revokeDisclosure(disclosureId, reason = null) {
    const resp = await axios.post(`/vault/revoke/${disclosureId}`, { reason });
    return resp.data;
  }

  // Admin
  async getAdminStats() {
    const resp = await axios.get('/admin/stats');
    return resp.data;
  }

  async getUsers(filters = {}) {
    const resp = await axios.get('/admin/users', { params: filters });
    return resp.data;
  }

  async getVaults(page = 1, limit = 20) {
    const resp = await axios.get('/admin/vaults', { params: { page, limit } });
    return resp.data;
  }
}

// Utility Functions
class VaultUtils {
  static showAlert(message, type = 'info', duration = 5000) {
    const alertContainer = document.getElementById('alertContainer');
    if (!alertContainer) return;

    const alertId = `alert-${Date.now()}`;
    const html = `
      <div id="${alertId}" class="alert alert-${type} alert-dismissible fade show" role="alert">
        <i class="bi bi-${this.getAlertIcon(type)}"></i>
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
      </div>
    `;
    alertContainer.insertAdjacentHTML('beforeend', html);

    setTimeout(() => {
      const el = document.getElementById(alertId);
      if (el && window.bootstrap?.Alert) {
        const bsAlert = window.bootstrap.Alert.getOrCreateInstance(el);
        bsAlert.close();
      } else if (el) {
        el.remove();
      }
    }, duration);
  }

  static getAlertIcon(type) {
    const icons = {
      success: 'check-circle', danger: 'exclamation-triangle',
      warning: 'exclamation-triangle', info: 'info-circle', primary: 'info-circle'
    };
    return icons[type] || 'info-circle';
  }

  static formatFieldName(field) {
    return field.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()).trim();
  }

  static formatCategoryName(category) {
    const names = {
      personalInfo: 'Personal Information',
      contactInfo: 'Contact Information',
      identificationInfo: 'Identification',
      financialInfo: 'Financial Information',
      healthInfo: 'Health Information',
      educationInfo: 'Education Information'
    };
    return names[category] || this.formatFieldName(category);
  }

  static getStatusBadgeColor(status) {
    const colors = { pending: 'warning', verified: 'success', expired: 'secondary', revoked: 'danger', active: 'success', inactive: 'secondary' };
    return colors[status] || 'secondary';
  }

  static formatDate(dateString, options = {}) {
    const def = { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' };
    return new Date(dateString).toLocaleDateString('en-US', { ...def, ...options });
  }

  static formatRelativeTime(dateString) {
    const now = new Date();
    const date = new Date(dateString);
    const diff = Math.floor((now - date) / 1000);
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)} minutes ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)} days ago`;
    return this.formatDate(dateString, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  static isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  static validatePassword(password) {
    const minLength = 8;
    const issues = [];
    if (password.length < minLength) issues.push(`At least ${minLength} characters`);
    if (!/[A-Z]/.test(password)) issues.push('One uppercase letter');
    if (!/[a-z]/.test(password)) issues.push('One lowercase letter');
    if (!/\d/.test(password)) issues.push('One number');
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) issues.push('One special character');
    const strength = this.getPasswordStrength(password);
    return { isValid: issues.length === 0, issues, strength };
  }

  static getPasswordStrength(password) {
    let s = 0;
    if (password.length >= 8) s++;
    if (password.length >= 12) s++;
    if (/[A-Z]/.test(password)) s++;
    if (/[a-z]/.test(password)) s++;
    if (/\d/.test(password)) s++;
    if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) s++;
    if (s <= 2) return { level: 'weak', color: 'danger' };
    if (s <= 4) return { level: 'medium', color: 'warning' };
    return { level: 'strong', color: 'success' };
  }

  static async copyToClipboard(text, successMessage = 'Copied to clipboard!') {
    try {
      await navigator.clipboard.writeText(text);
      this.showAlert(successMessage, 'success', 2000);
      return true;
    } catch (e) {
      console.error('Failed to copy:', e);
      this.showAlert('Failed to copy to clipboard', 'danger');
      return false;
    }
  }

  static downloadJSON(data, filename = 'vault-data.json') {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    this.showAlert(`Downloaded ${filename}`, 'success');
  }

  static generateRandomString(length = 32) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const array = new Uint8Array(length);
    crypto.getRandomValues(array);
    let out = '';
    for (let i = 0; i < length; i++) out += chars[array[i] % chars.length];
    return out;
  }

  static debounce(func, wait) {
    let t; return function (...args) { clearTimeout(t); t = setTimeout(() => func.apply(this, args), wait); };
  }

  static throttle(func, limit) {
    let inThrottle = false;
    return function (...args) {
      if (!inThrottle) {
        func.apply(this, args);
        inThrottle = true;
        setTimeout(() => { inThrottle = false; }, limit);
      }
    };
  }

  static isAuthenticated() { return !!localStorage.getItem('accessToken'); }

  static requireAuth() { if (!this.isAuthenticated()) { window.location.href = '/login'; return false; } return true; }

  static formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024, sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
    }

  static sanitizeHTML(html) {
    const div = document.createElement('div');
    div.textContent = html;
    return div.innerHTML;
  }

  static setLoading(element, isLoading = true) {
    if (!element) return;
    if (isLoading) {
      element.classList.add('loading');
      element.disabled = true;
      if (!element.dataset.originalContent) element.dataset.originalContent = element.innerHTML;
      element.innerHTML = '<i class="bi bi-hourglass-split"></i> Loading...';
    } else {
      element.classList.remove('loading');
      element.disabled = false;
      if (element.dataset.originalContent) {
        element.innerHTML = element.dataset.originalContent;
        delete element.dataset.originalContent;
      }
    }
  }

  static enhanceForm(formElement) {
    if (!formElement) return;
    const inputs = formElement.querySelectorAll('input, textarea, select');
    inputs.forEach(input => {
      input.addEventListener('focus', () => input.parentElement?.classList.add('focused'));
      input.addEventListener('blur', () => { if (!input.value) input.parentElement?.classList.remove('focused'); });
      if (input.type === 'email') {
        input.addEventListener('input', VaultUtils.debounce(() => {
          const valid = VaultUtils.isValidEmail(input.value);
          input.classList.toggle('is-valid', valid && input.value);
          input.classList.toggle('is-invalid', !valid && input.value);
        }, 300));
      }
      if (input.type === 'password') {
        input.addEventListener('input', VaultUtils.debounce(() => {
          const v = VaultUtils.validatePassword(input.value);
          input.classList.toggle('is-valid', v.isValid);
          input.classList.toggle('is-invalid', !v.isValid && input.value);
        }, 300));
      }
    });
  }
}

// Initialize API once
const vaultAPI = new VaultAPI();

// Global enhancements and handlers
document.addEventListener('DOMContentLoaded', function () {
  document.querySelectorAll('form').forEach(form => VaultUtils.enhanceForm(form));

  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      const searchInput = document.querySelector('input[type="search"], input[placeholder*="search" i]');
      if (searchInput) searchInput.focus();
    }
    if (e.key === 'Escape') {
      const openModal = document.querySelector('.modal.show');
      if (openModal && window.bootstrap?.Modal) {
        const modal = window.bootstrap.Modal.getInstance(openModal);
        if (modal) modal.hide();
      }
    }
  });

  window.addEventListener('unhandledrejection', function (event) {
    console.error('Unhandled promise rejection:', event.reason);
    VaultUtils.showAlert('An unexpected error occurred. Please try again.', 'danger');
  });

  window.addEventListener('offline', function () {
    VaultUtils.showAlert('You are now offline. Some features may not work.', 'warning');
  });

  window.addEventListener('online', function () {
    VaultUtils.showAlert('You are back online!', 'success', 2000);
  });
});

// Export to UMD-like and global
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { VaultAPI, VaultUtils };
}
window.VaultAPI = VaultAPI;
window.VaultUtils = VaultUtils;
window.vaultAPI = vaultAPI;
