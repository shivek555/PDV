// /public/js/signup.js
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('signupForm');
  const submitBtn = document.getElementById('submitBtn');
  const loading = document.getElementById('loading');
  const passwordInput = document.getElementById('password');
  const strengthFill = document.getElementById('strengthFill');
  const strengthText = document.getElementById('strengthText');
  const errorAlert = document.getElementById('errorAlert');
  const successAlert = document.getElementById('successAlert');

  // Password strength meter
  passwordInput?.addEventListener('input', function () {
    const password = this.value || '';
    let strength = 0;
    if (password.length >= 8) strength++;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) strength++;
    if (/\d/.test(password)) strength++;
    if (/[@$!%*?&]/.test(password)) strength++;

    let cls = 'weak', text = 'Weak';
    if (strength <= 1) { cls = 'weak'; text = 'Weak'; }
    else if (strength <= 2) { cls = 'medium'; text = 'Medium'; }
    else { cls = 'strong'; text = 'Strong'; }

    if (strengthFill) strengthFill.className = `strength-fill ${cls}`;
    if (strengthText) strengthText.textContent = `${text} password`;
  });

  // Submit handler
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const formData = {
      username: document.getElementById('username')?.value,
      email: document.getElementById('email')?.value,
      firstName: document.getElementById('firstName')?.value,
      lastName: document.getElementById('lastName')?.value,
      password: document.getElementById('password')?.value,
      confirmPassword: document.getElementById('confirmPassword')?.value
    };

    submitBtn.disabled = true;
    if (loading) loading.style.display = 'block';
    if (errorAlert) errorAlert.classList.remove('show');
    if (successAlert) successAlert.classList.remove('show');

    try {
      const resp = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      const data = await resp.json();

      if (!resp.ok) {
        throw new Error(data.message || 'Registration failed');
      }

      // ✅ CRITICAL: Store tokens in localStorage
      if (data.data?.token) {
        localStorage.setItem('accessToken', data.data.token);
      }
      if (data.data?.refreshToken) {
        localStorage.setItem('refreshToken', data.data.refreshToken);
      }

      // Show success message
      if (successAlert) {
        successAlert.textContent = 'Registration successful! Please verify your email.';
        successAlert.classList.add('show');
      }

      // ✅ Redirect after 2 seconds
      setTimeout(() => {
        window.location.href = '/dashboard';
      }, 2000);

    } catch (err) {
      if (errorAlert) {
        errorAlert.textContent = err.message || 'Registration error';
        errorAlert.classList.add('show');
        
      }
    } finally {
      submitBtn.disabled = false;
      if (loading) loading.style.display = 'none';
    }
  });
});
