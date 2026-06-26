const API = '/api/admin';
const TOKEN_KEY = 'admin_token';
const USER_KEY = 'admin_user';

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function setSession(token, user) {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } else {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }
}

function getUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY));
  } catch {
    return null;
  }
}

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

const authSection = document.getElementById('auth-section');
const dashboard = document.getElementById('dashboard');
const loginForm = document.getElementById('login-form');
const signupForm = document.getElementById('signup-form');
const authError = document.getElementById('auth-error');
const flagsBody = document.getElementById('flags-body');
const flagsEmpty = document.getElementById('flags-empty');
const flagsLoading = document.getElementById('flags-loading');

document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    const isLogin = tab.dataset.tab === 'login';
    loginForm.classList.toggle('hidden', !isLogin);
    signupForm.classList.toggle('hidden', isLogin);
    authError.classList.add('hidden');
  });
});

function showDashboard(user) {
  authSection.classList.add('hidden');
  dashboard.classList.remove('hidden');
  document.getElementById('user-email').textContent = user.email;
  document.getElementById('org-info').textContent =
    ` — ${user.organization.name} (${user.organization.slug})`;
}

function showAuth() {
  authSection.classList.remove('hidden');
  dashboard.classList.add('hidden');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

async function loadFlags() {
  flagsLoading.classList.remove('hidden');
  flagsBody.innerHTML = '';
  flagsEmpty.classList.add('hidden');

  try {
    const { featureFlags } = await api('/feature-flags');
    flagsLoading.classList.add('hidden');

    if (!featureFlags.length) {
      flagsEmpty.classList.remove('hidden');
      return;
    }

    flagsBody.innerHTML = featureFlags
      .map(
        (f) => `
      <tr data-id="${f.id}">
        <td><code>${escapeHtml(f.feature_key)}</code></td>
        <td>
          <span class="badge ${f.enabled ? 'badge-on' : 'badge-off'}">
            ${f.enabled ? 'Enabled' : 'Disabled'}
          </span>
        </td>
        <td>${escapeHtml(f.description || '—')}</td>
        <td class="actions">
          <button type="button" class="btn-sm btn-secondary toggle-btn" data-id="${f.id}" data-enabled="${f.enabled}">
            ${f.enabled ? 'Disable' : 'Enable'}
          </button>
          <button type="button" class="btn-sm btn-danger delete-btn" data-id="${f.id}">Delete</button>
        </td>
      </tr>`
      )
      .join('');

    flagsBody.querySelectorAll('.toggle-btn').forEach((btn) => {
      btn.addEventListener('click', () => toggleFlag(btn.dataset.id, btn.dataset.enabled === 'true'));
    });
    flagsBody.querySelectorAll('.delete-btn').forEach((btn) => {
      btn.addEventListener('click', () => deleteFlag(btn.dataset.id));
    });
  } catch (err) {
    flagsLoading.classList.add('hidden');
    if (err.status === 401) {
      setSession(null);
      showAuth();
    }
  }
}

async function toggleFlag(id, currentlyEnabled) {
  try {
    await api(`/feature-flags/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ enabled: !currentlyEnabled }),
    });
    loadFlags();
  } catch (err) {
    alert(err.message);
  }
}

async function deleteFlag(id) {
  if (!confirm('Delete this feature flag?')) return;
  try {
    await api(`/feature-flags/${id}`, { method: 'DELETE' });
    loadFlags();
  } catch (err) {
    alert(err.message);
  }
}

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  authError.classList.add('hidden');

  try {
    const { token, user } = await api('/login', {
      method: 'POST',
      body: JSON.stringify({
        email: document.getElementById('login-email').value.trim(),
        password: document.getElementById('login-password').value,
      }),
    });
    setSession(token, user);
    showDashboard(user);
    loadFlags();
  } catch (err) {
    authError.textContent = err.message;
    authError.classList.remove('hidden');
  }
});

signupForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  authError.classList.add('hidden');

  try {
    const { token, user } = await api('/signup', {
      method: 'POST',
      body: JSON.stringify({
        email: document.getElementById('signup-email').value.trim(),
        password: document.getElementById('signup-password').value,
        organizationSlug: document.getElementById('signup-org-slug').value.trim(),
      }),
    });
    setSession(token, user);
    showDashboard(user);
    loadFlags();
  } catch (err) {
    authError.textContent = err.message;
    authError.classList.remove('hidden');
  }
});

document.getElementById('create-flag-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const flagError = document.getElementById('flag-error');
  flagError.classList.add('hidden');

  try {
    await api('/feature-flags', {
      method: 'POST',
      body: JSON.stringify({
        featureKey: document.getElementById('flag-key').value.trim(),
        enabled: document.getElementById('flag-enabled').checked,
        description: document.getElementById('flag-description').value.trim() || undefined,
      }),
    });
    e.target.reset();
    loadFlags();
  } catch (err) {
    flagError.textContent = err.message;
    flagError.classList.remove('hidden');
  }
});

document.getElementById('logout-btn').addEventListener('click', () => {
  setSession(null);
  showAuth();
});

document.getElementById('refresh-btn').addEventListener('click', loadFlags);

const savedUser = getUser();
if (getToken() && savedUser) {
  showDashboard(savedUser);
  loadFlags();
}
