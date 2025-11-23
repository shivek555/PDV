document.addEventListener('DOMContentLoaded', () => {
  // Go back
  document.getElementById('goBackBtn')?.addEventListener('click', () => history.back());

  // Auto-reload after network errors (when back online)
  if (navigator.onLine === false) {
    window.addEventListener('online', () => {
      setTimeout(() => window.location.reload(), 2000);
    });
  }

  // Report to GA if present (prod only)
  if (typeof gtag !== 'undefined' && document.documentElement.getAttribute('data-env') === 'production') {
    const desc = new URLSearchParams(location.search).get('msg') || 'Unknown error';
    gtag('event', 'exception', { description: desc, fatal: false });
  }

  // Retry helper
  let retryCount = 0;
  const maxRetries = 3;
  function retryRequest() {
    if (retryCount < maxRetries) {
      retryCount++;
      setTimeout(() => window.location.reload(), 1000 * retryCount);
    }
  }

  // Show retry button for network/timeout hints
  if (location.search.includes('network') || location.search.includes('timeout')) {
    const btn = document.createElement('button');
    btn.className = 'btn btn-warning mt-3';
    btn.innerHTML = '<i class="bi bi-arrow-clockwise"></i> Retry';
    btn.addEventListener('click', retryRequest);
    document.querySelector('.error-card')?.appendChild(btn);
  }
});
