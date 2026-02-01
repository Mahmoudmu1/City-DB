/* Admin auth via API */
(function () {
  const API_BASE = window.__CITY_API_BASE__ || '/City-DB/api/public/index.php';
  const TOKEN_KEY = 'mdkp_admin_token';
  const USER_KEY = 'mdkp_admin_user';

  const $ = (id) => document.getElementById(id);

  function show(el, msg) {
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('d-none');
    setTimeout(() => el.classList.add('d-none'), 3000);
  }

  async function api(path, options = {}) {
    const token = localStorage.getItem(TOKEN_KEY);
    const headers = Object.assign({ 'Content-Type': 'application/json' }, options.headers || {});
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
    const text = await res.text();
    const json = text ? JSON.parse(text) : {};
    if (!res.ok) throw new Error(json.error || 'Request failed');
    return json.data ?? json;
  }

  const form = $('adminLoginForm');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    form.classList.add('was-validated');

    const email = $('adminEmail').value.trim().toLowerCase();
    const password = $('adminPassword').value;
    const alertErr = $('loginAlert');

    if (!email || !password) return;

    try {
      const data = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      if (data.user.role !== 'admin') {
        show(alertErr, 'Admin privileges required.');
        return;
      }
      localStorage.setItem(TOKEN_KEY, data.token);
      localStorage.setItem(USER_KEY, JSON.stringify(data.user));
      window.location.href = 'dashboard.html';
    } catch (err) {
      show(alertErr, err.message || 'Login failed.');
    }
  });
})();
