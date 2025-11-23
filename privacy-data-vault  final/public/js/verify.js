// /public/js/verify.js
document.addEventListener('DOMContentLoaded', () => {
  const resendBtn = document.getElementById('resendBtn');
  resendBtn?.addEventListener('click', async (event) => {
    const email = prompt('Enter your email address:');
    if (!email) return;

    const btn = event.currentTarget;
    btn.disabled = true;
    btn.textContent = '📧 Sending...';

    try {
      const resp = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const data = await resp.json();
      if (resp.ok) {
        alert('Verification email sent! Check your inbox for the new link.');
      } else {
        alert('Error: ' + (data.message || 'Failed to send verification email'));
      }
    } catch (err) {
      alert('Error: ' + (err.message || 'Unknown error'));
    } finally {
      btn.textContent = '📧 Resend Verification Email';
      btn.disabled = false;
    }
  });
});
