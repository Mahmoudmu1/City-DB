(() => {
  const API_BASE = window.__CITY_API_BASE__ || '/City-DB/api/public/index.php';
  const TOKEN_KEY = 'mdkp_token';
  const USER_KEY = 'mdkp_user';

  const $ = (id) => document.getElementById(id);

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

  function show(el, msg) {
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('d-none');
    setTimeout(() => el.classList.add('d-none'), 2500);
  }

  function initialsSVG(fn = '', ln = '', size = 160) {
    const initials = ((fn?.[0] || '') + (ln?.[0] || '')).toUpperCase() || '?';
    const svg = `
      <svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}'>
        <rect width='100%' height='100%' rx='${size / 2}' ry='${size / 2}' fill='#eaeef6'/>
        <text x='50%' y='55%' text-anchor='middle'
          font-family='Arial, Helvetica, sans-serif'
          font-size='${size * 0.45}' fill='#4b5563' dy='.1em'>${initials}</text>
      </svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }

  async function init() {
    try {
      const me = await api('/auth/me');
      localStorage.setItem(USER_KEY, JSON.stringify(me));
      $('firstName').value = me.firstName || '';
      $('lastName').value = me.lastName || '';
      $('email').value = me.email || '';
      $('address').value = me.address || '';
      const preview = $('avatarPreview');
      if (preview) preview.src = initialsSVG(me.firstName, me.lastName);
    } catch {
      window.location.href = 'login.html';
    }
  }

  const form = $('profileForm');
  if (!form) return;

  init();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    form.classList.add('was-validated');

    const payload = {
      firstName: $('firstName').value.trim(),
      lastName: $('lastName').value.trim(),
      address: $('address').value.trim(),
      currentPassword: $('currentPassword').value,
      newPassword: $('newPassword').value,
    };
    const confirm = $('confirmNewPassword').value;

    if (!payload.firstName || !payload.lastName) return;
    if (payload.newPassword || confirm) {
      if (payload.newPassword !== confirm) {
        show($('profileError'), 'New passwords do not match.');
        return;
      }
      if (payload.newPassword.length < 6) {
        show($('profileError'), 'Password must be at least 6 characters.');
        return;
      }
      if (!payload.currentPassword) {
        show($('profileError'), 'Current password is required to change password.');
        return;
      }
    }

    try {
      await api('/auth/profile', { method: 'PATCH', body: JSON.stringify(payload) });
      show($('profileAlert'), 'Profile updated.');
      $('currentPassword').value = '';
      $('newPassword').value = '';
      $('confirmNewPassword').value = '';
      const user = JSON.parse(localStorage.getItem(USER_KEY) || '{}');
      user.firstName = payload.firstName;
      user.lastName = payload.lastName;
      user.address = payload.address;
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    } catch (err) {
      show($('profileError'), err.message || 'Unable to save profile.');
    }
  });

  const deleteBtn = $('deleteAccountBtn');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', async () => {
      const confirmDelete = confirm('Delete your account? This cannot be undone.');
      if (!confirmDelete) return;
      const password = prompt('Enter your current password to confirm deletion:');
      if (!password) return;
      try {
        await api('/auth/profile', { method: 'DELETE', body: JSON.stringify({ currentPassword: password }) });
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
        window.location.href = '../index.html';
      } catch (err) {
        show($('profileError'), err.message || 'Unable to delete account.');
      }
    });
  }
})();
