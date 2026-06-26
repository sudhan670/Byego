const API = '/api/super-admin';
const TOKEN_KEY = 'super_admin_token';

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
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

const loginSection = document.getElementById('login-section');
const dashboard = document.getElementById('dashboard');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const createOrgForm = document.getElementById('create-org-form');
const createError = document.getElementById('create-error');
const createSuccess = document.getElementById('create-success');
const orgsBody = document.getElementById('orgs-body');
const orgsEmpty = document.getElementById('orgs-empty');
const orgsLoading = document.getElementById('orgs-loading');

function showDashboard(email) {
  loginSection.classList.add('hidden');
  dashboard.classList.remove('hidden');
  document.getElementById('user-info').textContent = email;
}

function showLogin() {
  loginSection.classList.remove('hidden');
  dashboard.classList.add('hidden');
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

async function loadOrganizations() {
  orgsLoading.classList.remove('hidden');
  orgsBody.innerHTML = '';
  orgsEmpty.classList.add('hidden');

  try {
    const { organizations } = await api('/organizations');
    orgsLoading.classList.add('hidden');

    if (!organizations.length) {
      orgsEmpty.classList.remove('hidden');
      return;
    }

    orgsBody.innerHTML = organizations
      .map(
        (o) => `
      <tr>
        <td>${escapeHtml(o.name)}</td>
        <td><code>${escapeHtml(o.slug)}</code></td>
        <td>${o.user_count ?? 0}</td>
        <td>${o.flag_count ?? 0}</td>
        <td>${formatDate(o.created_at)}</td>
      </tr>`
      )
      .join('');
  } catch (err) {
    orgsLoading.classList.add('hidden');
    if (err.status === 401) {
      setToken(null);
      showLogin();
    }
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.classList.add('hidden');

  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;

  try {
    const { token, user } = await api('/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setToken(token);
    showDashboard(user.email);
    loadOrganizations();
  } catch (err) {
    loginError.textContent = err.message;
    loginError.classList.remove('hidden');
  }
});

createOrgForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  createError.classList.add('hidden');
  createSuccess.classList.add('hidden');

  const name = document.getElementById('org-name').value.trim();
  const slug = document.getElementById('org-slug').value.trim();

  try {
    const body = { name };
    if (slug) body.slug = slug;

    const { organization } = await api('/organizations', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    createSuccess.textContent = `Created "${organization.name}" (slug: ${organization.slug})`;
    createSuccess.classList.remove('hidden');
    createOrgForm.reset();
    loadOrganizations();
  } catch (err) {
    createError.textContent = err.message;
    createError.classList.remove('hidden');
  }
});

document.getElementById('logout-btn').addEventListener('click', () => {
  setToken(null);
  showLogin();
});

document.getElementById('refresh-btn').addEventListener('click', loadOrganizations);

if (getToken()) {
  showDashboard('Super Admin');
  loadOrganizations();
}
