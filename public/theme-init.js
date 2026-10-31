// Keep the library and native Instagram previews consistently light for now.
// Apply before CSS paints, including when this browser previously chose dark.
(() => {
  document.documentElement.dataset.theme = 'light';
  document.querySelector('meta[name="theme-color"]').content = '#f8f9f6';
  try { localStorage.setItem('savex-theme', 'light'); } catch { /* This tab still uses light mode. */ }
})();
