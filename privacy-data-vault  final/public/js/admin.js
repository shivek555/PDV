// /public/js/admin.js
document.addEventListener('DOMContentLoaded', () => {
  const token = localStorage.getItem('token');

  // Elements
  const tabsEl = document.getElementById('tabs');
  const refreshBtn = document.getElementById('refreshBtn');
  const logoutLink = document.getElementById('logoutLink');
  const userSearch = document.getElementById('userSearch');
  const usersTableBody = document.getElementById('usersTableBody');
  const userActionModal = document.getElementById('userActionModal');
  const closeUserActionBtn = document.getElementById('closeUserActionBtn');

  // Load everything on first paint
  refreshData();

  // Tab switching via data attributes
  tabsEl?.addEventListener('click', (e) => {
    const btn = e.target.closest('.tab-btn');
    if (!btn) return;
    const tabName = btn.getAttribute('data-tab');
    if (!tabName) return;

    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    document.getElementById(tabName)?.classList.add('active');
    btn.classList.add('active');
  });

  // Refresh button
  refreshBtn?.addEventListener('click', () => {
    refreshData();
    alert('Data refreshed');
  });

  // Logout
  logoutLink?.addEventListener('click', (e) => {
    e.preventDefault();
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    window.location.href = '/login';
  });

  // Search users as you type
  userSearch?.addEventListener('keyup', () => {
    const searchTerm = (userSearch.value || '').toLowerCase();
    const rows = document.querySelectorAll('#usersTableBody tr[data-row="user"]');
    rows.forEach(row => {
      const text = row.textContent.toLowerCase();
      row.style.display = text.includes(searchTerm) ? '' : 'none';
    });
  });

  // Users table actions (event delegation)
  usersTableBody?.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const action = btn.getAttribute('data-action');
    const userId = btn.getAttribute('data-user-id');
    if (!action || !userId) return;

    if (action === 'edit') {
      editUser(userId);
    } else if (action === 'delete') {
      deleteUser(userId);
    }
  });

  // Modal close
  closeUserActionBtn?.addEventListener('click', () => {
    closeUserActionModal();
  });

  // Modal backdrop close
  userActionModal?.addEventListener('click', (e) => {
    if (e.target === userActionModal) closeUserActionModal();
  });

  async function refreshData() {
    await Promise.all([loadUsers(), loadVaults(), loadSystemHealth(), loadActivityLogs()]);
  }

  async function loadUsers() {
    try {
      const resp = await fetch('/api/admin/users', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await resp.json();
      if (!data.success) return;

      const rows = (data.data.users || []).map(user => {
        const statusClass = user.suspended ? 'status-suspended' : (user.active ? 'status-active' : 'status-inactive');
        const statusText = user.suspended ? 'Suspended' : (user.active ? 'Active' : 'Inactive');
        return `
          <tr data-row="user">
            <td>${escapeHtml(user.username)}</td>
            <td>${escapeHtml(user.email)}</td>
            <td><span class="status-badge">${escapeHtml(user.role)}</span></td>
            <td><span class="status-badge ${statusClass}">${statusText}</span></td>
            <td>
              <button class="btn btn-small btn-primary" data-action="edit" data-user-id="${user._id}">Edit</button>
              <button class="btn btn-small btn-danger" data-action="delete" data-user-id="${user._id}">Delete</button>
            </td>
          </tr>
        `;
      }).join('');

      usersTableBody.innerHTML = rows || `<tr><td colspan="5" style="text-align:center; padding:40px; color:#999;">No users</td></tr>`;
      const total = data.data.pagination?.total ?? (data.data.users?.length || 0);
      const totalUsersEl = document.getElementById('totalUsers');
      if (totalUsersEl) totalUsersEl.textContent = String(total);
    } catch (err) {
      console.error('Error loading users:', err);
    }
  }

  async function loadVaults() {
    try {
      const resp = await fetch('/api/admin/vaults', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await resp.json();
      if (!data.success) return;

      const totalVaultsEl = document.getElementById('totalVaults');
      if (totalVaultsEl) totalVaultsEl.textContent = String(data.data.total ?? 0);

      const vaultsTbody = document.getElementById('vaultsTableBody');
      if (vaultsTbody) {
        const rows = (data.data.items || []).map(v => `
          <tr>
            <td>${escapeHtml(v.title || '-')}</td>
            <td>${escapeHtml(v.owner || '-')}</td>
            <td>${escapeHtml(v.category || '-')}</td>
            <td>${v.createdAt ? new Date(v.createdAt).toLocaleString() : '-'}</td>
            <td>${escapeHtml(v.status || '-')}</td>
          </tr>
        `).join('');
        vaultsTbody.innerHTML = rows || `<tr><td colspan="5" style="text-align:center; padding:40px; color:#999;">No vaults</td></tr>`;
      }
    } catch (err) {
      console.error('Error loading vaults:', err);
    }
  }

  async function loadSystemHealth() {
    try {
      const resp = await fetch('/api/admin/health', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await resp.json();
      if (!data.success) return;

      const db = data.data.health?.services?.database?.status === 'up' ? '✓ Connected' : '✗ Down';
      const cache = data.data.health?.services?.cache?.status === 'up' ? '✓ Connected' : '✗ Down';
      const dbEl = document.getElementById('dbHealth');
      const cacheEl = document.getElementById('cacheHealth');
      if (dbEl) dbEl.textContent = db;
      if (cacheEl) cacheEl.textContent = cache;
    } catch (err) {
      console.error('Error loading health:', err);
    }
  }

  async function loadActivityLogs() {
    try {
      const resp = await fetch('/api/admin/logs', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await resp.json();
      if (!data.success) return;

      const tbody = document.getElementById('logsTableBody');
      if (tbody) {
        const rows = (data.data.activities || []).slice(0, 10).map(log => `
          <tr>
            <td>${log.performedAt ? new Date(log.performedAt).toLocaleString() : '-'}</td>
            <td>${escapeHtml(log.action || '-')}</td>
            <td>${escapeHtml(log.performedBy || 'System')}</td>
            <td>${escapeHtml(log.details || '-')}</td>
          </tr>
        `).join('');
        tbody.innerHTML = rows || `<tr><td colspan="4" style="text-align:center; padding:40px; color:#999;">No activity</td></tr>`;
      }
    } catch (err) {
      console.error('Error loading logs:', err);
    }
  }

  function editUser(userId) {
    alert('Edit user feature coming soon');
  }

  function deleteUser(userId) {
    if (confirm('Are you sure you want to delete this user?')) {
      alert('Delete user feature coming soon');
    }
  }

  function closeUserActionModal() {
    userActionModal?.classList.remove('show');
  }

  // Basic HTML escaping for dynamic text
  function escapeHtml(str) {
    return String(str ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }
});
