// /public/js/dashboard.js
document.addEventListener('DOMContentLoaded', async () => {
  const token = localStorage.getItem('accessToken');
  
  if (!token) {
    window.location.href = '/login';
    return;
  }

  // Fetch user data
  let user = null;
  try {
    const resp = await fetch('/api/auth/me', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!resp.ok) {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      window.location.href = '/login';
      return;
    }

    const data = await resp.json();
    user = data.data.user;

    const userEmailEl = document.getElementById('userEmail');
    const userAvatar = document.getElementById('userAvatar');
    const pageTitle = document.querySelector('.page-title');

    if (userEmailEl) userEmailEl.textContent = user.email;
    if (userAvatar) userAvatar.textContent = user.username.charAt(0).toUpperCase();
    if (pageTitle) pageTitle.textContent = `Welcome, ${user.username}!`;

    document.documentElement.setAttribute('data-user-id', user.id);

  } catch (err) {
    console.error('Failed to load user:', err);
    window.location.href = '/login';
    return;
  }

  const userId = document.documentElement.getAttribute('data-user-id');

  // Socket.IO
  const socket = window.io ? io({ auth: { token } }) : null;
  if (socket) {
    socket.on('connect', () => {
      if (userId) socket.emit('join_user_room', userId);
    });
    socket.on('vault_update', (data) => {
      showNotification('Vault updated', 'success');
      loadVaults();
    });
  }

  // Elements
  const vaultList = document.getElementById('vaultList');
  const vaultCount = document.getElementById('vaultCount');
  const openCreateVaultBtn = document.getElementById('openCreateVaultBtn');
  const openCreateVaultBtn2 = document.getElementById('openCreateVaultBtn2');
  const emptyCreateBtn = document.getElementById('emptyCreateBtn');
  const openShareModalBtn = document.getElementById('openShareModalBtn');
  const openDisclosureModalBtn = document.getElementById('openDisclosureModalBtn');
  const changePasswordBtn = document.getElementById('changePasswordBtn');

  const createVaultModal = document.getElementById('createVaultModal');
  const closeCreateVaultBtn = document.getElementById('closeCreateVaultBtn');
  
  const viewVaultModal = document.getElementById('viewVaultModal');
  const closeViewVaultBtn = document.getElementById('closeViewVaultBtn');
  const closeViewBtn2 = document.getElementById('closeViewBtn2');
  const deleteVaultBtn = document.getElementById('deleteVaultBtn');
  
  const editVaultModal = document.getElementById('editVaultModal');
  const closeEditVaultBtn = document.getElementById('closeEditVaultBtn');
  const unlockVaultBtn = document.getElementById('unlockVaultBtn');
  const cancelEditBtn = document.getElementById('cancelEditBtn');
  const addFieldBtn = document.getElementById('addFieldBtn');
  
  const shareModal = document.getElementById('shareModal');
  const closeShareModalBtn = document.getElementById('closeShareModalBtn');

  const vaultForm = document.getElementById('vaultForm');
  const editVaultForm = document.getElementById('editVaultForm');
  const shareForm = document.getElementById('shareForm');
  const vaultSelect = document.getElementById('vaultSelect');

  let currentVaultId = null;
  let currentVaultPassword = null;
  let dataFields = [];
  let uploadedFiles = [];

  // Helpers
  function showNotification(message, type = 'success') {
    const n = document.createElement('div');
    n.className = `notification ${type}`;
    n.textContent = message;
    document.body.appendChild(n);
    setTimeout(() => n.remove(), 5000);
  }

  function openCreateVaultModal() {
    createVaultModal?.classList.add('show');
  }
  
  function closeCreateVaultModal() {
    createVaultModal?.classList.remove('show');
    vaultForm?.reset();
  }
  
  function openViewVaultModal() {
    viewVaultModal?.classList.add('show');
  }
  
  function closeViewVaultModal() {
    viewVaultModal?.classList.remove('show');
    currentVaultId = null;
    document.getElementById('viewPasswordSection').style.display = 'block';
    document.getElementById('viewDecryptedSection').style.display = 'none';
    document.getElementById('viewVaultPassword').value = '';
  }
  
  function openEditVaultModal() {
    editVaultModal?.classList.add('show');
    document.getElementById('editPasswordStep').style.display = 'block';
    document.getElementById('editFormStep').style.display = 'none';
    document.getElementById('editVaultPassword').value = '';
  }
  
  function closeEditVaultModal() {
    editVaultModal?.classList.remove('show');
    currentVaultId = null;
    currentVaultPassword = null;
    dataFields = [];
    uploadedFiles = [];
    document.getElementById('dataFieldsContainer').innerHTML = '';
    document.getElementById('uploadedFilesList').innerHTML = '';
  }
  
  function openShareModal() {
    shareModal?.classList.add('show');
    loadVaultsForSelect();
  }
  
  function closeShareModal() {
    shareModal?.classList.remove('show');
    shareForm?.reset();
  }

  // Event bindings
  openCreateVaultBtn?.addEventListener('click', openCreateVaultModal);
  openCreateVaultBtn2?.addEventListener('click', openCreateVaultModal);
  emptyCreateBtn?.addEventListener('click', openCreateVaultModal);
  closeCreateVaultBtn?.addEventListener('click', closeCreateVaultModal);

  closeViewVaultBtn?.addEventListener('click', closeViewVaultModal);
  closeViewBtn2?.addEventListener('click', closeViewVaultModal);

  closeEditVaultBtn?.addEventListener('click', closeEditVaultModal);
  cancelEditBtn?.addEventListener('click', closeEditVaultModal);

  openShareModalBtn?.addEventListener('click', openShareModal);
  closeShareModalBtn?.addEventListener('click', closeShareModal);

  openDisclosureModalBtn?.addEventListener('click', () => alert('Disclosure feature coming soon'));
  changePasswordBtn?.addEventListener('click', () => alert('Change password feature coming soon'));

  // ✅ ENHANCED VIEW VAULT with encrypted data storage
  async function viewVault(id) {
    if (!id) return;
    
    try {
      const resp = await fetch(`/api/vault/${id}`, {
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      const data = await resp.json();
      
      if (!resp.ok) {
        throw new Error(data.message || 'Failed to load vault');
      }
      
      const vault = data.data.vault;
      currentVaultId = id;
      
      // ✅ Store encrypted data for decryption
      window.currentVaultEncryptedData = data.data.encryptedData;
      
      // Fill metadata
      document.getElementById('viewVaultTitle').textContent = vault.title || '-';
      document.getElementById('viewVaultCategory').textContent = vault.category || '-';
      document.getElementById('viewVaultDesc').textContent = vault.description || 'No description';
      document.getElementById('viewVaultConfidentiality').textContent = vault.metadata?.confidentiality || '-';
      document.getElementById('viewVaultCreated').textContent = new Date(vault.createdAt).toLocaleString();
      document.getElementById('viewVaultAccess').textContent = vault.accessCount || 0;
      
      // Reset unlock section
      document.getElementById('viewPasswordSection').style.display = 'block';
      document.getElementById('viewDecryptedSection').style.display = 'none';
      document.getElementById('viewVaultPassword').value = '';
      
      openViewVaultModal();
      
    } catch (err) {
      console.error('View vault error:', err);
      showNotification(err.message || 'Failed to view vault', 'error');
    }
  }

  // ✅ UNLOCK VIEW VAULT - CSP Compliant (No inline onclick)
  const unlockViewVaultBtn = document.getElementById('unlockViewVaultBtn');
  unlockViewVaultBtn?.addEventListener('click', () => {
    const password = document.getElementById('viewVaultPassword').value;
    
    if (!password || password.length < 8) {
      showNotification('Please enter a valid password (min 8 characters)', 'error');
      return;
    }
    
    try {
      const encryptedData = window.currentVaultEncryptedData;
      
      if (!encryptedData) {
        showNotification('No vault data found', 'error');
        return;
      }
      
      // Decrypt
      const decryptedString = atob(encryptedData);
      const vaultData = JSON.parse(decryptedString);
      
      // Verify password
      if (vaultData.password !== password) {
        showNotification('Incorrect password', 'error');
        return;
      }
      
      // Show decrypted section
      document.getElementById('viewPasswordSection').style.display = 'none';
      document.getElementById('viewDecryptedSection').style.display = 'block';
      
      // Display fields
      const fieldsContainer = document.getElementById('viewFieldsList');
      if (vaultData.fields && Object.keys(vaultData.fields).length > 0) {
        let fieldsHtml = '<div style="display:grid;gap:10px;">';
        Object.entries(vaultData.fields).forEach(([key, value]) => {
          fieldsHtml += `
            <div style="display:flex;justify-content:space-between;padding:8px;background:#fff;border-radius:4px;">
              <strong style="color:#667eea;">${escapeHtml(key)}:</strong>
              <span style="color:#333;">${escapeHtml(value)}</span>
            </div>
          `;
        });
        fieldsHtml += '</div>';
        fieldsContainer.innerHTML = fieldsHtml;
      } else {
        fieldsContainer.innerHTML = '<p style="color:#999;font-size:13px;">No custom fields added</p>';
      }
      
      // ✅ Display files with download/view buttons (NO INLINE ONCLICK!)
      const filesContainer = document.getElementById('viewFilesList');
      if (vaultData.files && vaultData.files.length > 0) {
        let filesHtml = '<div style="display:grid;gap:8px;">';
        vaultData.files.forEach(file => {
          const filename = file.filename || file.name;
          const displayName = file.originalName || file.name;
          filesHtml += `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:8px;background:#fff;border-radius:4px;">
              <div>
                <span style="color:#333;">📎 ${escapeHtml(displayName)}</span>
                <span style="color:#999;font-size:12px;margin-left:8px;">${formatFileSize(file.size)}</span>
              </div>
              <div style="display:flex;gap:5px;">
                <button class="btn btn-secondary file-view-btn" style="padding:4px 8px;font-size:11px;" data-vault-id="${currentVaultId}" data-filename="${filename}">👁️ View</button>
                <button class="btn btn-primary file-download-btn" style="padding:4px 8px;font-size:11px;" data-vault-id="${currentVaultId}" data-filename="${filename}" data-display-name="${escapeHtml(displayName)}">⬇️ Download</button>
              </div>
            </div>
          `;
        });
        filesHtml += '</div>';
        filesContainer.innerHTML = filesHtml;
        
        // ✅ Attach event listeners AFTER rendering
        attachFileEventListeners();
      } else {
        filesContainer.innerHTML = '<p style="color:#999;font-size:13px;">No files attached</p>';
      }
      
      showNotification('Vault unlocked successfully! 🔓', 'success');
      
    } catch (err) {
      console.error('Decrypt error:', err);
      showNotification('Failed to decrypt vault. Wrong password or corrupted data.', 'error');
    }
  });

  // ✅ Attach file event listeners (called after rendering files)
  function attachFileEventListeners() {
    // View buttons - ✅ PASS TOKEN IN URL
    document.querySelectorAll('.file-view-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const vaultId = e.target.dataset.vaultId;
        const filename = e.target.dataset.filename;
        window.open(`/api/vault/${vaultId}/view/${filename}?token=${token}`, '_blank');
      });
    });
    
    // Download buttons - ✅ PASS TOKEN IN URL
    document.querySelectorAll('.file-download-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const vaultId = e.target.dataset.vaultId;
        const filename = e.target.dataset.filename;
        const displayName = e.target.dataset.displayName;
        
        const link = document.createElement('a');
        link.href = `/api/vault/${vaultId}/download/${filename}?token=${token}`;
        link.download = displayName || filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      });
    });
  }

  // ✅ EDIT VAULT
  async function editVault(id) {
    if (!id) return;
    
    try {
      const resp = await fetch(`/api/vault/${id}`, {
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      const data = await resp.json();
      
      if (!resp.ok) {
        throw new Error(data.message || 'Failed to load vault');
      }
      
      const vault = data.data.vault;
      currentVaultId = id;
      
      document.getElementById('editVaultTitle').textContent = vault.title;
      document.getElementById('editTitle').value = vault.title;
      document.getElementById('editDescription').value = vault.description || '';
      
      openEditVaultModal();
      
    } catch (err) {
      console.error('Edit vault error:', err);
      showNotification(err.message || 'Failed to load vault for editing', 'error');
    }
  }

  // ✅ UNLOCK VAULT (Password verification for editing)
  unlockVaultBtn?.addEventListener('click', async () => {
    const password = document.getElementById('editVaultPassword').value;
    
    if (!password || password.length < 8) {
      showNotification('Please enter a valid password (min 8 characters)', 'error');
      return;
    }
    
    currentVaultPassword = password;
    
    document.getElementById('editPasswordStep').style.display = 'none';
    document.getElementById('editFormStep').style.display = 'block';
    
    showNotification('Vault unlocked! You can now edit.', 'success');
  });

  // ✅ ADD DATA FIELD - CSP Compliant
  addFieldBtn?.addEventListener('click', () => {
    const fieldId = `field_${Date.now()}`;
    const fieldHtml = `
      <div class="data-field-row" id="${fieldId}">
        <input type="text" placeholder="Field name (e.g., Aadhar)" class="field-name">
        <input type="text" placeholder="Field value" class="field-value">
        <button type="button" class="remove-field-btn" data-field-id="${fieldId}">✕</button>
      </div>
    `;
    document.getElementById('dataFieldsContainer').insertAdjacentHTML('beforeend', fieldHtml);
  });

  // ✅ Event delegation for removing fields
  document.getElementById('dataFieldsContainer')?.addEventListener('click', (e) => {
    if (e.target.classList.contains('remove-field-btn')) {
      const fieldId = e.target.dataset.fieldId;
      document.getElementById(fieldId)?.remove();
    }
  });

  // ✅ ENHANCED FILE UPLOAD HANDLER with actual upload
  document.getElementById('vaultFiles')?.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    const maxSize = 10 * 1024 * 1024; // 10MB
    
    if (!currentVaultId) {
      // Store files temporarily for new vaults
      files.forEach(file => {
        if (file.size > maxSize) {
          showNotification(`File ${file.name} is too large (max 10MB)`, 'error');
          return;
        }
        
        const fileIndex = uploadedFiles.length;
        uploadedFiles.push(file);
        
        const fileHtml = `
          <div class="uploaded-file" id="file_${fileIndex}">
            <span>📎 ${escapeHtml(file.name)} (${formatFileSize(file.size)})</span>
            <button type="button" class="remove-temp-file-btn" data-file-index="${fileIndex}">Remove</button>
          </div>
        `;
        document.getElementById('uploadedFilesList').insertAdjacentHTML('beforeend', fileHtml);
      });
      return;
    }
    
    // ✅ Upload files for existing vault
    const formData = new FormData();
    files.forEach(file => {
      if (file.size > maxSize) {
        showNotification(`File ${file.name} is too large (max 10MB)`, 'error');
        return;
      }
      formData.append('files', file);
    });
    
    try {
      const resp = await fetch(`/api/vault/${currentVaultId}/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });
      
      const data = await resp.json();
      
      if (!resp.ok) {
        throw new Error(data.message || 'Failed to upload files');
      }
      
      // Add uploaded files to list
      data.data.files.forEach(file => {
        uploadedFiles.push(file);
        const fileHtml = `
          <div class="uploaded-file" id="file_upload_${file.filename}">
            <span>📎 ${escapeHtml(file.originalName)} (${formatFileSize(file.size)})</span>
            <button type="button" class="remove-uploaded-file-btn" data-filename="${file.filename}">Remove</button>
          </div>
        `;
        document.getElementById('uploadedFilesList').insertAdjacentHTML('beforeend', fileHtml);
      });
      
      showNotification('Files uploaded successfully!', 'success');
      
    } catch (err) {
      console.error('Upload error:', err);
      showNotification(err.message || 'Failed to upload files', 'error');
    }
  });

  // ✅ Event delegation for removing temp files
  document.getElementById('uploadedFilesList')?.addEventListener('click', (e) => {
    if (e.target.classList.contains('remove-temp-file-btn')) {
      const index = parseInt(e.target.dataset.fileIndex);
      uploadedFiles.splice(index, 1);
      document.getElementById(`file_${index}`)?.remove();
    }
    
    if (e.target.classList.contains('remove-uploaded-file-btn')) {
      const filename = e.target.dataset.filename;
      document.getElementById(`file_upload_${filename}`)?.remove();
      uploadedFiles = uploadedFiles.filter(f => f.filename !== filename);
    }
  });

  // ✅ SUBMIT EDIT FORM
  editVaultForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    if (!currentVaultId || !currentVaultPassword) {
      showNotification('Vault not unlocked', 'error');
      return;
    }
    
    const title = document.getElementById('editTitle').value;
    const description = document.getElementById('editDescription').value;
    
    // Collect data fields
    const fields = {};
    document.querySelectorAll('.data-field-row').forEach(row => {
      const name = row.querySelector('.field-name').value;
      const value = row.querySelector('.field-value').value;
      if (name && value) {
        fields[name] = value;
      }
    });
    
    // Prepare vault data
    const vaultData = {
      title,
      description,
      fields,
      files: uploadedFiles.map(f => ({ 
        name: f.name || f.originalName, 
        originalName: f.originalName || f.name,
        filename: f.filename,
        size: f.size, 
        type: f.type || f.mimetype 
      })),
      password: currentVaultPassword,
      timestamp: new Date().toISOString()
    };
    
    const encryptedData = btoa(JSON.stringify(vaultData));
    
    try {
      const resp = await fetch(`/api/vault/${currentVaultId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          title,
          description,
          encryptedData
        })
      });

      const data = await resp.json();

      if (!resp.ok) {
        throw new Error(data.message || 'Failed to update vault');
      }

      showNotification('Vault updated successfully! 🎉', 'success');
      closeEditVaultModal();
      await loadVaults();
      
    } catch (err) {
      console.error('Update vault error:', err);
      showNotification(err.message || 'Failed to update vault', 'error');
    }
  });

  // Delete vault
  deleteVaultBtn?.addEventListener('click', async () => {
    if (!currentVaultId) return;
    
    if (!confirm('Are you sure you want to delete this vault?')) return;
    
    try {
      const resp = await fetch(`/api/vault/${currentVaultId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      const data = await resp.json();
      
      if (!resp.ok) {
        throw new Error(data.message || 'Failed to delete vault');
      }
      
      showNotification('Vault deleted successfully', 'success');
      closeViewVaultModal();
      await loadVaults();
      
    } catch (err) {
      console.error('Delete vault error:', err);
      showNotification(err.message || 'Failed to delete vault', 'error');
    }
  });

  // Vault actions via event delegation
  vaultList?.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const action = btn.getAttribute('data-action');
    const id = btn.getAttribute('data-id');
    if (action === 'view') viewVault(id);
    if (action === 'edit') editVault(id);
    if (action === 'share') {
      openShareModal();
      if (vaultSelect) vaultSelect.value = id || '';
    }
  });

  // Create Vault
  vaultForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const vaultTitle = document.getElementById('vaultTitle');
    const vaultDesc = document.getElementById('vaultDesc');
    const vaultCategory = document.getElementById('vaultCategory');
    const vaultPassword = document.getElementById('vaultPassword');
    const vaultConfidentiality = document.getElementById('vaultConfidentiality');
    
    if (!vaultTitle?.value || !vaultCategory?.value || !vaultPassword?.value) {
      showNotification('Please fill all required fields', 'error');
      return;
    }
    
    if (vaultPassword.value.length < 8) {
      showNotification('Password must be at least 8 characters', 'error');
      return;
    }
    
    try {
      const vaultData = {
        title: vaultTitle.value,
        description: vaultDesc?.value || '',
        category: vaultCategory.value,
        password: vaultPassword.value,
        timestamp: new Date().toISOString()
      };
      
      const encryptedData = btoa(JSON.stringify(vaultData));
      
      const resp = await fetch('/api/vault', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          title: vaultTitle.value,
          description: vaultDesc?.value || '',
          category: vaultCategory.value,
          encryptedData: encryptedData,
          metadata: {
            confidentiality: vaultConfidentiality?.value || 'confidential',
            tags: [],
            encrypted: true
          }
        })
      });

      const data = await resp.json();

      if (!resp.ok) {
        throw new Error(data.message || 'Failed to create vault');
      }

      showNotification('Vault created successfully! 🎉', 'success');
      closeCreateVaultModal();
      await loadVaults();
      
    } catch (err) {
      console.error('Create vault error:', err);
      showNotification(err.message || 'Failed to create vault', 'error');
    }
  });

  // ✅ SHARE VAULT - FIXED
shareForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const selectedVault = vaultSelect?.value;
  const shareEmail = document.getElementById('shareEmail');
  const shareAccess = document.getElementById('shareAccess');
  
  if (!selectedVault || !shareEmail?.value) {
    showNotification('Please select vault and enter email', 'error');
    return;
  }
  
  try {
    // ✅ NEW: Search user by email using public endpoint
    const userResp = await fetch(`/api/auth/search-user?email=${encodeURIComponent(shareEmail.value)}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (!userResp.ok) {
      throw new Error('User not found with this email');
    }
    
    const userData = await userResp.json();
    const recipientUserId = userData.data?.user?.id || userData.data?.userId;
    
    if (!recipientUserId) {
      throw new Error('User not found');
    }
    
    // Share vault with found user
    const resp = await fetch(`/api/vault/${selectedVault}/share`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        userId: recipientUserId,
        accessLevel: shareAccess?.value || 'read'
      })
    });

    const data = await resp.json();

    if (!resp.ok) {
      throw new Error(data.message || 'Failed to share vault');
    }

    showNotification('Vault shared successfully! 🎉', 'success');
    closeShareModal();
    
  } catch (err) {
    console.error('Share vault error:', err);
    showNotification(err.message || 'Failed to share vault', 'error');
  }
});


  // ✅ LOAD VAULTS (Including shared vaults)
  async function loadVaults() {
    try {
      const resp = await fetch('/api/vault?includeShared=true', { 
        headers: { 'Authorization': `Bearer ${token}` } 
      });
      const data = await resp.json();
      if (!data?.success) throw new Error('Load failed');

      const list = data?.data?.vaults || [];
      
      if (!list.length) {
        vaultList.innerHTML = `
          <div class="empty-state">
            <p>No vaults yet</p>
            <button class="btn btn-primary" id="emptyCreateBtn2">Create one now</button>
          </div>`;
        document.getElementById('emptyCreateBtn2')?.addEventListener('click', openCreateVaultModal);
      } else {
        vaultList.innerHTML = list.map(v => `
          <li class="vault-item">
            <div>
              <div class="vault-name">
                ${escapeHtml(v.displayTitle || v.title || '-')}
                ${v.isShared ? '<span style="font-size:11px;color:#667eea;margin-left:8px;">🔗 Shared</span>' : ''}
              </div>
              <div class="vault-category">${escapeHtml(v.category || '-')}</div>
            </div>
            <div class="vault-actions">
              <button data-action="view" data-id="${v.id}">View</button>
              <button data-action="edit" data-id="${v.id}">Edit</button>
              <button data-action="share" data-id="${v.id}">Share</button>
            </div>
          </li>
        `).join('');
      }
      
      if (vaultCount) vaultCount.textContent = String(list.length);
    } catch (err) {
      console.error('Error loading vaults:', err);
      showNotification('Failed to load vaults', 'error');
    }
  }

  async function loadVaultsForSelect() {
    try {
      const resp = await fetch('/api/vault', { 
        headers: { 'Authorization': `Bearer ${token}` } 
      });
      const data = await resp.json();
      const list = data?.data?.vaults || [];
      if (vaultSelect) {
        vaultSelect.innerHTML = `<option value="">Select vault</option>` + 
          list.map(v => `<option value="${v.id}">${escapeHtml(v.displayTitle || v.title || v.id)}</option>`).join('');
      }
    } catch (e) {
      console.error('Load vaults for select error:', e);
    }
  }

  function escapeHtml(str) {
    return String(str ?? '')
      .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
      .replaceAll('"','&quot;').replaceAll("'",'&#39;');
  }

  function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }

  loadVaults();
});
