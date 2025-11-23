// /public/js/share.js
document.addEventListener('DOMContentLoaded', () => {
  const root = document.getElementById('shareRoot');
  const token = document.documentElement.getAttribute('data-disclosure-token') || '';
  const vaultTitle = root?.getAttribute('data-vault-title') || '';
  let fields = [];
  try { fields = JSON.parse((root?.getAttribute('data-disclosed-fields') || '[]')); } catch {}

  const decryptBtn = document.getElementById('decryptBtn');
  const downloadBtn = document.getElementById('downloadBtn');
  const loading = document.getElementById('loading');
  const decryptedSection = document.getElementById('decryptedSection');
  const hideDecryptedBtn = document.getElementById('hideDecryptedBtn');
  const decryptedDataDiv = document.getElementById('decryptedData');
  const goHomeBtn = document.getElementById('goHomeBtn');

  goHomeBtn?.addEventListener('click', () => { window.location.href = '/'; });

  decryptBtn?.addEventListener('click', async () => {
    try {
      decryptBtn.disabled = true;
      if (loading) loading.style.display = 'block';
      // Simulate decryption; replace with real call if needed
      const sample = [
        { name: 'Email', value: 'user@example.com' },
        { name: 'Phone', value: '+1 (555) 123-4567' },
        { name: 'Address', value: '123 Privacy Street, Vault City' }
      ];
      decryptedDataDiv.innerHTML = sample.map(f =>
        `<div style="margin-bottom:12px; padding-bottom:12px; border-bottom:1px solid #eee;">
           <strong>${escapeHtml(f.name)}:</strong> ${escapeHtml(f.value)}
         </div>`).join('');
      decryptedSection.style.display = 'block';
    } catch (e) {
      alert('Failed to decrypt: ' + (e.message || 'Unknown error'));
    } finally {
      if (loading) loading.style.display = 'none';
      decryptBtn.disabled = false;
    }
  });

  hideDecryptedBtn?.addEventListener('click', () => {
    decryptedSection.style.display = 'none';
  });

  downloadBtn?.addEventListener('click', () => {
    const proof = {
      disclosureToken: token,
      downloadedAt: new Date().toISOString(),
      vaultTitle: vaultTitle,
      fields: fields
    };
    const dataStr = JSON.stringify(proof, null, 2);
    const uri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
    const name = `disclosure-proof-${Date.now()}.json`;
    const a = document.createElement('a');
    a.href = uri; a.download = name; a.click();
  });

  function escapeHtml(str) {
    return String(str ?? '')
      .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
      .replaceAll('"','&quot;').replaceAll("'",'&#39;');
  }
});
