(() => {
  const storageKey = 'supplementlens-theme';
  const savedTheme = localStorage.getItem(storageKey);
  let theme = savedTheme === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = theme;

  function mountThemeToggle() {
    const nav = document.querySelector('.site-nav');
    if (!nav) return;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'theme-toggle';
    button.setAttribute('aria-pressed', String(theme === 'dark'));

    const updateButton = () => {
      const targetTheme = theme === 'dark' ? 'light' : 'dark';
      const icon = theme === 'dark'
        ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.9 13A8.5 8.5 0 0 1 11 3.1 8.5 8.5 0 1 0 20.9 13Z"/></svg>'
        : '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/></svg>';
      button.innerHTML = icon;
      button.setAttribute('aria-label', `Switch to ${targetTheme} mode`);
      button.title = `Switch to ${targetTheme} mode`;
      button.setAttribute('aria-pressed', String(theme === 'dark'));
    };

    button.addEventListener('click', () => {
      theme = theme === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = theme;
      localStorage.setItem(storageKey, theme);
      updateButton();
    });

    updateButton();
    nav.prepend(button);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountThemeToggle, { once: true });
  } else {
    mountThemeToggle();
  }
})();
