const API = '/api/user';
const TOKEN_KEY = 'user_token';
const USER_KEY = 'user_info';

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
const resultEl = document.getElementById('result');
const resultMessage = document.getElementById('result-message');
const resultDetail = document.getElementById('result-detail');

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
  } catch (err) {
    authError.textContent = err.message;
    authError.classList.remove('hidden');
  }
});

document.getElementById('check-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  resultEl.classList.add('hidden');

  const featureKey = document.getElementById('feature-key').value.trim();

  try {
    const data = await api('/check-feature', {
      method: 'POST',
      body: JSON.stringify({ featureKey }),
    });

    resultEl.classList.remove('hidden', 'enabled', 'disabled', 'not-found');

    if (!data.exists) {
      resultEl.classList.add('not-found');
      resultMessage.innerHTML = `<strong>Not found</strong> No flag named <code>${featureKey}</code> exists for your organization.`;
      resultDetail.textContent = '';
    } else if (data.enabled) {
      resultEl.classList.add('enabled');
      resultMessage.innerHTML = `<strong>Enabled</strong> Feature <code>${data.featureKey}</code> is ON for your organization.`;
      resultDetail.textContent = data.description || '';
    } else {
      resultEl.classList.add('disabled');
      resultMessage.innerHTML = `<strong>Disabled</strong> Feature <code>${data.featureKey}</code> is OFF for your organization.`;
      resultDetail.textContent = data.description || '';
    }
  } catch (err) {
    if (err.status === 401) {
      setSession(null);
      showAuth();
    } else {
      alert(err.message);
    }
  }
});

document.getElementById('logout-btn').addEventListener('click', () => {
  setSession(null);
  showAuth();
  resultEl.classList.add('hidden');
});

const savedUser = getUser();
if (getToken() && savedUser) {
  showDashboard(savedUser);
}
