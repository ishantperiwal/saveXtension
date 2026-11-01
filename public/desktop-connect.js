(() => {
  const params = new URLSearchParams(location.search), action = params.get('action') || 'PROBE_EXTENSION';
  const status = document.querySelector('#status'), enable = document.querySelector('#enable');
  let connected = false, attempts = 0;
  const send = type => window.postMessage({ source: 'savex-library', type, requestId: `desktop-${crypto.randomUUID()}` }, location.origin);
  window.addEventListener('message', event => {
    if (event.source !== window || event.origin !== location.origin || event.data?.source !== 'savex-extension' || !event.data?.ok) return;
    connected = true;
    const needsBookmarks = action === 'OPEN_BOOKMARK_SETUP', ready = needsBookmarks ? event.data.bookmarksReady : action === 'OPEN_SETUP' ? event.data.ready : event.data.ready || event.data.bookmarksReady;
    document.querySelector('h1').textContent = ready ? 'Your browser is connected.' : 'Allow your selected sources.';
    status.textContent = ready ? 'Return to saveXtension. Syncing runs in the background using this browser.' : 'Open the saveXtension helper and approve background access. Your desktop app will continue automatically.';
    enable.hidden = !!ready;
    if (ready && params.get('desktop') === '1') send('CLOSE_DESKTOP_CONNECT');
  });
  enable.onclick = () => send(action === 'OPEN_BOOKMARK_SETUP' ? 'OPEN_BOOKMARK_SETUP' : 'OPEN_SETUP');
  const interval = setInterval(() => {
    send('PROBE_EXTENSION');
    if (++attempts >= 30) { clearInterval(interval); if (!connected) status.textContent = 'The browser helper isn’t installed or enabled yet. Return to the desktop app for setup.'; }
  }, 1000);
  send('PROBE_EXTENSION');
})();
