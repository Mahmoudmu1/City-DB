/* ======================================================
   Resident Portal – API powered
   - All persistence handled by the PHP API (/api/*)
   - Uses bearer tokens stored in localStorage (TOKEN_KEY)
   - Handles signup, login, dashboard, notices, notifications
   ====================================================== */
(function () {
  const API_BASE = window.__CITY_API_BASE__ || '/City-DB/api/public/index.php';
  const TOKEN_KEY = 'mdkp_token';
  const USER_KEY = 'mdkp_user';

  let cachedUser = null;
  let requestList = [];
  let statusChart;
  let dashboardPollTimer = null;
  let dashboardPollActive = false;

  /* ---------- Generic helpers ---------- */
  const $ = (id) => document.getElementById(id);

  function getToken() {
    return localStorage.getItem(TOKEN_KEY);
  }

  function saveSession(token, user) {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    cachedUser = user;
  }

  function clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    cachedUser = null;
  }

  async function api(path, options = {}) {
    const token = getToken();
    const isFormData = options.body instanceof FormData;
    const headers = Object.assign(
      isFormData ? {} : { 'Content-Type': 'application/json' },
      options.headers || {}
    );
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE}${path}`, {
      credentials: 'same-origin',
      ...options,
      headers,
    });

    const text = await response.text();
    const json = text ? JSON.parse(text) : {};
    if (!response.ok) {
      const message = json.error || 'Request failed';
      throw new Error(message);
    }
    return json.data ?? json;
  }

  async function ensureUser(expectedRole = 'resident') {
    if (cachedUser) {
      if (expectedRole && cachedUser.role !== expectedRole) throw new Error('Forbidden');
      return cachedUser;
    }

    const local = localStorage.getItem(USER_KEY);
    if (local) {
      try {
        const parsed = JSON.parse(local);
        cachedUser = parsed;
        if (expectedRole && parsed.role !== expectedRole) {
          throw new Error('Forbidden');
        }
        return parsed;
      } catch {
        // ignore
      }
    }

    const me = await api('/auth/me');
    cachedUser = {
      id: me.id,
      email: me.email,
      firstName: me.firstName,
      lastName: me.lastName,
      address: me.address,
      role: me.role,
    };
    saveSession(getToken(), cachedUser);
    if (expectedRole && me.role !== expectedRole) throw new Error('Forbidden');
    return cachedUser;
  }

  function show(el, msg, timeout = 3000) {
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('d-none');
    setTimeout(() => el.classList.add('d-none'), timeout);
  }

  function setSubmitState(btn, isLoading, loadingText = 'Submitting…') {
    if (!btn) return;
    if (!btn.dataset.originalHtml) {
      btn.dataset.originalHtml = btn.innerHTML;
    }
    btn.disabled = isLoading;
    btn.innerHTML = isLoading
      ? `<span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>${loadingText}`
      : btn.dataset.originalHtml;
  }

  function resolvePhotoUrl(path) {
    if (!path) return '';
    if (/^https?:\/\//i.test(path)) return path;
    if (path.startsWith('/')) return `..${path}`;
    return `../${path}`;
  }

  function initialsSVG(fn = '', ln = '', size = 64) {
    const initials = ((fn?.[0] || '') + (ln?.[0] || '')).toUpperCase() || '?';
    const bg = '#eaeef6';
    const text = '#4b5563';
    const svg = `
      <svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}'>
        <rect width='100%' height='100%' rx='${size / 2}' ry='${size / 2}' fill='${bg}'/>
        <text x='50%' y='55%' text-anchor='middle'
          font-family='Arial, Helvetica, sans-serif' font-size='${size * 0.45}'
          fill='${text}' dy='.1em'>${initials}</text>
      </svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }

  function bindPasswordToggles() {
    document.querySelectorAll('.toggle-pass').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-target');
        const input = $(id);
        if (!input) return;
        const showPass = input.type === 'password';
        input.type = showPass ? 'text' : 'password';
        btn.innerHTML = showPass
          ? '<i class="fa-regular fa-eye-slash"></i>'
          : '<i class="fa-regular fa-eye"></i>';
      });
    });
  }

  bindPasswordToggles();

  /* ---------- Signup ---------- */
  const signupForm = $('signupForm');
  if (signupForm) {
    signupForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      signupForm.classList.add('was-validated');

      const firstName = $('firstName').value.trim();
      const lastName = $('lastName').value.trim();
      const email = $('signupEmail').value.trim().toLowerCase();
      const password = $('signupPassword').value;
      const confirm = $('confirmPassword').value;
      const address = $('address').value.trim();

      const alertErr = $('signupAlert');
      const alertOk = $('signupSuccess');

      if (!firstName || !lastName || !email || password.length < 6) return;
      if (password !== confirm) {
        show(alertErr, 'Passwords do not match.');
        return;
      }

      try {
        await api('/auth/register', {
          method: 'POST',
          body: JSON.stringify({ firstName, lastName, email, password, address }),
        });
        show(alertOk, 'Account created! Redirecting to login…');
        setTimeout(() => (window.location.href = 'login.html'), 900);
      } catch (err) {
        show(alertErr, err.message || 'Unable to register.');
      }
    });
  }

  /* ---------- Login ---------- */
  const loginForm = $('loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      loginForm.classList.add('was-validated');

      const email = $('loginEmail').value.trim().toLowerCase();
      const password = $('loginPassword').value;
      const alertErr = $('loginAlert');

      if (!email || !password) return;

      try {
        const data = await api('/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email, password }),
        });
        saveSession(data.token, data.user);
        window.location.href = 'dashboard.html';
      } catch (err) {
        show(alertErr, err.message || 'Login failed.');
      }
    });
  }

  /* ---------- Logout ---------- */
  const logoutBtn = $('confirmLogoutResident');
  if (logoutBtn && !logoutBtn.dataset.bound) {
    logoutBtn.dataset.bound = '1';
    logoutBtn.addEventListener('click', async () => {
      try {
        await api('/auth/logout', { method: 'POST' });
      } catch {
        // swallow
      }
      clearSession();
      window.location.href = '../index.html';
    });
  }

  /* ---------- Dashboard ---------- */
  const requestTbody = $('requestTbody');
  if (requestTbody) {
    initDashboard().catch(() => {
      window.location.href = 'login.html';
    });
  }

  async function initDashboard() {
    const user = await ensureUser('resident');
    const nameEl = $('residentName');
    if (nameEl) nameEl.textContent = user.firstName || 'Resident';

    const avatar = $('residentAvatar');
    if (avatar) {
      avatar.onerror = () => {
        avatar.onerror = null;
        avatar.src = initialsSVG(user.firstName, user.lastName, 48);
      };
      avatar.src = initialsSVG(user.firstName, user.lastName, 48);
    }
    syncNavAvatar(user);

    await loadRequests();
    renderAll();
    bindRequestForm();
    bindFilter();
    bindRowDetails();
    await hydrateResidentAlerts();
    await loadNotifications();
    startDashboardPolling();
  }

  function bindFilter() {
    const filterSel = $('filterStatus');
    if (filterSel) {
      filterSel.addEventListener('change', renderAll);
    }
  }

  async function loadRequests() {
    const data = await api('/requests');
    requestList = data.requests || [];
  }

  function startDashboardPolling() {
    if (!requestTbody || dashboardPollTimer) return;
    dashboardPollTimer = setInterval(async () => {
      if (dashboardPollActive) return;
      dashboardPollActive = true;
      try {
        await loadRequests();
        renderAll();
        await loadNotifications();
      } catch (err) {
        console.warn('Failed to refresh dashboard', err);
      } finally {
        dashboardPollActive = false;
      }
    }, 10000);
  }

  function renderAll() {
    const stats = computeStats(requestList);
    renderKPIs(stats);
    renderChart(stats);
    renderTable();
  }

  function computeStats(list) {
    return {
      total: list.length,
      pending: list.filter((r) => r.status === 'Pending').length,
      inprog: list.filter((r) => r.status === 'In Progress').length,
      done: list.filter((r) => r.status === 'Completed').length,
      rejected: list.filter((r) => r.status === 'Rejected').length,
    };
  }

  function renderKPIs(stats) {
    $('kpiTotal') && ($('kpiTotal').textContent = stats.total);
    $('kpiPending') && ($('kpiPending').textContent = stats.pending);
    $('kpiInProg') && ($('kpiInProg').textContent = stats.inprog);
    $('kpiDone') && ($('kpiDone').textContent = stats.done);
  }

  function renderTable() {
    const filter = $('filterStatus')?.value || '';
    const view = filter ? requestList.filter((r) => r.status === filter) : requestList;

    if (!view.length) {
      requestTbody.innerHTML =
        '<tr><td colspan="8" class="text-center py-4 text-muted">No requests yet.</td></tr>';
      return;
    }

    requestTbody.innerHTML = view
      .map(
        (r) => `
        <tr data-id="${r.id}">
          <td>${r.id}</td>
          <td class="text-center">
            ${
              r.photo_path
                ? `<button type="button" class="table-thumb-icon-btn" data-photo-path="${escapeHtml(r.photo_path)}" title="View photo">
                    <span class="table-thumb-icon"><i class="fa-solid fa-camera"></i></span>
                  </button>`
                : '—'
            }
          </td>
          <td>${escapeHtml(r.title)}</td>
          <td>${escapeHtml(r.category)}</td>
          <td>${escapeHtml(r.area)}</td>
          <td><span class="badge ${statusBadge(r.status)}">${r.status}</span></td>
          <td>${r.priority}</td>
          <td>${formatDate(r.created_at)}</td>
        </tr>`
      )
      .join('');
    bindResidentPhotoPreview();
  }

  function escapeHtml(str) {
    return (str || '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
  }

  function statusBadge(status) {
    if (status === 'Pending') return 'badge-pending';
    if (status === 'In Progress') return 'badge-inprogress';
    if (status === 'Completed') return 'badge-completed';
    return 'badge-rejected';
  }

  function renderChart(stats) {
    const ctx = $('statusChart');
    if (!ctx) return;

    const isDark = document.documentElement.classList.contains('theme-dark');
    const fills = isDark
      ? ['#60a5fa80', '#fbbf2480', '#34d39980', '#fca5a580']
      : ['#3b82f680', '#f59e0b80', '#10b98180', '#ef444480'];
    const borders = isDark ? ['#60a5fa', '#fbbf24', '#34d399', '#fca5a5'] : ['#3b82f6', '#f59e0b', '#10b981', '#ef4444'];

    const data = [stats.pending, stats.inprog, stats.done, stats.rejected];

    if (statusChart) {
      statusChart.data.datasets[0].data = data;
      statusChart.data.datasets[0].backgroundColor = fills;
      statusChart.data.datasets[0].borderColor = borders;
      statusChart.update();
      return;
    }

    statusChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Pending', 'In Progress', 'Completed', 'Rejected'],
        datasets: [{ data, backgroundColor: fills, borderColor: borders, borderWidth: 2 }],
      },
      options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { usePointStyle: true } } } },
    });

    document.querySelectorAll('.theme-toggle').forEach((btn) => {
      btn.addEventListener('click', () => {
        setTimeout(() => statusChart && statusChart.update(), 200);
      });
    });
  }

  function bindRequestForm() {
    const form = $('requestForm');
    if (!form) return;
    const alertOk = $('newAlert');
    const submitBtn = form.querySelector('button[type="submit"]');
    const areaSelect = document.getElementById('request-area');
    const descriptionInput = $('reqDesc');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      form.classList.add('was-validated');

      const formData = new FormData();
      formData.append('category', $('reqCategory').value);
      formData.append('title', $('reqTitle').value.trim());
      formData.append('area', areaSelect ? areaSelect.value : '');
      formData.append('priority', $('reqPriority').value);
      const descVal = descriptionInput?.value.trim() || '';
      formData.append('description', descVal);
      formData.append('channel', 'web');
      const photoInput = $('reqPhoto');
      if (photoInput && photoInput.files && photoInput.files[0]) {
        const file = photoInput.files[0];
        const maxSize = 5 * 1024 * 1024; // 5MB
        if (file.size > maxSize) {
          photoInput.setCustomValidity('File is too large. Maximum size is 5MB.');
          form.reportValidity();
          return;
        }
        formData.append('photo', file);
      }

      if (areaSelect) areaSelect.setCustomValidity('');
      if (descriptionInput) descriptionInput.setCustomValidity('');

      const requiredFilled =
        formData.get('category') && formData.get('title') && areaSelect?.value && formData.get('description');
      if (!requiredFilled) {
        if (areaSelect && !areaSelect.value) {
          areaSelect.setCustomValidity('Please select an area.');
        }
        if (descriptionInput && !descVal) {
          descriptionInput.setCustomValidity('Description is required.');
        }
      }

      if (areaSelect && areaSelect.value === 'Others') {
        if (descVal.length < 10 && descriptionInput) {
          descriptionInput.setCustomValidity('For "Others", please describe the exact location in more detail.');
        }
      }

      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }

      setSubmitState(submitBtn, true, 'Submitting…');
      try {
        await api('/requests', { method: 'POST', body: formData });
        form.reset();
        form.classList.remove('was-validated');
        if (alertOk) {
          alertOk.classList.remove('alert-danger');
          alertOk.classList.add('alert-success');
        }
        show(alertOk, 'Request submitted!');
        await loadRequests();
        renderAll();
      } catch (err) {
        if (alertOk) {
          alertOk.classList.remove('alert-success');
          alertOk.classList.add('alert-danger');
        }
        show(alertOk, err.message || 'Unable to submit request.');
      } finally {
        setSubmitState(submitBtn, false);
      }
    });
  }

  function bindRowDetails() {
    const modalEl = $('requestDetailsModal');
    if (!modalEl) return;
    const bsModal = new bootstrap.Modal(modalEl);

    requestTbody.addEventListener('click', (e) => {
      const row = e.target.closest('tr');
      if (!row) return;
      const id = row.getAttribute('data-id');
      const item = requestList.find((r) => String(r.id) === id);
      if (!item) return;
      $('detailTitle').textContent = item.title || '-';
      $('detailCategory').textContent = item.category || '-';
      $('detailArea').textContent = item.area || '-';
      $('detailPriority').textContent = item.priority || '-';
      $('detailStatus').textContent = item.status || '-';
      $('detailDesc').textContent = item.description || '(No description provided)';
      $('detailEta').textContent = item.estimated_completion_at ? formatDateTime(item.estimated_completion_at) : '—';
      const photoLabel = $('detailPhotoLabel');
      const photoWrap = $('detailPhotoWrap');
      const photoImg = $('detailPhoto');
      if (item.photo_path && photoImg && photoWrap && photoLabel) {
        photoImg.src = resolvePhotoUrl(item.photo_path);
        photoWrap.classList.remove('d-none');
        photoLabel.classList.remove('d-none');
      } else {
        if (photoImg) photoImg.src = '';
        photoWrap && photoWrap.classList.add('d-none');
        photoLabel && photoLabel.classList.add('d-none');
      }
      renderTimeline(item.timeline || []);
      bsModal.show();
    });
  }

  function bindResidentPhotoPreview() {
    const modalEl = document.getElementById('resident-photo-modal');
    const imgEl = document.getElementById('resident-photo-modal-img');
    if (!modalEl || !imgEl) return;
    const bsModal = new bootstrap.Modal(modalEl);
    const buttons = requestTbody.querySelectorAll('.table-thumb-icon-btn');
    buttons.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const path = btn.getAttribute('data-photo-path') || '';
        const url = resolvePhotoUrl(path);
        if (!url) return;
        imgEl.src = url;
        bsModal.show();
      });
    });
  }

  function formatDate(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString();
  }

  function formatDateTime(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleString();
  }

  function renderTimeline(entries) {
    const host = $('detailTimeline');
    if (!host) return;
    if (!entries.length) {
      host.textContent = 'No updates yet.';
      return;
    }
    host.innerHTML = entries
      .map((entry) => {
        const note = entry.note ? `<div class="text-secondary">${escapeHtml(entry.note)}</div>` : '';
        const actor = entry.actor ? `<span class="ms-1 text-muted">${escapeHtml(entry.actor)}</span>` : '';
        return `
          <div class="border-bottom py-2">
            <div class="fw-semibold">${escapeHtml(entry.status)}${actor}</div>
            <div>${formatDateTime(entry.created_at)}</div>
            ${note}
          </div>`;
      })
      .join('');
  }

  /* ---------- Notices / Alerts ---------- */
  async function hydrateResidentAlerts() {
    const host = $('residentAlertList');
    const empty = $('residentAlertEmpty');
    if (!host) return;

    try {
      const data = await api('/notices');
      const list = (data.notices || []).filter((n) => n.active !== false);
      if (!list.length) {
        host.classList.add('d-none');
        empty?.classList.remove('d-none');
        return;
      }
      host.classList.remove('d-none');
      empty?.classList.add('d-none');
      host.innerHTML = list
        .map(
          (n) => `
          <article class="recent-alert">
            <div>
              <h3 class="h6 mb-1">${escapeHtml(n.title)}</h3>
              <p class="text-secondary small mb-0">${escapeHtml(n.message)}</p>
            </div>
            <div class="small text-nowrap">${formatNoticeWindow(n.start_at, n.end_at)}</div>
          </article>`
        )
        .join('');
    } catch {
      // ignore
    }
  }

  function formatNoticeWindow(start, end) {
    if (!start && !end) return '';
    const opts = { month: 'short', day: 'numeric' };
    const startStr = start ? new Date(start).toLocaleDateString(undefined, opts) : '';
    const endStr = end ? new Date(end).toLocaleDateString(undefined, opts) : '';
    if (startStr && endStr && startStr !== endStr) return `${startStr} – ${endStr}`;
    return startStr || endStr;
  }

  async function hydrateSiteNotices() {
    const host = $('siteNoticeHost');
    const empty = $('recentAlertsEmpty');
    if (!host) return;
    try {
      const data = await api('/notices');
      const list = (data.notices || []).filter((n) => n.active !== false);
      if (!list.length) {
        host.style.display = 'none';
        empty?.classList.remove('d-none');
        return;
      }
      host.style.display = 'block';
      empty?.classList.add('d-none');
      host.innerHTML = list
        .map(
          (n) => `
            <article class="site-notice">
              <h3 class="h6 mb-1">${escapeHtml(n.title)}</h3>
              <p class="small text-secondary mb-0">${escapeHtml(n.message)}</p>
            </article>`
        )
        .join('');
    } catch {
      host.style.display = 'none';
    }
  }
  hydrateSiteNotices();

  /* ---------- Notifications page ---------- */
  const notificationsList = $('notificationsList');
  if (notificationsList) {
    initNotifications().catch(() => (window.location.href = 'login.html'));
  }

  async function initNotifications() {
    await ensureUser('resident');
    const filterType = $('filterType');
    const filterStatus = $('filterStatus');
    const markAll = $('markAllRead');

    async function refresh() {
      const data = await api('/notifications');
      const notices = data.notifications || [];
      renderNotifications(notices);
    }

    function renderNotifications(list) {
      const typeVal = filterType?.value || '';
      const statusVal = filterStatus?.value || '';
      const filtered = list.filter((n) => {
        const typeOk = typeVal ? n.type === typeVal : true;
        const statusOk =
          statusVal === 'active'
            ? !n.readAt
            : statusVal === 'expired'
            ? !!n.readAt
            : statusVal === 'upcoming'
            ? false
            : true;
        return typeOk && statusOk;
      });

      const countEl = $('notificationCount');
      countEl && (countEl.textContent = filtered.length);

      if (!filtered.length) {
        notificationsList.innerHTML =
          '<div class="text-center py-5 text-muted"><i class="fa-solid fa-bell-slash fa-3x mb-3"></i><p>No notifications available</p></div>';
        return;
      }

      notificationsList.innerHTML = filtered
        .map((n) => {
          const payload = n.payload || {};
          return `
            <article class="notification-item ${n.readAt ? 'is-read' : 'is-unread'}">
              <div class="d-flex justify-content-between">
                <div>
                  <h3 class="h6 mb-1">${escapeHtml(payload.title || 'Request Update')}</h3>
                  <p class="mb-1 text-secondary small">${escapeHtml(payload.message || '')}</p>
                  <div class="small text-muted">${new Date(n.createdAt).toLocaleString()}</div>
                </div>
                <span class="notification-pill text-capitalize">${n.type}</span>
              </div>
            </article>`;
        })
        .join('');
    }

    filterType && filterType.addEventListener('change', refresh);
    filterStatus && filterStatus.addEventListener('change', refresh);
    markAll &&
      markAll.addEventListener('click', async () => {
        await api('/notifications/read-all', { method: 'POST' });
        await refresh();
      });

    await refresh();
  }

  async function loadNotifications() {
    await refreshNotificationBadge();
  }

  async function refreshNotificationBadge() {
    const badge = $('notificationBadge');
    if (!badge) return;
    try {
      const data = await api('/notifications');
      const unread = (data.notifications || []).filter((n) => !n.readAt).length;
      if (unread > 0) {
        badge.textContent = unread;
        badge.classList.remove('d-none');
      } else {
        badge.classList.add('d-none');
      }
    } catch {
      badge.classList.add('d-none');
    }
  }

  /* ---------- Nav avatar ---------- */
  function syncNavAvatar(user) {
    const navImg = $('navAvatarImg');
    if (!navImg) return;
    navImg.onerror = () => {
      navImg.onerror = null;
      navImg.src = initialsSVG(user.firstName, user.lastName, 48);
    };
    navImg.src = initialsSVG(user.firstName, user.lastName, 48);
    navImg.alt = `${user.firstName || 'Resident'} avatar`;
  }
})();
