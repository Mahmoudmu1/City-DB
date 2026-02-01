// Theme toggle with system detection + persistence (supports multiple buttons)
(() => {
    const KEY = 'mdkp_theme';
    const html = document.documentElement;
    const saved = localStorage.getItem(KEY);
  
    if (!saved) {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (prefersDark) { html.classList.add('theme-dark'); localStorage.setItem(KEY, 'dark'); }
    } else if (saved === 'dark') {
      html.classList.add('theme-dark');
    }
  
    function updateIcon(btn) {
      if (!btn) return;
      const isDark = html.classList.contains('theme-dark');
      btn.innerHTML = isDark ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
      btn.classList.toggle('btn-dark', !isDark);
      btn.classList.toggle('btn-light', isDark);
    }
  
    function bindAllToggles() {
      const buttons = document.querySelectorAll('.theme-toggle');
      buttons.forEach(btn => {
        updateIcon(btn);
        btn.addEventListener('click', () => {
          html.classList.toggle('theme-dark');
          localStorage.setItem(KEY, html.classList.contains('theme-dark') ? 'dark' : 'light');
          buttons.forEach(updateIcon); // keep all buttons in sync
        });
      });
    }
  
    window.addEventListener('DOMContentLoaded', bindAllToggles);
  })();
  