// /public/js/login.js
document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('loginForm');
  const otpLoginForm = document.getElementById('otpLoginForm');
  const toggleLoginMethod = document.getElementById('toggleLoginMethod');
  const toggleText = document.getElementById('toggleText');
  const headerSubtitle = document.getElementById('headerSubtitle');
  
  let isOtpMode = false;
  let otpTimerInterval = null;
  let otpEmail = '';

  // Toggle between standard and OTP login
  toggleLoginMethod?.addEventListener('click', (e) => {
    e.preventDefault();
    isOtpMode = !isOtpMode;
    
    if (isOtpMode) {
      loginForm.classList.add('hidden');
      otpLoginForm.classList.remove('hidden');
      toggleText.textContent = '🔑 Use Standard Login Instead';
      headerSubtitle.textContent = 'Login with OTP verification';
    } else {
      loginForm.classList.remove('hidden');
      otpLoginForm.classList.add('hidden');
      toggleText.textContent = '🔐 Use OTP Login Instead';
      headerSubtitle.textContent = 'Secure login to your account';
      resetOtpForm();
    }
  });

  // ✅ Standard Login
  loginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const remember = document.getElementById('remember').checked;
    
    const submitBtn = document.getElementById('submitBtn');
    const loading = document.getElementById('loading');
    
    submitBtn.disabled = true;
    loading.style.display = 'block';
    hideAllAlerts();
    
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || 'Login failed');
      }
      
      // Store tokens
      localStorage.setItem('accessToken', data.data.token);
      localStorage.setItem('refreshToken', data.data.refreshToken);
      
      if (remember) {
        localStorage.setItem('rememberedEmail', email);
      }
      
      showAlert('success', 'Login successful! Redirecting...');
      
      setTimeout(() => {
        window.location.href = '/dashboard';
      }, 1000);
      
    } catch (error) {
      showAlert('error', error.message);
      submitBtn.disabled = false;
    } finally {
      loading.style.display = 'none';
    }
  });

  // ✅ OTP Login - Request OTP
  otpLoginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const email = document.getElementById('otpEmail').value;
    const password = document.getElementById('otpPassword').value;
    
    const requestOtpBtn = document.getElementById('requestOtpBtn');
    const otpLoading = document.getElementById('otpLoading');
    const otpLoadingText = document.getElementById('otpLoadingText');
    
    requestOtpBtn.disabled = true;
    otpLoading.classList.add('show');
    otpLoadingText.textContent = 'Sending OTP...';
    hideAllAlerts();
    
    try {
      const response = await fetch('/api/auth/login/otp/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || 'Failed to send OTP');
      }
      
      otpEmail = email;
      
      // Show success and switch to OTP verify step
      showAlert('success', data.message);
      document.getElementById('maskedEmail').textContent = data.data.maskedEmail || email;
      document.getElementById('otpRequestStep').classList.add('hidden');
      document.getElementById('otpVerifyStep').classList.remove('hidden');
      
      // Start countdown timer
      startOtpTimer(600); // 10 minutes
      
    } catch (error) {
      showAlert('error', error.message);
      requestOtpBtn.disabled = false;
    } finally {
      otpLoading.classList.remove('show');
    }
  });

  // ✅ Verify OTP
  document.getElementById('verifyOtpBtn')?.addEventListener('click', async () => {
    const otpCode = document.getElementById('otpCode').value;
    
    if (!otpCode || otpCode.length !== 6) {
      showAlert('error', 'Please enter a valid 6-digit OTP');
      return;
    }
    
    const verifyOtpBtn = document.getElementById('verifyOtpBtn');
    const otpLoading = document.getElementById('otpLoading');
    const otpLoadingText = document.getElementById('otpLoadingText');
    
    verifyOtpBtn.disabled = true;
    otpLoading.classList.add('show');
    otpLoadingText.textContent = 'Verifying OTP...';
    hideAllAlerts();
    
    try {
      const response = await fetch('/api/auth/login/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: otpEmail, otp: otpCode })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || 'Invalid OTP');
      }
      
      // Store tokens
      localStorage.setItem('accessToken', data.data.token);
      localStorage.setItem('refreshToken', data.data.refreshToken);
      
      showAlert('success', 'Login successful! Redirecting...');
      
      clearInterval(otpTimerInterval);
      
      setTimeout(() => {
        window.location.href = '/dashboard';
      }, 1000);
      
    } catch (error) {
      showAlert('error', error.message);
      verifyOtpBtn.disabled = false;
    } finally {
      otpLoading.classList.remove('show');
    }
  });

  // ✅ Resend OTP
  document.getElementById('resendOtpBtn')?.addEventListener('click', async () => {
    const email = document.getElementById('otpEmail').value;
    const password = document.getElementById('otpPassword').value;
    
    const resendOtpBtn = document.getElementById('resendOtpBtn');
    resendOtpBtn.disabled = true;
    hideAllAlerts();
    
    try {
      const response = await fetch('/api/auth/login/otp/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || 'Failed to resend OTP');
      }
      
      showAlert('success', 'OTP resent successfully!');
      document.getElementById('otpCode').value = '';
      
      // Restart timer
      clearInterval(otpTimerInterval);
      startOtpTimer(600);
      
    } catch (error) {
      showAlert('error', error.message);
    } finally {
      setTimeout(() => {
        resendOtpBtn.disabled = false;
      }, 5000); // Prevent spam
    }
  });

  // ✅ OTP Timer
  function startOtpTimer(seconds) {
    let remaining = seconds;
    const timerElement = document.getElementById('otpTimer');
    
    clearInterval(otpTimerInterval);
    
    otpTimerInterval = setInterval(() => {
      const minutes = Math.floor(remaining / 60);
      const secs = remaining % 60;
      timerElement.textContent = `${minutes}:${secs.toString().padStart(2, '0')}`;
      
      if (remaining <= 0) {
        clearInterval(otpTimerInterval);
        timerElement.textContent = 'Expired';
        showAlert('warning', 'OTP expired. Please request a new one.');
      }
      
      remaining--;
    }, 1000);
  }

  // ✅ Reset OTP Form
  function resetOtpForm() {
    document.getElementById('otpRequestStep').classList.remove('hidden');
    document.getElementById('otpVerifyStep').classList.add('hidden');
    document.getElementById('otpEmail').value = '';
    document.getElementById('otpPassword').value = '';
    document.getElementById('otpCode').value = '';
    clearInterval(otpTimerInterval);
    hideAllAlerts();
  }

  // ✅ Forgot Password
  const forgotLink = document.getElementById('forgotLink');
  const forgotModal = document.getElementById('forgotModal');
  const closeForgotBtn = document.getElementById('closeForgotBtn');
  const sendResetBtn = document.getElementById('sendResetBtn');
  
  forgotLink?.addEventListener('click', (e) => {
    e.preventDefault();
    forgotModal.style.display = 'flex';
  });
  
  closeForgotBtn?.addEventListener('click', () => {
    forgotModal.style.display = 'none';
  });

  forgotModal?.addEventListener('click', (e) => {
    if (e.target === forgotModal) {
      forgotModal.style.display = 'none';
    }
  });
  
  sendResetBtn?.addEventListener('click', async () => {
    const email = document.getElementById('forgotEmail').value;
    
    if (!email) {
      alert('Please enter your email');
      return;
    }
    
    sendResetBtn.disabled = true;
    sendResetBtn.textContent = 'Sending...';
    
    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      
      const data = await response.json();
      
      alert(data.message);
      forgotModal.style.display = 'none';
      
    } catch (error) {
      alert('Failed to send reset link');
    } finally {
      sendResetBtn.disabled = false;
      sendResetBtn.textContent = 'Send Reset Link';
    }
  });

  // ✅ Alert Helper Functions
  function showAlert(type, message) {
    hideAllAlerts();
    
    const alertMap = {
      'error': 'errorAlert',
      'success': 'successAlert',
      'warning': 'warningAlert'
    };
    
    const alertId = alertMap[type];
    const alertElement = document.getElementById(alertId);
    
    if (alertElement) {
      alertElement.textContent = message;
      alertElement.classList.add('show');
    }
  }
  
  function hideAllAlerts() {
    document.querySelectorAll('.alert').forEach(alert => {
      alert.classList.remove('show');
    });
  }

  // ✅ Pre-fill remembered email
  const rememberedEmail = localStorage.getItem('rememberedEmail');
  if (rememberedEmail) {
    document.getElementById('email').value = rememberedEmail;
    document.getElementById('remember').checked = true;
  }

  // ✅ Pre-fill email from query params
  const params = new URLSearchParams(window.location.search);
  const prefillEmail = params.get('email');
  if (prefillEmail) {
    document.getElementById('email').value = prefillEmail;
  }
});
