 document.addEventListener('DOMContentLoaded', () => {
      const form = document.getElementById('resetForm');
      const errorAlert = document.getElementById('errorAlert');
      const successAlert = document.getElementById('successAlert');
      const loading = document.getElementById('loading');
      const submitBtn = document.getElementById('submitBtn');

      function showAlert(el, msg) {
        el.textContent = msg;
        el.classList.add('show');
      }
      function hideAlerts() {
        errorAlert.classList.remove('show');
        successAlert.classList.remove('show');
      }

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        hideAlerts();

        const token = document.getElementById('token').value;
        const password = document.getElementById('password').value;
        const confirmPassword = document.getElementById('confirmPassword').value;

        if (!password || !confirmPassword) {
          showAlert(errorAlert, 'Please fill all fields.');
          return;
        }
        if (password !== confirmPassword) {
          showAlert(errorAlert, 'Passwords do not match.');
          return;
        }

        submitBtn.disabled = true;
        loading.classList.add('show');

        try {
          const resp = await fetch('/api/auth/reset-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, password, confirmPassword })
          });

          const data = await resp.json();

          if (!resp.ok) {
            throw new Error(data.message || 'Failed to reset password');
          }

          showAlert(successAlert, 'Password reset successful! Redirecting to login...');
          setTimeout(() => {
            window.location.href = '/login';
          }, 1500);
        } catch (err) {
          showAlert(errorAlert, err.message || 'Something went wrong');
        } finally {
          submitBtn.disabled = false;
          loading.classList.remove('show');
        }
      });
    });
  