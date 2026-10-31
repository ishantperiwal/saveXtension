// Dedicated sync tabs do not paint. Let pending UI layout callbacks run on a
// timer as well, so virtualized lists can react to programmatic scrolling.
(() => {
  if (location.hash !== '#savex-sync' || window.__savexBackgroundFrames) return;
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
