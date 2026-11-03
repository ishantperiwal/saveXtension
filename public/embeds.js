import { embedTarget } from './embed-target.js';
import { animateEmbedStage } from './motion.js';
const holders = new Map(), layoutRoots = new Set();
const MAX_GRID_LOADS = 3;
const RETRY_DELAY = 5000, MAX_RETRY_DELAY = 30000;
let previewOrigin, pumpScheduled = false, retryTimer;
export function configureEmbeds(origin) { previewOrigin = origin; }
function loadingLabel(holder) {
  const label = holder.querySelector('.embed-loading > span:last-child');
  if (label) label.textContent = holder.dataset.embedState === 'queued' ? 'Waiting to load preview…' : holder.dataset.embedState === 'pending' ? 'Preview loads when in view' : 'Loading preview…';
}
function schedulePump() {
  if (pumpScheduled) return;
  pumpScheduled = true;
  requestAnimationFrame(() => { pumpScheduled = false; pump(); });
}
function cancelLoading(item) {
  clearTimeout(item.timer);
  if (item.frame) { item.frame.onload = null; item.frame.onerror = null; item.frame.remove(); }
  item.frame = null; item.loading = false;
}
function pump() {
  clearTimeout(retryTimer);
  const height = innerHeight, now = Date.now(), canRetry = !document.hidden && navigator.onLine;
  const dialog = document.querySelector('dialog[open]');
  let retryAt = Infinity;
  // Read geometry together, before any frame removals or state/style changes.
  const candidates = [], eagerRetries = [];
  for (const [holder, item] of holders) {
    const failed = holder.dataset.embedState === 'failed';
    if (!holder.isConnected || holder.dataset.embedState === 'ready' || item.eager && !failed) continue;
    const rect = holder.getBoundingClientRect();
    const visible = rect.height > 0 && rect.bottom > 0 && rect.top < height;
    const retryVisible = visible && (!dialog || dialog.contains(holder));
    if (failed) {
      if (!canRetry || !retryVisible || !previewOrigin || !embedTarget(holder.dataset.postUrl)) continue;
      if (item.retryAt > now) { retryAt = Math.min(retryAt, item.retryAt); continue; }
      if (item.eager) { eagerRetries.push(holder); continue; }
    }
    const near = rect.height > 0 && rect.bottom > -height && rect.top < height * 2 && (!item.automatic || canRetry && retryVisible);
    candidates.push({ holder, item, visible, near, retryVisible, automatic: failed || item.automatic, distance: visible ? Math.abs((rect.top + rect.bottom) / 2 - height / 2) : Math.max(0, rect.top - height, -rect.bottom) });
  }
  const ranked = candidates.filter(candidate => candidate.near).sort((a, b) =>
    Number(b.visible) - Number(a.visible) || Number(b.item.priority) - Number(a.item.priority) ||
    Number(b.item.loading) - Number(a.item.loading) || Number(a.automatic) - Number(b.automatic) || a.distance - b.distance);
  const wanted = new Set(ranked.slice(0, MAX_GRID_LOADS).map(candidate => candidate.holder));
  for (const { holder, item, near, retryVisible } of candidates) {
    if (item.loading && !wanted.has(holder)) {
      cancelLoading(item);
      if (item.automatic) {
        // Yielding a slot or scrolling away is not another failed attempt.
        item.automatic = false; item.retryAt = now + RETRY_DELAY;
        showFailure(holder);
        if (canRetry && retryVisible) retryAt = Math.min(retryAt, item.retryAt);
        continue;
      }
    }
    // Failed cards retain their metadata/error until a loading slot is free.
    if (holder.dataset.embedState === 'failed') continue;
    if (!item.loading) {
      if (!near) item.priority = false;
      holder.dataset.embedState = near ? 'queued' : 'pending';
      holder.setAttribute('aria-busy', String(near)); loadingLabel(holder);
    }
  }
  for (const { holder, item } of ranked.slice(0, MAX_GRID_LOADS)) if (!item.loading) load(holder, holder.dataset.embedState === 'failed');
  for (const holder of eagerRetries) load(holder, true);
  if (Number.isFinite(retryAt)) retryTimer = setTimeout(schedulePump, Math.max(50, retryAt - Date.now()));
}
// Reprioritize on every scroll, viewport resize and masonry/image/widget reflow.
const observer = new ResizeObserver(schedulePump);
window.addEventListener('scroll', schedulePump, { passive: true, capture: true });
window.addEventListener('resize', schedulePump, { passive: true });
window.addEventListener('online', schedulePump);
window.addEventListener('offline', schedulePump);
document.addEventListener('visibilitychange', schedulePump);
window.addEventListener('pagehide', () => clearTimeout(retryTimer));
function showFailure(holder, item) {
  animateEmbedStage(holder, () => { if (item) cancelLoading(item); holder.dataset.embedState = 'failed'; holder.setAttribute('aria-busy', 'false'); holder.querySelector('.embed-error').hidden = false; });
}
function unavailable(holder) {
  const item = holders.get(holder); if (!item) return;
  item.automatic = false;
  item.failures++; item.retryAt = Date.now() + Math.min(MAX_RETRY_DELAY, RETRY_DELAY * 2 ** Math.min(item.failures - 1, 3));
  showFailure(holder, item);
  schedulePump();
}
export function retryEmbed(holder) {
  const item = holders.get(holder); if (!item) return;
  item.automatic = false; item.failures = 0; item.retryAt = 0;
  animateEmbedStage(holder, () => { cancelLoading(item); delete holder.dataset.embedError; holder.dataset.embedState = 'queued'; holder.querySelector('.embed-error').hidden = true; });
  // An expanded preview has its own immediate slot; it need not wait behind
  // grid requests. A manual grid retry is prioritized within the current view.
  if (item.eager) load(holder);
  else { item.priority = true; holder.dataset.embedState = 'queued'; holder.setAttribute('aria-busy', 'true'); holder.querySelector('.embed-error').hidden = true; loadingLabel(holder); schedulePump(); }
}
function load(holder, automatic = false) {
  const item = holders.get(holder); if (!item || item.frame || !holder.isConnected) return;
  const target = embedTarget(holder.dataset.postUrl); if (!target || !previewOrigin) return unavailable(holder);
  item.loading = true; item.priority = false; item.automatic = automatic;
  animateEmbedStage(holder, () => { holder.dataset.embedState = 'loading'; holder.setAttribute('aria-busy', 'true'); holder.querySelector('.embed-error').hidden = true; loadingLabel(holder); });
  const frame = document.createElement('iframe');
  frame.title = `${target.platform === 'x' ? 'X' : 'Instagram'} original post`;
  frame.setAttribute('sandbox', 'allow-scripts allow-popups allow-popups-to-escape-sandbox allow-presentation allow-same-origin');
  frame.allow = 'fullscreen; encrypted-media; picture-in-picture'; frame.referrerPolicy = 'no-referrer';
  frame.onload = () => frame.contentWindow?.postMessage({ source: 'savex-library-theme', theme: document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light' }, previewOrigin);
  frame.src = `${previewOrigin}${target.path}?theme=${document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'}`; item.frame = frame; holder.querySelector('.embed-stage').append(frame);
  item.timer = setTimeout(() => unavailable(holder), 24000);
  frame.onerror = () => unavailable(holder);
}
window.addEventListener('message', event => {
  if (event.data?.source !== 'savex-native-embed') return;
  for (const [holder, item] of holders) {
    if (!item.frame || event.source !== item.frame.contentWindow) continue;
    if (event.data.type === 'ready') {
      clearTimeout(item.timer); item.loading = false; item.automatic = false; item.failures = 0; item.retryAt = 0; animateEmbedStage(holder, () => { holder.dataset.embedState = 'ready'; holder.setAttribute('aria-busy', 'false'); }); schedulePump();
    } else if (event.data.type === 'resize' && Number.isFinite(event.data.height)) animateEmbedStage(holder, () => { item.frame.style.height = `${Math.max(180, Math.min(2600, event.data.height))}px`; });
    else if (event.data.type === 'failed') { holder.dataset.embedError = String(event.data.reason || '').slice(0, 200); unavailable(holder); }
    break;
  }
});
export function disposeEmbeds(root) {
  let removed = false;
  for (const [holder, item] of holders) if (!holder.isConnected || root?.contains(holder)) { cancelLoading(item); observer.unobserve(holder); holders.delete(holder); removed = true; }
  for (const element of layoutRoots) if (!element.isConnected) { observer.unobserve(element); layoutRoots.delete(element); }
  if (removed) schedulePump();
}
export function setEmbedTheme(theme) {
  for (const [holder, item] of holders) {
    if (!item.frame) continue;
    if (embedTarget(holder.dataset.postUrl)?.platform === 'x') retryEmbed(holder);
    else item.frame.contentWindow.postMessage({ source: 'savex-library-theme', theme }, previewOrigin);
  }
}
export function mountEmbeds(root = document, eager = false) {
  disposeEmbeds();
  if (root instanceof Element && !layoutRoots.has(root)) { layoutRoots.add(root); observer.observe(root); }
  root.querySelectorAll('.native-embed').forEach(holder => {
    if (holders.has(holder)) { loadingLabel(holder); return; }
    holders.set(holder, { frame: null, timer: null, eager, loading: false, priority: false, automatic: false, failures: 0, retryAt: 0 });
    holder.addEventListener('error', event => {
      if (event.target.matches?.('.embed-capture-image')) animateEmbedStage(holder, () => { event.target.hidden = true; });
    }, true);
    holder.querySelector('[data-embed-retry]').onclick = () => retryEmbed(holder);
    observer.observe(holder);
    if (eager) load(holder);
  });
  schedulePump();
}
