(() => {
  if (parent === window || new URLSearchParams(location.search).get('embedded') !== 'nexus') return;
  try {
    const host = parent.document.documentElement;
    const root = document.documentElement;
    const module = document.currentScript.dataset.module;
    root.dataset.embedded = 'nexus';
    root.dataset.nexusModule = module;
    if (module === 'investment-desk') window.ptNexusActive = parent.document.body.dataset.nexusView === 'investment';
    function inheritTheme() {
      const theme = host.dataset.theme;
      if ((theme === 'dark' || theme === 'light') && root.dataset.theme !== theme) root.dataset.theme = theme;
    }
    inheritTheme();
    if (module === 'resource-center') return; // Subsequent updates use the existing monitor messages.
    const observer = new MutationObserver(inheritTheme);
    observer.observe(host, { attributes: true, attributeFilter: ['data-theme'] });
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
  } catch {
    // Standalone and cross-origin instances keep their own theme.
  }
})();
