import { embedTarget } from './embed-target.js';
const holders = new Map();
let previewOrigin;
export function configureEmbeds(origin) { previewOrigin = origin; }
const observer = new IntersectionObserver(entries => {
  for (const entry of entries) if (entry.isIntersecting) { observer.unobserve(entry.target); load(entry.target); }
}, { rootMargin: '120px 0px' });
function unavailable(holder) {
  const item = holders.get(holder); if (!item) return;
  clearTimeout(item.timer); item.frame?.remove(); item.frame = null;
  holder.dataset.embedState = 'failed'; holder.querySelector('.embed-error').hidden = false;
}
function load(holder) {
  const item = holders.get(holder); if (!item || item.frame || !holder.isConnected) return;
  const target = embedTarget(holder.dataset.postUrl); if (!target || !previewOrigin) return unavailable(holder);
  holder.dataset.embedState = 'loading'; holder.querySelector('.embed-error').hidden = true;
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
      clearTimeout(item.timer); holder.dataset.embedState = 'ready';
    } else if (event.data.type === 'resize' && Number.isFinite(event.data.height)) item.frame.style.height = `${Math.max(180, Math.min(2600, event.data.height))}px`;
    else if (event.data.type === 'failed') { holder.dataset.embedError = String(event.data.reason || '').slice(0, 200); unavailable(holder); }
    break;
  }
});
export function disposeEmbeds(root) {
  for (const [holder, item] of holders) if (!holder.isConnected || root?.contains(holder)) { clearTimeout(item.timer); observer.unobserve(holder); item.frame?.remove(); holders.delete(holder); }
}
export function setEmbedTheme(theme) {
  for (const [holder, item] of holders) {
    if (!item.frame) continue;
    if (embedTarget(holder.dataset.postUrl)?.platform === 'x') {
      // X's widget chooses its palette when created. Instagram keeps its native
      // post and player; only its surrounding preview surface changes.
      clearTimeout(item.timer); item.frame.remove(); item.frame = null; load(holder);
    } else item.frame.contentWindow.postMessage({ source: 'savex-library-theme', theme }, previewOrigin);
  }
}
export function mountEmbeds(root = document, eager = false) {
  disposeEmbeds();
  root.querySelectorAll('.native-embed').forEach(holder => {
    if (holders.has(holder)) return;
    holders.set(holder, { frame: null, timer: null });
    holder.querySelector('[data-embed-retry]').onclick = () => load(holder);
    if (eager) load(holder); else observer.observe(holder);
  });
}
