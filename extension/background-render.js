// Dedicated sync/unsave tabs do not paint. Let pending UI layout callbacks run
// on a timer as well, so hidden pages can render and commit their controls.
(() => {
  let marked = ['#savex-sync', '#savex-unsave'].includes(location.hash);
  // X removes fragments when normalizing permalinks. Session storage is local
  // to this temporary tab and origin, so the shim also runs at document_start
  // on verification reloads without modifying ordinary social-media tabs.
  try {
    if (marked) sessionStorage.setItem('savex-background-render', '1');
    marked ||= sessionStorage.getItem('savex-background-render') === '1';
  } catch { /* The URL marker still works if the site blocks session storage. */ }
  if (!marked || window.__savexBackgroundFrames) return;
  window.__savexBackgroundFrames = true;
  const nativeRequest = window.requestAnimationFrame.bind(window);
  const nativeCancel = window.cancelAnimationFrame.bind(window);
  let sequence = 0;
  const callbacks = new Map();
  window.requestAnimationFrame = callback => {
    const id = ++sequence;
    const finish = time => {
      const item = callbacks.get(id); if (!item) return;
      callbacks.delete(id); clearTimeout(item.timer); nativeCancel(item.native);
      callback(time);
    };
    const item = { native: nativeRequest(finish), timer: null };
    if (document.hidden) item.timer = setTimeout(() => finish(performance.now()), 100);
    callbacks.set(id, item); return id;
  };
  window.cancelAnimationFrame = id => {
    const item = callbacks.get(id);
    if (item) { callbacks.delete(id); clearTimeout(item.timer); nativeCancel(item.native); }
    else nativeCancel(id);
  };
})();
