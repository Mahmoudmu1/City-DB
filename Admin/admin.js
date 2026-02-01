/* ======================================================
   Admin Dashboard – API powered
   ====================================================== */
(function () {
  const API_BASE = window.__CITY_API_BASE__ || '/City-DB/api/public/index.php';
  const TOKEN_KEY = 'mdkp_admin_token';
  const USER_KEY = 'mdkp_admin_user';

  const $ = (id) => document.getElementById(id);

  let adminUser = null;
  let requestList = [];
  let byCategoryChart;
  let byAreaChart;
  let byCategoryChartLarge;
  let byAreaChartLarge;
  let channelChartLarge;
  let departmentList = [];
  const CATEGORY_DEPARTMENT_HINTS = {
    'Road & Drainage': 'Infrastructure & Works',
    Waste: 'Waste Management',
    'Street Lighting': 'Lighting & Electrical',
    Water: 'Utilities & Water',
    Safety: 'Safety & Enforcement',
    Others: 'General Services'
  };
  const CHART_COLORS = ['#3b82f6', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#f97316', '#22d3ee', '#84cc16', '#14b8a6', '#c084fc'];

  function getToken() {
    return localStorage.getItem(TOKEN_KEY);
  }

  async function api(path, options = {}) {
    const headers = Object.assign({ 'Content-Type': 'application/json' }, options.headers || {});
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
    const text = await res.text();
    const json = text ? JSON.parse(text) : {};
    if (!res.ok) throw new Error(json.error || 'Request failed');
    return json.data ?? json;
  }

  async function ensureAdmin() {
    if (adminUser) return adminUser;
    const cached = localStorage.getItem(USER_KEY);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (parsed.role === 'admin') {
          adminUser = parsed;
          return parsed;
        }
      } catch {
        // ignore
      }
    }
    const me = await api('/auth/me');
    if (me.role !== 'admin') throw new Error('Forbidden');
    adminUser = me;
    localStorage.setItem(USER_KEY, JSON.stringify(me));
    return me;
  }

  function show(el, msg) {
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('d-none');
    setTimeout(() => el.classList.add('d-none'), 2500);
  }

  function escapeHtml(str) {
    return (str || '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
  }

  function resolvePhotoUrl(path) {
    if (!path) return '';
    if (/^https?:\/\//i.test(path)) return path;
    if (path.startsWith('/')) return `..${path}`;
    return `../${path}`;
  }

  function formatDateTime(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleString();
  }

  function setActiveView(viewId) {
    document.querySelectorAll('.sidebar .nav-link[data-view]').forEach((link) => {
      const matches = link.getAttribute('data-view') === viewId;
      link.classList.toggle('active', matches);
    });
    document.querySelectorAll('.admin-view').forEach((view) => {
      view.classList.toggle('d-none', view.id !== viewId);
    });
    if (viewId === 'admin-analytics-view') {
      renderAnalyticsCharts();
    }
  }

  function bindNavViews() {
    const links = document.querySelectorAll('.sidebar .nav-link[data-view]');
    if (!links.length) return;
    links.forEach((link) => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const target = link.getAttribute('data-view');
        if (target) setActiveView(target);
      });
    });
    setActiveView('admin-overview-view');
  }

  const tableBody = $('adminTbody');
  if (tableBody) {
    initAdmin().catch(() => (window.location.href = 'login.html'));
  }

  async function initAdmin() {
    const user = await ensureAdmin();
    $('adminName') && ($('adminName').textContent = user.firstName || 'Admin');
    $('adminGreetingName') && ($('adminGreetingName').textContent = user.firstName || 'Administrator');

    const avatar = $('adminAvatar');
    if (avatar) {
      avatar.onerror = () => {
        avatar.onerror = null;
        avatar.src = initialsSVG(user.firstName, user.lastName, 48);
      };
      avatar.src = initialsSVG(user.firstName, user.lastName, 48);
    }

    bindLogout();
    bindNavViews();
    bindCsvButtons();
    bindAnalyticsFilters();
    await loadDepartments();
    await loadRequests();
    renderAll();
    await loadKpis();
    bindFilters();
    bindTableActions();
    bindRequestDetails();
    bindNoticeForm();
    await hydrateNotices();
    loadFeedbackAnalytics();
    loadLatestFeedback();
    loadResponseTimes();
    bindCreateRequestForm();
  }

  async function loadRequests() {
    const data = await api('/requests');
    requestList = data.requests || [];
    await loadContactMessages();
  }

  async function loadKpis() {
    try {
      const stats = await api('/analytics/kpi');
      console.debug('Admin KPI stats:', stats);
      renderKPIs({
        total: stats.total ?? stats.total_requests ?? 0,
        pending: stats.pending ?? stats.pending_requests ?? 0,
        inprog: stats.in_progress ?? stats.inprog ?? 0,
        done: stats.completed ?? stats.completed_requests ?? 0,
        resident_count: stats.resident_count ?? 0,
      });
    } catch {
      // leave existing values rendered from local computeStats
    }
  }

  function renderAll() {
    const stats = computeStats(requestList);
    renderKPIs(stats);
    renderTable();
    renderOverviewCharts(requestList);
    renderChannelOverview(requestList);
    renderAnalyticsCharts();
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
    $('kpiTotal') && ($('kpiTotal').textContent = stats.total ?? 0);
    $('kpiPending') && ($('kpiPending').textContent = stats.pending ?? 0);
    $('kpiInProg') && ($('kpiInProg').textContent = (stats.inprog ?? stats.in_progress ?? 0));
    $('kpiDone') && ($('kpiDone').textContent = (stats.done ?? stats.completed ?? 0));
    $('admin-stat-residents') && ($('admin-stat-residents').textContent = stats.resident_count ?? 0);
  }

  function bindAnalyticsFilters() {
    const start = $('analyticsStart');
    const end = $('analyticsEnd');
    [start, end].forEach((input) => {
      input &&
        input.addEventListener('change', () => {
          renderAnalyticsCharts();
        });
    });
  }

  function bindCsvButtons() {
    const analyticsBtn = $('analyticsCsvBtn');
    if (analyticsBtn && !analyticsBtn.dataset.bound) {
      analyticsBtn.dataset.bound = '1';
      analyticsBtn.addEventListener('click', () => {
        const params = buildAnalyticsExportParams();
        triggerCsvDownload(params);
      });
    }
    const requestsBtn = $('requestsCsvBtn');
    if (requestsBtn && !requestsBtn.dataset.bound) {
      requestsBtn.dataset.bound = '1';
      requestsBtn.addEventListener('click', () => {
        const params = buildRequestFilterParams();
        triggerCsvDownload(params);
      });
    }
  }

  function bindFilters() {
    const search = $('searchText');
    const status = $('filterStatus');
    search && search.addEventListener('input', renderTable);
    status && status.addEventListener('change', renderTable);
    const dept = $('filterDepartment');
    dept && dept.addEventListener('change', renderTable);
  }

  function renderTable() {
    const search = ($('searchText')?.value || '').toLowerCase();
    const status = $('filterStatus')?.value || '';

    const deptFilter = $('filterDepartment')?.value || '';
    const view = requestList.filter((r) => {
      const matchesStatus = status ? r.status === status : true;
      const matchesSearch = search
        ? (r.title || '').toLowerCase().includes(search) ||
          (r.area || '').toLowerCase().includes(search) ||
          (r.email || '').toLowerCase().includes(search)
        : true;
      const matchesDept = deptFilter ? String(r.department_id || '') === deptFilter : true;
      return matchesStatus && matchesSearch && matchesDept;
    });

    if (!view.length) {
      tableBody.innerHTML =
        '<tr><td colspan="11" class="text-center py-4 text-muted">No requests found.</td></tr>';
      return;
    }

    tableBody.innerHTML = view
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
          <td>${escapeHtml(r.department_name || '—')}</td>
          <td>${escapeHtml(r.area)}</td>
          <td class="small">${escapeHtml(r.email || '')}</td>
          <td><span class="badge ${statusBadge(r.status)}">${r.status}</span></td>
          <td>${r.priority}</td>
          <td>${new Date(r.created_at).toLocaleDateString()}</td>
          <td class="actions-cell">
            <div class="btn-group btn-group-sm">
              <button class="btn btn-outline-secondary set-status" data-status="Pending">Approve</button>
              <button class="btn btn-outline-primary set-status" data-status="In Progress">In&nbsp;Progress</button>
              <button class="btn btn-outline-success set-status" data-status="Completed">Completed</button>
              <button class="btn btn-outline-danger set-status" data-status="Rejected">Reject</button>
            </div>
          </td>
        </tr>`
      )
      .join('');
    bindAdminPhotoPreview();
  }

  function statusBadge(status) {
    if (status === 'Pending') return 'badge-pending';
    if (status === 'In Progress') return 'badge-inprogress';
    if (status === 'Completed') return 'badge-completed';
    return 'badge-rejected';
  }

  function bindTableActions() {
    tableBody.addEventListener('click', async (e) => {
      const btn = e.target.closest('.set-status');
      if (!btn) return;
      const row = e.target.closest('tr');
      const id = row?.getAttribute('data-id');
      if (!id) return;
      const newStatus = btn.getAttribute('data-status');
      try {
        await api(`/requests/${id}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: newStatus }),
        });
        await loadRequests();
        renderAll();
      } catch (err) {
        alert(err.message || 'Unable to update request.');
      }
    });
  }

  function bindAdminPhotoPreview() {
    const modalEl = document.getElementById('admin-photo-modal');
    const imgEl = document.getElementById('admin-photo-modal-img');
    if (!modalEl || !imgEl) return;
    const bsModal = new bootstrap.Modal(modalEl);
    const buttons = tableBody.querySelectorAll('.table-thumb-icon-btn');
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

  function bindRequestDetails() {
    const modalEl = $('requestDetailsModal');
    if (!modalEl || tableBody.dataset.detailsBound) return;
    tableBody.dataset.detailsBound = '1';
    const bsModal = new bootstrap.Modal(modalEl);
    tableBody.addEventListener('click', (e) => {
      if (e.target.closest('.set-status')) return;
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
      const photoRow = document.getElementById('admin-request-photo-row');
      const photoWrap = document.getElementById('admin-request-photo-wrap');
      const photoImg = document.getElementById('admin-request-photo-img');
      if (item.photo_path && photoImg && photoRow && photoWrap) {
        photoImg.src = resolvePhotoUrl(item.photo_path);
        photoRow.classList.remove('d-none');
        photoWrap.classList.remove('d-none');
      } else {
        if (photoImg) photoImg.src = '';
        photoRow && photoRow.classList.add('d-none');
        photoWrap && photoWrap.classList.add('d-none');
      }
      renderDetailTimeline(item.timeline || []);
      bsModal.show();
    });
  }

  function groupBy(list, key) {
    const map = new Map();
    list.forEach((item) => {
      const k = (item[key] || '(unknown)').trim();
      map.set(k, (map.get(k) || 0) + 1);
    });
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }

  function renderOverviewCharts(list) {
    const catPairs = groupBy(list, 'category');
    const areaPairs = groupBy(list, 'area').slice(0, 8);

    const catCtx = $('byCategoryChart');
    const areaCtx = $('byAreaChart');
    if (!catCtx || !areaCtx) return;

    const labelsCat = catPairs.map(([k]) => k);
    const dataCat = catPairs.map(([, v]) => v);
    const labelsArea = areaPairs.map(([k]) => k);
    const dataArea = areaPairs.map(([, v]) => v);

    if (!byCategoryChart) {
      byCategoryChart = new Chart(catCtx, {
        type: 'bar',
        data: { labels: labelsCat, datasets: [{ label: 'Reports', data: dataCat, backgroundColor: CHART_COLORS }] },
        options: { responsive: true, plugins: { legend: { display: false } } },
      });
    } else {
      byCategoryChart.data.labels = labelsCat;
      byCategoryChart.data.datasets[0].data = dataCat;
      byCategoryChart.data.datasets[0].backgroundColor = CHART_COLORS;
      byCategoryChart.update();
    }

    if (!byAreaChart) {
      byAreaChart = new Chart(areaCtx, {
        type: 'bar',
        data: {
          labels: labelsArea,
          datasets: [{ label: 'Reports', data: dataArea, backgroundColor: CHART_COLORS.slice(0, labelsArea.length) }],
        },
        options: { responsive: true, plugins: { legend: { display: false } }, indexAxis: 'y' },
      });
    } else {
      byAreaChart.data.labels = labelsArea;
      byAreaChart.data.datasets[0].data = dataArea;
      byAreaChart.data.datasets[0].backgroundColor = CHART_COLORS.slice(0, labelsArea.length);
      byAreaChart.update();
    }
  }

  function renderDetailTimeline(entries) {
    const host = $('detailTimeline');
    if (!host) return;
    if (!entries.length) {
      host.textContent = 'No updates yet.';
      return;
    }
    host.innerHTML = entries
      .map(
        (item) => `
        <div class="border-bottom py-2">
          <div class="fw-semibold">${escapeHtml(item.status || '-')}</div>
          <div class="text-secondary small">${escapeHtml(item.note || '') || ''}</div>
          <div class="text-secondary small">${item.created_at ? formatDateTime(item.created_at) : ''}</div>
        </div>`
      )
      .join('');
  }

  function filterRequestsByDate(list) {
    const startVal = $('analyticsStart')?.value;
    const endVal = $('analyticsEnd')?.value;
    const start = startVal ? new Date(startVal) : null;
    const end = endVal ? new Date(`${endVal}T23:59:59`) : null;
    if (!start && !end) return list;
    return list.filter((item) => {
      const created = item.created_at ? new Date(item.created_at) : null;
      if (!created || Number.isNaN(created.getTime())) return false;
      if (start && created < start) return false;
      if (end && created > end) return false;
      return true;
    });
  }

  function renderAnalyticsCharts() {
    const filtered = filterRequestsByDate(requestList);
    const catPairs = groupBy(filtered, 'category');
    const areaPairs = groupBy(filtered, 'area').slice(0, 12);
    const labelsCat = catPairs.map(([k]) => k);
    const dataCat = catPairs.map(([, v]) => v);
    const labelsArea = areaPairs.map(([k]) => k);
    const dataArea = areaPairs.map(([, v]) => v);

    byCategoryChartLarge = renderBarChart(byCategoryChartLarge, 'byCategoryChartLarge', labelsCat, dataCat);
    byAreaChartLarge = renderBarChart(byAreaChartLarge, 'byAreaChartLarge', labelsArea, dataArea, { indexAxis: 'y' });
    renderChannelAnalytics(filtered);
  }

  function renderBarChart(chartRef, ctxId, labels, data, options = {}) {
    const ctx = $(ctxId);
    if (!ctx) return chartRef;
    const config = {
      type: 'bar',
      data: { labels, datasets: [{ label: 'Requests', data, backgroundColor: CHART_COLORS }] },
      options: Object.assign({ responsive: true, plugins: { legend: { display: false } } }, options),
    };
    if (!chartRef) {
      chartRef = new Chart(ctx, config);
    } else {
      chartRef.data.labels = labels;
      chartRef.data.datasets[0].data = data;
      chartRef.data.datasets[0].backgroundColor = CHART_COLORS;
      chartRef.update();
    }
    return chartRef;
  }

  function channelPairs(list) {
    const map = new Map();
    list.forEach((item) => {
      const key = (item.channel || 'Unknown').trim() || 'Unknown';
      map.set(key, (map.get(key) || 0) + 1);
    });
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }

  function renderChannelOverview(list) {
    const host = $('channelBreakdown');
    if (!host) return;
    const pairs = channelPairs(list);
    if (!pairs.length) {
      host.textContent = 'No requests recorded yet.';
      return;
    }
    host.innerHTML = pairs
      .map((item) => `<span class="badge bg-light text-dark me-2 mb-2">${escapeHtml(item[0])}: ${item[1]}</span>`)
      .join('');
  }

  function renderChannelAnalytics(list) {
    const ctx = $('channelChartLarge');
    const empty = $('channelChartEmpty');
    if (!ctx) return;
    const pairs = channelPairs(list);
    if (!pairs.length) {
      if (channelChartLarge) {
        channelChartLarge.destroy();
        channelChartLarge = null;
      }
      empty && empty.classList.remove('d-none');
      return;
    }
    empty && empty.classList.add('d-none');
    const labels = pairs.map(([k]) => k);
    const data = pairs.map(([, v]) => v);
    const colors = CHART_COLORS.slice(0, labels.length || CHART_COLORS.length);
    if (!channelChartLarge) {
      channelChartLarge = new Chart(ctx, {
        type: 'doughnut',
        data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 1 }] },
        options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { usePointStyle: true } } } },
      });
    } else {
      channelChartLarge.data.labels = labels;
      channelChartLarge.data.datasets[0].data = data;
      channelChartLarge.data.datasets[0].backgroundColor = colors;
      channelChartLarge.update();
    }
  }

  async function loadDepartments() {
    const select = $('filterDepartment');
    if (!select) return;
    try {
      const data = await api('/departments');
      departmentList = data.departments || [];
      select.innerHTML = '<option value="">All departments</option>' +
        departmentList.map(dep => `<option value="${dep.id}">${escapeHtml(dep.name)}</option>`).join('');
    } catch {
      select.innerHTML = '<option value="">All departments</option>';
    }
  }

  function renderStars(rating) {
    const safeRating = Math.max(0, Math.min(5, rating || 0));
    const full = '★'.repeat(safeRating);
    const empty = '☆'.repeat(5 - safeRating);
    return `<span class="text-warning">${full}</span><span class="text-muted">${empty}</span>`;
  }

  async function loadFeedbackAnalytics() {
    const avgEl = $('feedbackAverage');
    const countEl = $('feedbackCount');
    if (!avgEl || !countEl) return;
    try {
      const data = await api('/analytics/feedback');
      const avg = data.average !== null && data.average !== undefined ? Number(data.average).toFixed(1) : '--';
      avgEl.textContent = avg;
      countEl.textContent = data.total || 0;
      renderFeedbackCategories(data.byCategory || []);
    } catch {
      avgEl.textContent = '--';
      countEl.textContent = '0';
      renderFeedbackCategories([]);
    }
  }

  function renderFeedbackCategories(list) {
    const host = $('feedbackCategoryBreakdown');
    if (!host) return;
    if (!list.length) {
      host.innerHTML = '<span class="text-secondary">No feedback yet.</span>';
      return;
    }
    host.innerHTML = list
      .map((item) => {
        const avg = item.avg_rating !== null && item.avg_rating !== undefined ? Number(item.avg_rating).toFixed(1) : '--';
        return `<span class="badge bg-light text-dark me-2 mb-2">${escapeHtml(item.category)} · ${avg} ★ (${item.total})</span>`;
      })
      .join('');
  }

  async function loadLatestFeedback() {
    const listEl = $('feedbackList');
    if (!listEl) return;
    try {
      const data = await api('/feedback/latest');
      const items = data.items || [];
      if (!items.length) {
        listEl.innerHTML = '<p class="text-secondary mb-0">No feedback yet.</p>';
        return;
      }
      listEl.innerHTML = items
        .map((item) => {
          const stars = renderStars(item.rating);
          const date = item.created_at ? new Date(item.created_at).toLocaleString() : '';
          const author = item.author ? ` · ${escapeHtml(item.author)}` : '';
          const category = item.category ? `<span class="badge bg-light text-dark ms-1">${escapeHtml(item.category)}</span>` : '';
          return `
            <div class="border-bottom py-2">
              <div>${stars} <span class="text-secondary ms-1">${item.rating}/5</span>${category}</div>
              <div class="text-secondary">${escapeHtml(item.comments || 'No comment')}</div>
              <div class="text-secondary small">${date}${author}</div>
            </div>`;
        })
        .join('');
    } catch {
      listEl.innerHTML = '<p class="text-danger mb-0">Unable to load feedback.</p>';
    }
  }

  async function loadResponseTimes() {
    const firstEl = $('avgResponseTime');
    const resolutionEl = $('avgResolutionTime');
    if (!firstEl || !resolutionEl) return;
    try {
      const data = await api('/analytics/response-times');
      const firstVal = data.average_first_response !== null && data.average_first_response !== undefined
        ? Number(data.average_first_response).toFixed(1)
        : '--';
      const resolutionVal = data.average_resolution !== null && data.average_resolution !== undefined
        ? Number(data.average_resolution).toFixed(1)
        : '--';
      firstEl.textContent = `${firstVal}h`;
      resolutionEl.textContent = `${resolutionVal}h`;
    } catch {
      firstEl.textContent = '--';
      resolutionEl.textContent = '--';
    }
  }

  function bindLogout() {
    const btn = $('confirmLogoutAdmin');
    if (!btn || btn.dataset.bound) return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', async () => {
      try {
        await api('/auth/logout', { method: 'POST' });
      } catch {
        // ignore
      }
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      window.location.href = 'login.html';
    });
  }

  function bindNoticeForm() {
    const addBtn = $('nAdd');
    if (!addBtn) return;
    addBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      const payload = {
        type: $('nType').value,
        title: $('nTitle').value.trim(),
        message: $('nMsg').value.trim(),
        audience: $('nAudience').value,
        startAt: $('nStart').value || null,
        endAt: $('nEnd').value || null,
      };
      if (!payload.title || !payload.message) return;
      try {
        await api('/notices', { method: 'POST', body: JSON.stringify(payload) });
        $('nTitle').value = '';
        $('nMsg').value = '';
        $('nStart').value = '';
        $('nEnd').value = '';
        await hydrateNotices();
      } catch (err) {
        alert(err.message || 'Unable to create notice.');
      }
    });
  }

  async function hydrateNotices() {
    const tbody = $('noticeTbody');
    if (!tbody) return;
    try {
      const data = await api('/notices');
      const list = (data.notices || []).filter((n) => n.audience !== 'guests');
      if (!list.length) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center py-3 text-muted">No notices yet.</td></tr>';
        return;
      }
      tbody.innerHTML = list
        .map(
          (n) => `
            <tr data-id="${n.id}">
              <td><input class="form-check-input toggle-notice" type="checkbox" ${n.active ? 'checked' : ''}></td>
              <td>${n.type}</td>
              <td>${escapeHtml(n.title)}</td>
              <td>${escapeHtml(n.message)}</td>
              <td>${n.start_at ? new Date(n.start_at).toLocaleString() : '—'}</td>
              <td>${n.end_at ? new Date(n.end_at).toLocaleString() : '—'}</td>
              <td class="text-capitalize">${n.audience}</td>
              <td><button class="btn btn-sm btn-outline-secondary toggle-notice">Toggle</button></td>
            </tr>`
        )
        .join('');
      tbody.querySelectorAll('.toggle-notice').forEach((el) => {
        el.addEventListener('click', async (e) => {
          e.preventDefault();
          const row = el.closest('tr');
          if (!row) return;
          const id = row.getAttribute('data-id');
          await api(`/notices/${id}`, { method: 'PATCH', body: JSON.stringify({}) });
          await hydrateNotices();
        });
      });
    } catch {
      tbody.innerHTML = '<tr><td colspan="8" class="text-center py-3 text-danger">Unable to load notices.</td></tr>';
    }
  }

  function bindCreateRequestForm() {
    const form = $('adminCreateRequestForm');
    const submitBtn = $('adminCreateReqSubmit');
    if (!form || !submitBtn || submitBtn.dataset.bound) return;
    submitBtn.dataset.bound = '1';

    const alertBox = $('adminCreateReqAlert');
    const titleInput = $('adminReqTitle');
    const categorySelect = $('adminReqCategory');
    const areaInput = $('adminReqArea');
    const prioritySelect = $('adminReqPriority');
    const channelSelect = $('adminReqChannel');
    const descriptionInput = $('adminReqDesc');
    const deptInput = $('adminReqDepartment');
    const modalEl = document.getElementById('adminCreateRequestModal');
    const modalInstance = modalEl && typeof bootstrap !== 'undefined'
      ? bootstrap.Modal.getOrCreateInstance(modalEl)
      : null;

    const updateDepartmentField = () => {
      if (!deptInput || !categorySelect) return;
      const hint = CATEGORY_DEPARTMENT_HINTS[categorySelect.value] || 'Assigned automatically';
      deptInput.value = hint;
    };

    const flash = (message, type = 'danger') => {
      if (!alertBox) return;
      alertBox.textContent = message;
      alertBox.classList.remove('d-none', 'alert-danger', 'alert-success');
      alertBox.classList.add(type === 'success' ? 'alert-success' : 'alert-danger');
      setTimeout(() => alertBox.classList.add('d-none'), 2500);
    };

    categorySelect && categorySelect.addEventListener('change', updateDepartmentField);
    updateDepartmentField();

    submitBtn.addEventListener('click', async () => {
      form.classList.add('was-validated');
      const payload = {
        title: titleInput?.value.trim() || '',
        category: categorySelect?.value || '',
        area: areaInput?.value.trim() || '',
        priority: prioritySelect?.value || 'Medium',
        channel: channelSelect?.value || 'web',
        description: descriptionInput?.value.trim() || '',
      };

      if (!payload.title || !payload.category || !payload.area || !payload.description) {
        flash('Please fill in all required fields.');
        return;
      }

      try {
        await api('/requests', { method: 'POST', body: JSON.stringify(payload) });
        flash('Request recorded successfully.', 'success');
        form.reset();
        form.classList.remove('was-validated');
        if (prioritySelect) prioritySelect.value = 'Medium';
        if (channelSelect) channelSelect.value = 'web';
        if (categorySelect) categorySelect.value = '';
        updateDepartmentField();
        if (modalInstance) modalInstance.hide();
        await loadRequests();
        renderAll();
      } catch (err) {
        flash(err.message || 'Unable to create request.');
      }
    });
  }

  async function loadContactMessages() {
    const tbody = $('contactFeedbackTbody');
    if (!tbody) return;
    try {
      const data = await api('/feedback/public');
      const items = (data.items || []).slice(0, 5);
      if (!items.length) {
        tbody.innerHTML = '<tr class="text-muted"><td colspan="4" class="text-center py-3">No messages yet.</td></tr>';
        return;
      }
      tbody.innerHTML = items.map((item) => {
        const name = [item.first_name, item.last_name].filter(Boolean).join(' ') || '—';
        const preview = (item.message || '').split('\n')[0].slice(0, 120);
        const msg = preview || '(No message)';
        const date = item.created_at ? new Date(item.created_at).toLocaleString() : '';
        return `<tr><td>${date}</td><td>${escapeHtml(name)}</td><td>${escapeHtml(item.email || '')}</td><td>${escapeHtml(msg)}</td></tr>`;
      }).join('');
    } catch (err) {
      tbody.innerHTML = `<tr class="text-danger"><td colspan="4" class="text-center py-3">${escapeHtml(err.message || 'Unable to load messages')}</td></tr>`;
    }
  }

  function buildRequestFilterParams() {
    const params = new URLSearchParams();
    const status = $('filterStatus')?.value || '';
    const dept = $('filterDepartment')?.value || '';
    const search = $('searchText')?.value.trim() || '';
    if (status) params.set('status', status);
    if (dept) params.set('department_id', dept);
    if (search) params.set('search', search);
    return params;
  }

  function buildAnalyticsExportParams() {
    const params = new URLSearchParams();
    const startVal = $('analyticsStart')?.value || '';
    const endVal = $('analyticsEnd')?.value || '';
    if (startVal) params.set('start_date', startVal);
    if (endVal) params.set('end_date', endVal);
    return params;
  }

  function triggerCsvDownload(params) {
    const query = params.toString();
    const url = `${API_BASE}/admin/requests/export${query ? `?${query}` : ''}`;
    window.location.href = url;
  }

  function initialsSVG(fn = '', ln = '', size = 48) {
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
})();
