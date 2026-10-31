// Only the local library can probe this helper, wake the queue, or open setup.
// No tokens, social credentials, arbitrary URLs, or library contents cross this bridge.
(() => {
  if (!document.querySelector('meta[name="savex-library"]') || globalThis.__saveXBridgeInstalled) return;
  globalThis.__saveXBridgeInstalled = true;
  async function send(type, requestId) {
    try {
      const result = await chrome.runtime.sendMessage({ type, origin: location.origin });
      if (requestId) window.postMessage({ source: 'savex-extension', requestId, ok: !!result?.ok, ready: result?.ready === true, bookmarksReady: result?.bookmarksReady === true, bookmarksSupported: result?.bookmarksSupported === true, version: result?.version || '' }, location.origin);
    } catch { /* A reload invalidates old content scripts; the server heartbeat remains a fallback. */ }
  }
  window.addEventListener('message', event => {
    if (event.source !== window || event.origin !== location.origin || event.data?.source !== 'savex-library') return;
    const { type, requestId } = event.data;
    if (type === 'WAKE_SYNC') void send('CHECK_JOBS');
    else if (type === 'PROBE_EXTENSION') void send('CHECK_JOBS', requestId);
    else if (['OPEN_SETUP', 'OPEN_BOOKMARK_SETUP'].includes(type)) void send(type, requestId);
  });
  void send('CHECK_JOBS');
})();
