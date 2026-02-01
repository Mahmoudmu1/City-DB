(() => {
  const API_BASE = window.__CITY_API_BASE__ || '/City-DB/api/public/index.php';
  const TOKEN_KEY = 'mdkp_token';

  const form = document.getElementById('feedbackForm');
  if (!form) return;

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

  function ensureSession() {
    const token = getToken();
    if (!token) {
      window.location.href = 'login.html';
    }
  }

  function show(el, message) {
    if (!el) return;
    el.textContent = message;
    el.classList.remove('d-none');
    setTimeout(() => el.classList.add('d-none'), 3000);
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

  ensureSession();

  const submitBtn = document.getElementById('feedbackSubmit');
  const successEl = document.getElementById('feedbackSuccess');
  const errorEl = document.getElementById('feedbackError');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    form.classList.add('was-validated');

    const rating = parseInt(document.getElementById('feedbackRating').value, 10);
    const category = document.getElementById('feedbackCategory').value;
    const comments = document.getElementById('feedbackComments').value.trim();

    if (!rating || !category) return;

    setSubmitState(submitBtn, true, 'Sending…');

    try {
      await api('/feedback', {
        method: 'POST',
        body: JSON.stringify({ rating, category, comments, channel: 'resident_portal' }),
      });
      form.reset();
      form.classList.remove('was-validated');
      show(successEl, 'Thank you for your feedback!');
    } catch (err) {
      show(errorEl, err.message || 'Unable to send feedback.');
    } finally {
      setSubmitState(submitBtn, false);
    }
  });
})();
