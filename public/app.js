import { unsaveDialog } from './unsave.js';
import { orderLibraryPosts, xSequenceAccount } from './source-order.js';
import { openCollectionPicker, closeCollectionPicker } from './collection-picker.js';
import { instagramSaveList, visibleInstagramSaves } from './instagram-save-lists.js';
import { openAccountMenu, closeAccountMenu } from './account-menu.js';
import { syncAvailability, lastSyncTime, syncAge } from './sync-state.js';
import { syncReport, syncRetryRequest } from './sync-report.js';
import { mountSocialAccounts } from './social-accounts.js';
import { syncAccountOptions, legacySyncSelection, syncSelectionRequest } from './sync-selection.js';
import { sidebarAccounts } from './sidebar-accounts.js';
import { embedTarget } from './embed-target.js';
import { mountEmbeds, disposeEmbeds, configureEmbeds, retryEmbed } from './embeds.js';
import { layoutCards, disposeCardLayout, setCardView } from './masonry.js';
import { PRELOAD_SCREENS } from './preview-policy.js';
import { mountWebsitePreviews } from './website-previews.js';
import { createNoteAutosave } from './notes.js';
import { syncNoteLinks } from './note-links.js';
import { animateEmbedStage, setNoteVisibility, finishNoteAnimation } from './motion.js';
import { addedTimeGroup, addedTimeKey, libraryAddedAt } from './saved-time.js';
import { applyFilters, defaultFilters, dateBounds, filterChips, accountOptions } from './filters.js';
import { mountDateRange } from './date-range.js';
import { enhanceSelects, closeSelect } from './select.js';
import { mountMcpSettings } from './mcp-settings.js';
import { topicTree, topicScope, canNest, enableTopicDrag } from './topic-tree.js';
const $ = (selector, root = document) => root.querySelector(selector);
const app = $('#app'), modal = $('#modal'), toastHome = $('#toast').parentElement;
const paths = {
  folder: '<path d="M3 8V7a2 2 0 0 1 2-2h4.5l2 2.5H19a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
  unsave: '<path d="M6 4h12v17l-6-4-6 4zM9 9h6"/>',
  bookmark: '<path d="M6 4h12v17l-6-4-6 4z"/>',
  feed: '<rect x="5" y="3" width="14" height="7" rx="2"/><rect x="5" y="14" width="14" height="7" rx="2"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  star: '<path d="m12 3 2.8 5.8 6.4.9-4.6 4.5 1.1 6.4-5.7-3-5.7 3 1.1-6.4L2.8 9.7l6.4-.9z"/>',
  archive: '<rect x="3" y="3" width="18" height="5" rx="1"/><path d="M5 8v13h14V8M10 12h4"/>',
  restore: '<path d="M4 11a8 8 0 1 1 1 6M4 4v7h7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  arrow: '<path d="M7 17 17 7M7 7h10v10"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/>',
  moon: '<path d="M20.9 13.1A9 9 0 0 1 10.9 3.1 9 9 0 1 0 20.9 13.1Z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 15.36-6.36L21 8M21 3v5h-5M21 12a9 9 0 0 1-15.36 6.36L3 16M3 21v-5h5"/>',
  instagram: '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><path d="M17.5 6.5h.01"/>',
  x: '<path d="m5 3 14 18h-4L1 3h4Zm-2 18L19 3" transform="translate(2 0) scale(.9 1)"/>',
  link: '<path d="m10 13 4-4M8 16l-1 1a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0M16 8l1-1a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0" transform="translate(1 0) scale(.9 1)"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
  list: '<path d="M8 5h13M8 12h13M8 19h13M3 5h.01M3 12h.01M3 19h.01"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z"/><path d="m8 11 3 3 5-5"/>',
  logout: '<path d="M10 4H4v16h6M13 8l4 4-4 4M9 12h12"/>',
  file: '<path d="M14 2H5v20h14V7zM14 2v6h5M8 13h8M8 17h6"/>',
  copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
  pencil: '<path d="M21.17 6.83a2.83 2.83 0 0 0-4-4L3.5 16.5 2 22l5.5-1.5ZM15 5l4 4"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="1"/><path d="m3 17 6-6 4 4 3-3 5 5"/>'
};
const icon = (name, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.bookmark}</svg>`;
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const platformName = p => p === 'x' ? 'X' : p === 'chrome' ? 'Chrome bookmarks' : 'Instagram';
const macKeyboard = /Mac|iPhone|iPad|iPod/i.test(navigator.userAgentData?.platform || navigator.platform || '');
const searchKeys = macKeyboard ? '⌘ F' : 'Ctrl F';
let sourceMarkId = 0;
function sourceIcon(source) {
  const mark = `instagram-mark-${++sourceMarkId}`;
  const svg = content => `<svg class="source-icon source-icon-${source}" viewBox="0 0 24 24" aria-hidden="true">${content}</svg>`;
  if (source === 'instagram') return svg(`<defs><linearGradient id="${mark}" x1="0" y1="1" x2="1" y2="0"><stop stop-color="#fbb04b"/><stop offset=".45" stop-color="#ed386b"/><stop offset="1" stop-color="#9b42ba"/></linearGradient></defs><rect x="1" y="1" width="22" height="22" rx="6" fill="url(#${mark})"/><rect x="5.5" y="5.5" width="13" height="13" rx="4" fill="none" stroke="#fff" stroke-width="1.7"/><circle cx="12" cy="12" r="3.2" fill="none" stroke="#fff" stroke-width="1.7"/><circle cx="16.4" cy="7.7" r="1" fill="#fff"/>`);
  if (source === 'x') return svg('<path fill="currentColor" d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.64 7.584H.47l8.6-9.835L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z"/>');
  if (source === 'chrome') return svg('<path fill="#ea4335" d="M12 1a11 11 0 0 1 9.526 5.5H12a5.5 5.5 0 0 0-4.763 8.25L2.474 6.5A11 11 0 0 1 12 1Z"/><path fill="#fbbc05" d="M21.526 6.5A11 11 0 0 1 12 23l4.763-8.25A5.5 5.5 0 0 0 12 6.5Z"/><path fill="#34a853" d="M12 23A11 11 0 0 1 2.474 6.5l4.763 8.25a5.5 5.5 0 0 0 9.526 0Z"/><circle cx="12" cy="12" r="4.6" fill="#4285f4" stroke="#fff" stroke-width=".9"/>');
  return icon('grid');
}
const selectedSyncAccounts = () => state.syncAccounts ?? legacySyncSelection(state.source, state.xAccount, state.sync?.xAccounts);
const selectedSyncRequest = () => syncSelectionRequest(selectedSyncAccounts(), state.sync?.xAccounts);
const sourceTargets = () => selectedSyncRequest().targets;
const styleSelects = (root = document) => enhanceSelects(root);
const relative = date => {
  const days = Math.floor((Date.now() - Date.parse(date)) / 86400000);
  return days === 0 ? 'Today' : days === 1 ? 'Yesterday' : days < 7 ? `${days} days ago` : new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};
const collapsedInstagramAccounts = new Set();
// Unsave replaced archiving in everyday use. The archive view and its controls
// stay in the code, hidden; the 'savex-show-archive' setting brings them back
// (the browser tests use it to keep archiving covered).
let SHOW_ARCHIVE = false;
try { SHOW_ARCHIVE = localStorage.getItem('savex-show-archive') === 'true'; } catch { /* Archive stays hidden. */ }
const collapsedTopics = new Set();
try { const saved = JSON.parse(localStorage.getItem('savex-collapsed-topics')); if (Array.isArray(saved)) for (const id of saved) if (typeof id === 'string') collapsedTopics.add(id); } catch { /* Start with subfolders expanded. */ }
try { const saved = JSON.parse(localStorage.getItem('savex-collapsed-instagram')); if (Array.isArray(saved)) for (const account of saved) if (typeof account === 'string') collapsedInstagramAccounts.add(account); } catch { /* Start with collections expanded. */ }
let storedSyncAccounts = null;
try { const saved = JSON.parse(localStorage.getItem('savex-sync-accounts')); if (Array.isArray(saved) && saved.every(value => /^(x:(current|@[a-z0-9_]{1,30})|instagram:current|chrome:\*)$/.test(value))) storedSyncAccounts = [...new Set(saved)]; } catch { /* Migrate previous source choices. */ }
const state = { cardView: localStorage.getItem('savex-card-view') === 'grid' ? 'grid' : 'feed', topicsView: localStorage.getItem('savex-topics-view') === 'cards' ? 'cards' : 'folders', sidebarView: localStorage.getItem('savex-sidebar-view') === 'collections' ? 'collections' : 'accounts', syncAccounts: storedSyncAccounts, instagramCollections: [], instagramSaveLists: {}, topicCatalog: [], posts: [], runs: [], filters: defaultFilters(), query: '', archive: false, demo: false, busy: false, name: '', localMode: true, sync: null, bridge: null, syncChecking: false, pendingTargets: null, pendingSyncRequest: null, checkingSyncRequest: null, pendingMode: 'quick', source: localStorage.getItem('savex-source') || 'x', xAccount: localStorage.getItem('savex-x-account') || 'current' };
let toastTimer, searchTimer, updatePoll, collectionVersion = 0, searchReturnView = null;
let syncToastTimer, syncToastKey = '', previousSyncJob = null, completedToastJob = null;
const syncReportTimers = new Map(), SYNC_REPORT_DURATION = 8000;
let syncReportTimerJob = '', syncReportTicking = false;
let dismissedSyncJobs = new Set();
try { dismissedSyncJobs = new Set(JSON.parse(sessionStorage.getItem('savex-dismissed-sync-jobs') || '[]')); } catch { /* First notification in this tab. */ }
function restoreModalToast() {
  const el = $('#toast');
  if (el?.parentElement !== modal) return;
  if (el.matches(':popover-open')) el.hidePopover();
  el.removeAttribute('popover'); el.className = ''; toastHome.append(el); clearTimeout(toastTimer);
}
function toast(message, error = false, position = '', detail = '') {
  const el = $('#toast');
  if (el.matches(':popover-open')) el.hidePopover();
  el.removeAttribute('popover');
  const host = position === 'bottom-center' && modal.open ? modal : toastHome;
  if (el.parentElement !== host) host.append(el);
  el.textContent = message; el.className = `visible ${error ? 'error' : ''} ${position} ${detail ? 'with-detail' : ''}`;
  if (detail) {
    const description = document.createElement('span');
    description.className = 'toast-detail'; description.textContent = detail; el.append(description);
  }
  // Centered feedback must remain visible above a modal's top layer.
  if (position === 'bottom-center' && el.showPopover) { el.setAttribute('popover', 'manual'); el.showPopover(); }
  clearTimeout(toastTimer); toastTimer = setTimeout(() => {
    if (el.matches(':popover-open')) el.hidePopover();
    el.removeAttribute('popover'); el.className = ''; if (el.parentElement !== toastHome) toastHome.append(el);
  }, 4200);
}
async function api(path, { method = 'GET', body, keepalive = false } = {}) {
  const res = await fetch(`/api${path}`, { method, credentials: 'same-origin', keepalive, headers: body === undefined ? {} : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const result = await res.json();
  if (!res.ok) { if (res.status === 401 && !['/login', '/setup'].includes(path)) boot(); throw new Error(result.error || 'Request failed.'); }
  return result;
}
let activeNote = null, activeNoteScope = null;
const openNoteIds = new Set(), expandedNoteIds = new Set(), noteStates = new Map();
const noteKey = post => `${post.id}:${post.url}`;
const notes = createNoteAutosave({
  storage: localStorage,
  save: (id, value) => api(`/posts/${id}`, { method: 'PATCH', body: { notes: value }, keepalive: true }),
  onSaved: post => {
    state.posts = notes.overlay(state.posts.map(p => p.id === post.id ? { ...p, notes: post.notes, updatedAt: post.updatedAt } : p));
    updateCollection();
  },
  onState: (post, status) => {
    noteStates.set(noteKey(post), status);
    const current = allPosts().find(p => p.id === post.id && p.url === post.url);
    const card = document.querySelector(`.save-card[data-post-id="${post.id}"]`);
    if (current && card) syncCardNote(card, current);
    if (current) syncPreviewNote(current);
  }
});
function flushActiveNote() { if (activeNote) { void notes.flush(activeNote); activeNote = null; activeNoteScope = null; } }
function showModal(content, wide = false) {
  restoreModalToast();
  clearInterval(updatePoll);
  closeSelect(); closeAccountMenu(); closeCollectionPicker();
  flushActiveNote();
  disposeEmbeds(modal);
  state.pendingTargets = null; state.pendingSyncRequest = null; delete modal.dataset.syncSetup; delete modal.dataset.postId; delete modal.dataset.syncOptions; delete modal.dataset.allSourcesScan;
  document.querySelectorAll('[data-action="sync-options"],[data-action="scan-options"]').forEach(button => button.setAttribute('aria-expanded', 'false'));
  modal.innerHTML = `<button class="icon-button modal-close" aria-label="Close dialog">${icon('close')}</button>${content}`;
  modal.className = wide ? 'wide' : ''; if (!modal.open) modal.showModal();
  $('.modal-close', modal).onclick = () => modal.close();
}
modal.addEventListener('click', e => { if (e.target === modal) { const b = modal.getBoundingClientRect(); if (e.clientX < b.left || e.clientX > b.right || e.clientY < b.top || e.clientY > b.bottom) modal.close(); } });
modal.addEventListener('close', () => { restoreModalToast(); closeSelect(); $('#open-filters')?.setAttribute('aria-expanded', 'false'); document.querySelectorAll('[data-action="sync-options"],[data-action="scan-options"]').forEach(button => button.setAttribute('aria-expanded', 'false')); flushActiveNote(); disposeEmbeds(modal); state.pendingTargets = null; state.pendingSyncRequest = null; delete modal.dataset.syncSetup; delete modal.dataset.postId; delete modal.dataset.syncOptions; delete modal.dataset.allSourcesScan; });

modal.addEventListener('close', () => clearInterval(updatePoll));

// The desktop app downloads and verifies new versions by itself; once one is ready,
// a round button beside the name offers to install it.
let appUpdate = null;
function renderUpdateButton() {
  const button = $('.update-button'); if (!button) return;
  const ready = appUpdate?.phase === 'ready' && !!appUpdate.availableVersion;
  button.hidden = !ready; if (!ready) return;
  const label = `Install saveXtension ${appUpdate.availableVersion}`;
  button.setAttribute('aria-label', label); button.title = `Version ${appUpdate.availableVersion} is ready · click to install`;
}
async function refreshUpdate() {
  if (!window.saveXDesktop?.updateStatus) return;
  try { appUpdate = await window.saveXDesktop.updateStatus(); } catch { return; }
  renderUpdateButton();
}
if (window.saveXDesktop?.updateStatus) { void refreshUpdate(); setInterval(refreshUpdate, 60 * 1000); addEventListener('focus', refreshUpdate); }
async function boot() {
  try {
    const session = await api('/session'); state.name = session.name; state.localMode = session.localMode; configureEmbeds(session.embedOrigin);
    if (!session.authenticated) return authScreen(session.setupRequired);
    const data = await api('/posts?scope=all'); state.posts = notes.overlay(data.posts); state.runs = data.runs; state.topicCatalog = data.topics || []; state.instagramCollections = data.instagramCollections || []; state.instagramSaveLists = data.instagramSaveLists || {}; state.demo = false; render(); void notes.resume(data.posts); if (state.localMode) await syncStatus();
  } catch (e) { app.innerHTML = `<main class="auth-wrap"><h1>Let’s reconnect.</h1><p>${esc(e.message)}</p><button class="primary" id="retry">Try again</button></main>`; $('#retry').onclick = boot; }
}
function authScreen(setup) {
  app.innerHTML = `<main class="auth-layout"><section class="auth-story"><a class="brand" href="/">${icon('bookmark')}<span>save<span class="accent">X</span>tension<span class="brand-dot">.</span></span></a><div><span class="eyebrow">A little less searching</span><h1>Your next great idea.<br>Already saved<br><em>somewhere.</em></h1><p>Bring your Instagram saves and X bookmarks into one thoughtful, searchable home.</p></div><span class="story-foot">Keep the good stuff close. ${icon('arrow')}</span></section><section class="auth-form"><div class="auth-card"><span class="small-logo">${icon('bookmark')}</span><h2>${setup ? 'Make yourself a library.' : 'Welcome back.'}</h2><p>${setup ? 'A private home for everything you want to come back to.' : 'Your collection is right where you left it.'}</p><form id="auth-form">${setup ? '<label>Library name<input name="name" placeholder="My library" maxlength="50" autocomplete="nickname"></label><label>Setup code<input name="code" placeholder="From your server terminal" required autocomplete="off"></label>' : ''}<label>${setup ? 'Choose a password' : 'Password'}<input name="password" type="password" minlength="${setup ? 12 : 1}" maxlength="256" required autocomplete="${setup ? 'new-password' : 'current-password'}" placeholder="${setup ? 'At least 12 characters' : 'Your library password'}"></label><p class="form-error" id="auth-error" role="alert"></p><button class="primary full" type="submit">${setup ? 'Create my library' : 'Open my library'} ${icon('arrow')}</button></form><p class="privacy-note">${icon('shield')} Your social passwords stay with Instagram and X.</p></div></section></main>`;
  $('#auth-form').onsubmit = async e => {
    e.preventDefault(); const button = $('button[type=submit]', e.target); button.disabled = true;
    try { await api(setup ? '/setup' : '/login', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); await boot(); }
    catch (error) { $('#auth-error').textContent = error.message; button.disabled = false; }
  };
}
function allPosts() { return state.demo ? demoPosts : visibleInstagramSaves(state.posts, state.instagramSaveLists); }
function scopedPosts() { return visibleInstagramSaves(allPosts(), state.instagramSaveLists, state.filters.accounts).filter(post => !!post.archived === state.archive); }
function resultsScopeKey() { return JSON.stringify([state.archive, state.demo, state.query, state.filters, state.instagramSaveLists]); }
function filteredPosts() {
  const posts = scopedPosts(), result = applyFilters(posts, state.filters, { query: state.query, topicScope: name => topicScope(state.topicCatalog, name) });
  // Keep the card under the cursor while its edited note changes a search match.
  if (activeNote && activeNoteScope === resultsScopeKey() && !result.some(post => post.id === activeNote.id)) {
    const editing = posts.find(post => post.id === activeNote.id && post.url === activeNote.url);
    if (editing) { result.push(editing); return orderLibraryPosts(result, state.filters); }
  }
  return result;
}
function selectedSource() { return state.filters.sources.length === 1 ? state.filters.sources[0] : 'all'; }
const savesLabel = count => `${count} ${count === 1 ? 'save' : 'saves'}`;
function savesNavigation(count) {
  return `<button class="nav-item all-saves-nav" data-filter="all" data-nav-label="All saves" aria-label="All saves ${count}" title="Browse all saves">${icon('grid')}<span class="nav-label-text">All saves</span><span class="nav-count">${count}</span></button>`;
}
function navItem(filter, label, symbol, count) {
  return `<button class="nav-item ${(filter === 'all' ? !state.filters.sources.length : state.filters.sources.length === 1 && state.filters.sources[0] === filter) ? 'active' : ''}" data-filter="${filter}" data-nav-label="${label}" aria-label="${label} ${count}" title="${label}">${sourceIcon(filter)}<span class="nav-label-text">${filter === 'chrome' ? 'Chrome' : label}</span><span class="nav-count">${count}</span></button>`;
}
function navigationAccounts() { return sidebarAccounts(allPosts(), state.sync?.xAccounts?.accounts || [], state.demo ? [] : state.instagramCollections || [], state.demo ? {} : state.instagramSaveLists); }
function selectedAccountLabel() { return state.filters.accounts.length === 1 ? navigationAccounts().find(account => account.value === state.filters.accounts[0])?.label || '' : ''; }
// New saves imported by the latest sync, keyed like the sidebar rows.
function newSaveCounts() {
  const counts = new Map(), add = (key, count) => counts.set(key, (counts.get(key) || 0) + count);
  for (const result of state.sync?.job?.results || []) {
    if (!(result.imported > 0)) continue;
    add(result.platform === 'chrome' ? 'chrome' : `${result.platform}:${(result.account || '').toLowerCase()}`, result.imported); add('all', result.imported);
  }
  return counts;
}
function renderNewSaves() {
  const counts = newSaveCounts();
  for (const row of document.querySelectorAll('[data-filter="all"], [data-filter="chrome"], [data-nav-account]')) {
    const count = counts.get(row.dataset.navAccount || row.dataset.filter) || 0;
    let badge = $('.nav-new', row);
    if (!count) { badge?.remove(); continue; }
    if (!badge) { badge = document.createElement('span'); badge.className = 'nav-new'; ($('.nav-count', row) || $('.nav-label-text', row)).insertAdjacentElement('afterend', badge); }
    badge.textContent = `+${count}`; badge.title = `${count} new from the last sync`;
  }
}
function renderAccountNavigation() {
  const accounts = navigationAccounts(), collections = state.demo ? [] : state.instagramCollections || [];
  const counts = new Map();
  for (const post of allPosts().filter(post => !post.archived)) for (const id of new Set((post.collections || []).map(collection => collection.id))) counts.set(id, (counts.get(id) || 0) + 1);
  const signature = JSON.stringify([accounts, collections, [...counts], state.instagramSaveLists]);
  for (const [selector, platform] of [['#account-navigation', 'x'], ['#instagram-navigation', 'instagram']]) {
    const root = $(selector); if (!root || root.dataset.signature === signature) continue;
    const focused = root.contains(document.activeElement) ? { account: document.activeElement.dataset.navAccount, collection: document.activeElement.dataset.instagramCollection, toggle: document.activeElement.dataset.collectionsAccount } : null;
    root.innerHTML = accounts.filter(account => account.platform === platform).map(account => {
      const name = account.label === platformName(account.platform) ? account.label : `${platformName(account.platform)} ${account.label}`;
      const selection = instagramSaveList(account.value, state.instagramSaveLists), selected = selection.collectionIds;
      const folders = account.platform === 'instagram' ? collections.filter(collection => account.value === `instagram:${collection.account.toLowerCase()}` && (selected === null || selected.includes(collection.id))) : [];
      const expanded = !collapsedInstagramAccounts.has(account.value), listId = `instagram-collections-${encodeURIComponent(account.value)}`;
      return `<div class="source-account-group ${folders.length ? 'has-collections' : ''}"><button class="nav-item account-nav-item" data-nav-account="${esc(account.value)}" aria-label="${esc(name)} ${account.count}" aria-pressed="false" ${folders.length ? `aria-expanded="${expanded}" aria-controls="${listId}"` : ''} title="${esc(name)}">${sourceIcon(account.platform)}<span class="nav-label-text ${account.label.startsWith('@') ? 'account-handle' : ''}">${esc(account.label)}</span><span class="nav-count">${account.count}</span></button>${folders.length ? `<button type="button" class="collection-toggle" data-action="toggle-collections" data-collections-account="${esc(account.value)}" aria-label="Toggle Instagram collections for ${esc(account.label)}" aria-expanded="${expanded}" aria-controls="${listId}" title="${expanded ? 'Collapse' : 'Expand'} collections">${icon('chevron')}</button><ul id="${listId}" class="instagram-collections" aria-label="Instagram collections for ${esc(account.label)}" ${expanded ? '' : 'hidden'}>${folders.map(collection => `<li><button class="nav-item instagram-collection" data-instagram-collection="${collection.id}" aria-pressed="false" aria-label="${esc(collection.name)} · ${esc(collection.account)} · ${counts.get(collection.id) || 0} saves" title="${esc(collection.name)}"><span class="collection-label">${esc(collection.name)}</span><span class="nav-count">${counts.get(collection.id) || 0}</span></button></li>`).join('')}</ul>` : ''}</div>`;
    }).join('');
    root.dataset.signature = signature;
    if (focused) [...root.querySelectorAll('button')].find(button => focused.account ? button.dataset.navAccount === focused.account : focused.toggle ? button.dataset.collectionsAccount === focused.toggle : button.dataset.instagramCollection === focused.collection)?.focus({ preventScroll: true });
  }
  renderNewSaves();
}
function accountRefreshRequest(value) {
  const [platform, handle] = value.split(':');
  return { targets: [platform], xAccount: platform === 'x' && handle.startsWith('@') ? handle : 'current', ...(platform === 'instagram' && handle.startsWith('@') ? { instagramAccount: handle } : {}) };
}
function accountMenu(trigger, point) {
  if (trigger.dataset.instagramCollection) return collectionRefreshMenu(trigger,point);
  const value = trigger.dataset.navAccount || 'chrome:*';
  const refresh = mode => { void startSync(mode, accountRefreshRequest(value)).catch(error => toast(error.message, true)); };
  const busy = state.syncChecking || ['queued', 'running'].includes(state.sync?.job?.status);
  const items = [{ label: 'Quick scan and refresh', disabled: busy, run: () => refresh('quick') }, { label: 'Deep scan and refresh', disabled: busy, run: () => refresh('deep') }];
  if (value.startsWith('instagram:')) items.push({ label: 'Customize save list', run: () => instagramSaveListDialog(value) });
  closeSelect(); closeCollectionPicker(); openAccountMenu(trigger, items, point);
}
function collectionRefreshRequest(id) {
  const collection=state.instagramCollections.find(item=>String(item.id)===String(id));
  return collection ? {targets:['instagram'],xAccount:'current',instagramAccount:collection.account,instagramCollectionId:collection.id} : null;
}
function collectionRefreshMenu(trigger,point) {
  const request=collectionRefreshRequest(trigger.dataset.instagramCollection);if(!request)return;
  const busy=state.syncChecking||['queued','running'].includes(state.sync?.job?.status)||['queued','running'].includes(state.sync?.unsave?.status);
  const refresh=mode=>{void startSync(mode,request).catch(error=>toast(error.message,true));};
  closeSelect();closeCollectionPicker();
  openAccountMenu(trigger,[{label:'Quick scan and refresh',disabled:busy,run:()=>refresh('quick')},{label:'Deep scan and refresh',disabled:busy,run:()=>refresh('deep')}],point,'Collection options');
}
function instagramSaveListDialog(value) {
  const account = navigationAccounts().find(item => item.value === value);
  if (!account) return;
  const folders = state.instagramCollections.filter(item => value === `instagram:${item.account.toLowerCase()}`);
  const selection = instagramSaveList(value, state.instagramSaveLists), selected = selection.collectionIds ?? folders.map(folder => folder.id);
  const counts = new Map();
  for (const post of state.posts.filter(post => !post.archived)) for (const id of new Set((post.collections || []).map(item => item.id))) counts.set(id, (counts.get(id) || 0) + 1);
  showModal(`<h2>Customize save list</h2><p class="save-list-account">${sourceIcon('instagram')}${esc(account.label)}</p><p class="fine-print">All includes every save. Collections choose the shortcuts below your account.</p><form id="instagram-save-list-form"><div class="save-list-choices" role="group" aria-label="Instagram save list"><label class="filter-choice"><input type="checkbox" name="collection" value="all" ${selection.all ? 'checked' : ''}><span>All</span></label>${folders.map(folder => `<label class="filter-choice"><input type="checkbox" name="collection" value="${folder.id}" ${selected.includes(folder.id) ? 'checked' : ''}><span><span>${esc(folder.name)}</span><span class="sync-account-count">${counts.get(folder.id) || 0}</span></span></label>`).join('')}</div>${!folders.length ? '<p class="fine-print">Refresh Instagram to discover its collections.</p>' : ''}<p id="save-list-error" class="form-error" role="alert"></p><div class="save-list-actions"><button type="button" class="secondary" id="cancel-save-list">Cancel</button><button type="submit" class="primary" id="apply-save-list">Apply</button></div></form>`);
  const form = $('#instagram-save-list-form'), apply = $('#apply-save-list');
  const inputs = [...form.querySelectorAll('[name="collection"]')], all = inputs.find(input => input.value === 'all');
  form.onchange = event => {
    apply.disabled = !inputs.some(input => input.checked);
    $('#save-list-error').textContent = '';
  };
  $('#cancel-save-list').onclick = () => modal.close();
  form.onsubmit = async event => {
    event.preventDefault(); apply.disabled = true;
    try {
      const collectionIds = inputs.filter(input => input !== all && input.checked).map(input => Number(input.value));
      const result = await api('/instagram-save-list', { method: 'POST', body: { account: value.slice('instagram:'.length), all: all.checked, collectionIds } });
      collectionVersion++; state.instagramSaveLists = result.instagramSaveLists;
      state.archive = false; state.filters = { ...defaultFilters(), sources: ['instagram'], accounts: [value] };
      modal.close(); updateCollection();
    } catch (error) { $('#save-list-error').textContent = error.message; apply.disabled = false; }
  };
}
function toggleInstagramCollections(account) {
  const toggle = [...document.querySelectorAll('[data-collections-account]')].find(button => button.dataset.collectionsAccount === account);
  if (!toggle) return;
  const expanded = collapsedInstagramAccounts.has(account);
  if (expanded) collapsedInstagramAccounts.delete(account); else collapsedInstagramAccounts.add(account);
  toggle.setAttribute('aria-expanded', String(expanded)); toggle.title = `${expanded ? 'Collapse' : 'Expand'} collections`;
  const row = [...document.querySelectorAll('[data-nav-account]')].find(button => button.dataset.navAccount === account);
  row?.setAttribute('aria-expanded', String(expanded));
  const list = document.getElementById(toggle.getAttribute('aria-controls')); if (list) list.hidden = !expanded;
  try { localStorage.setItem('savex-collapsed-instagram', JSON.stringify([...collapsedInstagramAccounts])); } catch { /* Keep the current session choice. */ }
  renderSidebarMarkers();
}
function localCollections() {
  const groups = new Map((state.demo ? [] : state.topicCatalog).map(topic => [topic.name, { id: topic.id, name: topic.name, description: topic.description || '', parentId: topic.parentId || null, count: 0 }]));
  const byId = new Map([...groups.values()].map(group => [group.id, group]));
  for (const post of allPosts().filter(post => !post.archived)) {
    // A parent counts each post once, whether it is filed in the parent or a subfolder.
    const counted = new Set();
    for (const name of new Set(post.topics || [])) {
      if (!groups.has(name)) groups.set(name, { name, description: '', parentId: null, count: 0 });
      const group = groups.get(name), parent = byId.get(group.parentId);
      for (const folder of [group, parent]) if (folder && !counted.has(folder)) { counted.add(folder); folder.count++; }
    }
  }
  const catalog = [...groups.values()].filter(group => group.id), loose = [...groups.values()].filter(group => !group.id).sort((a, b) => a.name.localeCompare(b.name));
  return [...catalog, ...loose];
}
function renderTopicNavigation() {
  const root = $('#topic-navigation'); if (!root) return;
  const topics = localCollections();
  const signature = JSON.stringify([topics, [...collapsedTopics]]); if (root.dataset.signature === signature) return;
  const focused = root.contains(document.activeElement) ? document.activeElement.dataset.navTopic : null;
  const drag = (topic, parentId = '') => topic.id ? `data-collection-id="${esc(topic.id)}" data-topic-row="${esc(topic.id)}" ${parentId ? `data-parent-id="${esc(parentId)}"` : ''}` : '';
  const grip = topic => topic.id ? `<span class="topic-grip" data-drag-topic="${esc(topic.id)}" title="Drag to move" aria-hidden="true"></span>` : '';
  const label = topic => `aria-label="${esc(topic.name)} · ${topic.count} saves" aria-pressed="false" title="${esc(topic.description || topic.name)}"`;
  root.innerHTML = topics.length ? topicTree(topics).map(topic => {
    const row = `<button class="nav-item ${topic.children.length ? 'account-nav-item ' : ''}topic-nav-item" data-nav-topic="${esc(topic.name)}" ${drag(topic)} ${label(topic)}>${grip(topic)}${topic.id ? icon('folder').replace('<svg ', `<svg data-drag-topic="${esc(topic.id)}" `) : icon('folder')}<span class="nav-label-text">${esc(topic.name)}</span><span class="nav-count">${topic.count}</span></button>`;
    if (!topic.children.length) return row;
    const expanded = !collapsedTopics.has(topic.id), listId = `topic-children-${topic.id}`;
    return `<div class="source-account-group has-collections topic-group">${row}<button type="button" class="collection-toggle" data-action="toggle-topic" data-topic-id="${esc(topic.id)}" aria-label="Toggle subfolders of ${esc(topic.name)}" aria-expanded="${expanded}" aria-controls="${listId}" title="${expanded ? 'Collapse' : 'Expand'} subfolders">${icon('chevron')}</button><ul id="${listId}" class="instagram-collections topic-children" aria-label="Subfolders of ${esc(topic.name)}" ${expanded ? '' : 'hidden'}>${topic.children.map(child => `<li><button class="nav-item instagram-collection topic-nav-item" data-nav-topic="${esc(child.name)}" ${drag(child, topic.id)} ${label(child)}>${grip(child)}${icon('folder', 'topic-child-icon').replace('<svg ', `<svg data-drag-topic="${esc(child.id)}" `)}<span class="collection-label">${esc(child.name)}</span><span class="nav-count">${child.count}</span></button></li>`).join('')}</ul></div>`;
  }).join('') : '<p class="sidebar-empty">No collections yet.</p>';
  root.dataset.signature = signature;
  if (focused) [...root.querySelectorAll('[data-nav-topic]')].find(button => button.dataset.navTopic === focused)?.focus({ preventScroll: true });
}
function toggleTopic(id) {
  if (collapsedTopics.has(id)) collapsedTopics.delete(id); else collapsedTopics.add(id);
  try { localStorage.setItem('savex-collapsed-topics', JSON.stringify([...collapsedTopics])); } catch { /* Keep the current session choice. */ }
  renderTopicNavigation(); renderSidebarMarkers();
}
// Folder changes morph the rows and tiles they affect into their new places.
function morphTopics(data) {
  const named = () => document.querySelectorAll('#topic-navigation [data-collection-id], .collection-folders [data-collection-id]');
  const name = () => named().forEach(el => { el.style.viewTransitionName = `${el.closest('.collection-folders') ? 'folder' : 'topic'}-${el.dataset.collectionId}`; });
  const apply = () => { collectionVersion++; if (data.posts) state.posts = notes.overlay(data.posts); state.topicCatalog = data.topics; updateCollection(); name(); };
  if (!document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) return apply();
  name();
  document.startViewTransition(apply).finished.finally(() => named().forEach(el => { el.style.viewTransitionName = ''; }));
}
async function moveTopic(id, parentId) {
  const topic = state.topicCatalog.find(t => t.id === id), parent = state.topicCatalog.find(t => t.id === parentId);
  try {
    const data = await api(`/topics/${id}`, { method: 'PATCH', body: { parentId } });
    if (parentId) collapsedTopics.delete(parentId);
    morphTopics(data);
    toast(parentId ? `Moved “${topic?.name}” into “${parent?.name}”` : `Moved “${topic?.name}” to the top level`, false, 'bottom-center');
  } catch (failure) { toast(failure.message, true, 'bottom-center'); }
}
async function arrangeTopics(layout, ids, action) {
  ids = [].concat(ids);
  const first = state.topicCatalog.find(t => t.id === ids[0]), parent = state.topicCatalog.find(t => t.id === action.parentId);
  const topic = ids.length > 1 ? { name: `${ids.length} folders`, parentId: first?.parentId } : first;
  try {
    const data = await api('/topics/layout', { method: 'POST', body: { layout } });
    if (action.type === 'into') collapsedTopics.delete(action.parentId);
    morphTopics(data);
    const label = ids.length > 1 ? topic.name : `“${topic?.name}”`;
    if (action.type === 'into') toast(`Moved ${label} into “${parent?.name}”`, false, 'bottom-center');
    else if (action.type === 'top') toast(`Moved ${label} to the top level`, false, 'bottom-center');
    else if ((topic?.parentId || null) !== (action.parentId || null)) toast(action.parentId ? `Moved ${label} into “${parent?.name}”` : `Moved ${label} to the top level`, false, 'bottom-center');
  } catch (failure) { toast(failure.message, true, 'bottom-center'); }
}
// Topics → All saves opens on the folders; its layout toggle swaps them for every save as grid cards.
function showingTopicsHome() {
  return state.sidebarView === 'collections' && !state.archive && !state.query.trim() && !filterChips(state.filters).length;
}
function showingCollectionFolders() { return showingTopicsHome() && state.topicsView === 'folders'; }
function syncViewToggle() {
  const home = showingTopicsHome();
  for (const button of document.querySelectorAll('.view-toggle button')) {
    const view = button.dataset.topicsView ? 'folders' : button.dataset.cardView;
    button.hidden = home ? view === 'feed' : view === 'folders';
    button.setAttribute('aria-pressed', String(home ? (view === 'folders') === (state.topicsView === 'folders') : view === state.cardView));
  }
}
function renderCollectionFolders() {
  const root = $('#results'), topics = localCollections(), signature = JSON.stringify(topics), tree = topicTree(topics);
  moreResultsObserver?.disconnect(); resultsPosts = [];
  if (!root.querySelector('.collection-folders')) {
    flushActiveNote(); disposeCardLayout(); disposeEmbeds(root);
    root.innerHTML = '<section class="collection-folders" aria-label="Collections"></section>';
  }
  const folders = root.querySelector('.collection-folders');
  if (folders.dataset.signature === signature) return;
  const focused = folders.contains(document.activeElement) ? document.activeElement.dataset.openCollection : null;
  folders.dataset.dropRoot = '';
  folders.innerHTML = tree.length ? tree.map(topic => `<button type="button" class="collection-folder" data-open-collection="${esc(topic.name)}" ${topic.id ? `data-collection-id="${esc(topic.id)}" data-drag-topic="${esc(topic.id)}" data-drop-topic="${esc(topic.id)}"` : ''} aria-label="${esc(topic.name)} · ${savesLabel(topic.count)}${topic.children.length ? ` · ${topic.children.length} ${topic.children.length === 1 ? 'subfolder' : 'subfolders'}` : ''}" title="${esc(topic.description || topic.name)}"><span class="collection-folder-art" aria-hidden="true"><svg viewBox="0 0 160 120" fill="none"><path class="folder-back" d="M12 12h40c5 0 8 2 11 6l6 8h79v76c0 7-5 12-12 12H24c-7 0-12-5-12-12Z"/><path class="folder-front" d="M24 34h112c7 0 12 5 12 12v56c0 7-5 12-12 12H24c-7 0-12-5-12-12V46c0-7 5-12 12-12Z"/></svg><span class="collection-folder-count">${topic.count.toLocaleString()}</span></span><span class="collection-folder-label">${esc(topic.name)}</span>${topic.children.length ? `<span class="collection-folder-sub">${topic.children.length} ${topic.children.length === 1 ? 'subfolder' : 'subfolders'}</span>` : ''}</button>`).join('') : '<p class="sidebar-empty">No collections yet.</p>';
  folders.dataset.signature = signature;
  if (focused) [...folders.querySelectorAll('[data-open-collection]')].find(button => button.dataset.openCollection === focused)?.focus({ preventScroll: true });
}
function localCollectionMenu(trigger, point) {
  const topic = state.topicCatalog.find(topic => topic.id === trigger.dataset.collectionId);
  if (!topic || state.demo) return;
  const hasChildren = state.topicCatalog.some(t => t.parentId === topic.id);
  const parents = state.topicCatalog.filter(t => canNest(state.topicCatalog, topic.id, t.id));
  openAccountMenu(trigger, [
    { label: 'Rename', run: () => collectionDialog(topic, 'rename') },
    ...(!hasChildren && parents.length ? [{ label: 'Move into…', run: () => moveTopicDialog(topic, parents) }] : []),
    ...(topic.parentId ? [{ label: 'Move to top level', run: () => moveTopic(topic.id, null) }] : []),
    { label: 'Delete', danger: true, run: () => collectionDialog(topic, 'delete') }
  ], point, 'Collection options');
}
function moveTopicDialog(topic, parents) {
  showModal(`<h2>Move “${esc(topic.name)}” into…</h2><div class="move-topic-list">${parents.map(parent => `<button type="button" class="nav-item" data-move-parent="${esc(parent.id)}">${icon('folder')}<span class="nav-label-text">${esc(parent.name)}</span></button>`).join('')}</div>`);
  for (const button of modal.querySelectorAll('[data-move-parent]')) button.onclick = () => { modal.close(); void moveTopic(topic.id, button.dataset.moveParent); };
  modal.querySelector('[data-move-parent]')?.focus({ preventScroll: true });
}
function collectionDialog(topic, action) {
  const deleting = action === 'delete';
  showModal(`<h2>${deleting ? 'Delete collection?' : 'Rename collection'}</h2>${deleting ? `<p>Are you sure you want to delete “${esc(topic.name)}”? Its saves will stay in your library and be removed from this collection.${state.topicCatalog.some(t => t.parentId === topic.id) ? ' Its subfolders move to the top level.' : ''}</p>` : ''}<form id="collection-edit-form">${deleting ? '' : `<label>Collection name<input name="name" value="${esc(topic.name)}" maxlength="80" required autocomplete="off"></label>`}<p class="form-error" role="alert"></p><div class="collection-dialog-actions"><button class="secondary" type="button" id="cancel-collection-edit">Cancel</button><button class="primary ${deleting ? 'collection-delete' : ''}" type="submit">${deleting ? 'Delete' : 'Rename'}</button></div></form>`);
  const form = $('#collection-edit-form'), cancel = $('#cancel-collection-edit');
  const restoreFocus = () => ([...document.querySelectorAll('[data-collection-id]')].find(button => button.dataset.collectionId === topic.id) || $('#sidebar-collections-tab'))?.focus({ preventScroll: true });
  modal.addEventListener('close', restoreFocus, { once: true });
  cancel.onclick = () => modal.close();
  if (deleting) cancel.focus(); else { const input = $('input', form); input.focus(); input.select(); }
  form.onsubmit = async event => {
    event.preventDefault();
    const controls = [...form.querySelectorAll('button,input')], error = $('.form-error', form);
    controls.forEach(control => control.disabled = true); error.textContent = '';
    collectionVersion++;
    try {
      const data = await api(`/topics/${topic.id}`, { method: deleting ? 'DELETE' : 'PATCH', ...(deleting ? {} : { body: { name: $('input', form).value.trim() } }) });
      collectionVersion++;
      state.posts = notes.overlay(data.posts); state.topicCatalog = data.topics;
      state.filters.topics = state.filters.topics.flatMap(name => name === topic.name ? deleting ? [] : [data.topic.name] : [name]);
      updateCollection();
      if (form.isConnected) modal.close();
      toast(deleting ? 'Collection deleted' : 'Collection renamed', false, 'bottom-center');
    } catch (failure) {
      error.textContent = failure.message; controls.forEach(control => control.disabled = false);
    }
  };
}
function setTopicsView(view) {
  if (view === state.topicsView) return;
  state.topicsView = view; if (view === 'cards') state.cardView = 'grid';
  try { localStorage.setItem('savex-topics-view', view); if (view === 'cards') localStorage.setItem('savex-card-view', 'grid'); } catch { /* Keep the session's view. */ }
  renderResults();
}
function selectSidebarView(view, focus = false) {
  state.sidebarView = view === 'collections' ? 'collections' : 'accounts';
  for (const button of document.querySelectorAll('[data-sidebar-view]')) {
    const selected = button.dataset.sidebarView === state.sidebarView;
    button.setAttribute('aria-selected', String(selected)); button.tabIndex = selected ? 0 : -1;
    if (selected && focus) button.focus({ preventScroll: true });
  }
  $('#sidebar-accounts-panel').hidden = state.sidebarView !== 'accounts';
  $('#sidebar-collections-panel').hidden = state.sidebarView !== 'collections';
  try { localStorage.setItem('savex-sidebar-view', state.sidebarView); } catch { /* Keep the session's view. */ }
  renderResults();
}
function updateSidebarSelection() {
  document.querySelectorAll('[data-filter]').forEach(button => {
    const active = !state.archive && (button.dataset.filter === 'all' ? !state.filters.sources.length && !state.filters.accounts.length && !state.filters.topics.length && !state.filters.collections?.length && !state.filters.collection : state.filters.accounts.includes(`${button.dataset.filter}:*`) || !state.filters.accounts.length && state.filters.sources.length === 1 && state.filters.sources[0] === button.dataset.filter);
    button.classList.toggle('active', active); button.setAttribute('aria-pressed', active);
  });
  document.querySelectorAll('[data-nav-account]').forEach(button => {
    const value = button.dataset.navAccount, platform = value.split(':')[0];
    const active = !state.archive && (state.filters.accounts.length ? state.filters.accounts.includes(value) || state.filters.accounts.includes(`${platform}:*`) : state.filters.sources.length === 1 && state.filters.sources[0] === platform);
    button.classList.toggle('active', active); button.setAttribute('aria-pressed', active);
  });
  document.querySelectorAll('[data-instagram-collection]').forEach(button => {
    const active = !state.archive && (String(state.filters.collection) === button.dataset.instagramCollection || (state.filters.collections || []).includes(button.dataset.instagramCollection));
    button.classList.toggle('active', active); button.setAttribute('aria-pressed', active);
  });
  document.querySelectorAll('[data-nav-topic]').forEach(button => {
    const active = !state.archive && state.filters.topics.includes(button.dataset.navTopic);
    button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active));
  });
  const archive = $('.archive-nav'); if (archive) { archive.classList.toggle('active', state.archive); archive.setAttribute('aria-pressed', state.archive); }
}
function renderSidebarMarkers() {
  const sidebar = $('.sidebar'), marks = $('.sidebar-selection-marks');
  if (!sidebar || !marks) return;
  const bounds = sidebar.getBoundingClientRect();
  const instagramOwners = navigationAccounts().filter(account => account.platform === 'instagram');
  const selected = [...sidebar.querySelectorAll('[data-filter="all"].active, [data-nav-account].active, [data-filter="chrome"].active, [data-instagram-collection].active')].filter(item => {
    // Instagram currently syncs the signed-in account. Do not imply account
    // switching when a library contains more than one Instagram owner.
    if (item.dataset.navAccount?.startsWith('instagram:') && instagramOwners.length !== 1) return false;
    if (item.dataset.navAccount?.startsWith('instagram:') && state.filters.collection) return false;
    if (!item.getClientRects().length) return false;
    const rect = item.getBoundingClientRect(), clip = item.closest('nav').getBoundingClientRect();
    // Rows sliding under the sticky tabs lose their refresh mark.
    const top = Math.max(clip.top, sidebar.querySelector('.sidebar-tabs-bar')?.getBoundingClientRect().bottom ?? clip.top);
    return rect.top + rect.height / 2 >= top && rect.top + rect.height / 2 <= Math.min(clip.bottom, (sidebar.querySelector('.sidebar-footer')?.getBoundingClientRect().top ?? clip.bottom + 24) - 24) && rect.left + rect.width / 2 >= clip.left && rect.left + rect.width / 2 <= clip.right;
  });
  const previous = new Map([...marks.children].map(button => [button.dataset.syncAccount, button]));
  const busyJob = ['queued', 'running'].includes(state.sync?.job?.status) ? state.sync.job : null;
  const syncing = state.syncChecking ? state.checkingSyncRequest : busyJob;
  const buttons = selected.map(item => {
    const collection=state.instagramCollections.find(collection=>String(collection.id)===item.dataset.instagramCollection);
    const all = item.dataset.filter === 'all';
    const value = all ? 'all' : collection ? `instagram-collection:${collection.id}` : item.dataset.navAccount || 'chrome:*';
    const [platform, handle] = collection ? ['instagram',collection.account] : value.split(':');
    const label = all ? 'all sources' : collection ? `Instagram ${collection.account} · ${collection.name}` : platform === 'x' && handle.startsWith('@') ? `X ${handle}` : platformName(platform);
    const rect = item.getBoundingClientRect();
    let button = previous.get(value);
    if (!button) {
      button = document.createElement('button'); button.type = 'button';
      button.className = 'sidebar-account-refresh'; button.dataset.action = all ? 'scan-options' : collection ? 'refresh-collection' : 'refresh-account'; button.dataset.syncAccount = value;
      if (all) { button.setAttribute('aria-haspopup', 'dialog'); button.setAttribute('aria-controls', 'modal'); button.setAttribute('aria-expanded', 'false'); }
      if(collection)button.dataset.syncCollection=collection.id;
      button.innerHTML = icon('refresh');
    }
    const isSyncing = all ? !!syncing : !!syncing?.targets?.includes(platform) && (platform !== 'x' || syncing.xAccount === 'all' || syncing.xAccount === handle || Array.isArray(syncing.xAccount) && syncing.xAccount.includes(handle) || syncing.xAccount === 'current' && (handle === '*' || handle === '' || state.sync?.xAccounts?.active?.toLowerCase() === handle));
    button.setAttribute('aria-label', `Refresh ${label}`); button.title = `Refresh ${label}`;
    button.setAttribute('aria-busy', String(isSyncing)); button.disabled = !!busyJob || state.syncChecking;
    button.style.top = `${rect.top - bounds.top - sidebar.clientTop + sidebar.scrollTop + rect.height / 2 - 10}px`;
    return button;
  });
  // Preserve the focused/hovered control across sync-status polling.
  if (buttons.length !== marks.children.length || buttons.some((button, index) => button !== marks.children[index])) marks.replaceChildren(...buttons);
}

const sidebarObserver = new ResizeObserver(renderSidebarMarkers);
function render() {
  closeSelect();
  disposeCardLayout();
  sidebarObserver.disconnect();
  const focused = document.activeElement; const focusId = focused?.id; const selection = focused?.selectionStart;
  const posts = allPosts(), live = posts.filter(p => !p.archived);
  app.innerHTML = `<div class="workspace">
    <aside class="sidebar">
      <div class="sidebar-header"><div class="sidebar-brand"><a href="/" class="brand">${icon('bookmark')}<span>save<span class="accent">X</span>tension</span></a><button type="button" class="update-button" data-action="install-update" hidden>${icon('download')}</button></div><button class="icon-button settings-button" data-action="settings" aria-label="Settings & backups" title="Settings & backups">${icon('settings')}</button></div>
      <nav aria-label="Library">
        <div class="source-nav">
          <div class="sidebar-tabs-bar"><div class="sidebar-tabs" role="tablist" aria-label="Browse saves by">
            <button type="button" id="sidebar-accounts-tab" role="tab" data-action="sidebar-view" data-sidebar-view="accounts" aria-controls="sidebar-accounts-panel" aria-selected="${state.sidebarView === 'accounts'}" tabindex="${state.sidebarView === 'accounts' ? 0 : -1}">Accounts</button>
            <button type="button" id="sidebar-collections-tab" role="tab" data-action="sidebar-view" data-sidebar-view="collections" aria-controls="sidebar-collections-panel" aria-selected="${state.sidebarView === 'collections'}" tabindex="${state.sidebarView === 'collections' ? 0 : -1}">Topics</button>
          </div></div>
          ${savesNavigation(live.length)}
          <div id="sidebar-accounts-panel" role="tabpanel" aria-labelledby="sidebar-accounts-tab" ${state.sidebarView === 'accounts' ? '' : 'hidden'}>
          <div id="account-navigation"></div>
          ${navItem('chrome', 'Chrome bookmarks', 'bookmark', live.filter(p => p.platform === 'chrome').length)}
          <div id="instagram-navigation"></div>
          </div>
          <div id="sidebar-collections-panel" role="tabpanel" aria-labelledby="sidebar-collections-tab" ${state.sidebarView === 'collections' ? '' : 'hidden'}><div id="topic-navigation"></div></div>
        </div>
      </nav>
      ${SHOW_ARCHIVE ? `<div class="sidebar-footer"><button class="nav-item archive-nav" data-action="archive-view" aria-label="Archived ${posts.length - live.length}" aria-pressed="false" title="Archived">${icon('archive')}<span class="nav-label-text">Archived</span><span class="nav-count">${posts.length - live.length}</span></button></div>` : ''}
      <div class="sidebar-selection-marks"></div>
    </aside>
    <main class="main">
      <div class="page-content">
        <h1 class="sr-only">${esc(state.filters.topics.join(', ') || selectedAccountLabel() || ({ all: 'All saves', x: 'X', instagram: 'Instagram', chrome: 'Chrome bookmarks' }[selectedSource()]))}</h1>
        <div class="search-tools"><label class="search">${icon('search')}<input id="search" type="search" placeholder="Search" value="${esc(state.query)}" aria-label="Search saves" aria-keyshortcuts="${macKeyboard ? 'Meta' : 'Control'}+F"><kbd aria-label="${macKeyboard ? 'Command' : 'Control'} F">${searchKeys}</kbd></label>
        <div class="view-toggle" role="group" aria-label="Post layout"><button type="button" data-action="topics-view" data-topics-view="folders" aria-label="Folder view" title="Folder view" hidden>${icon('folder')}</button>${['feed', 'grid'].map(view => `<button type="button" data-action="card-view" data-card-view="${view}" aria-label="${view === 'feed' ? 'Feed' : 'Grid'} view" title="${view === 'feed' ? 'Feed' : 'Grid'} view" aria-pressed="${state.cardView === view}">${icon(view)}</button>`).join('')}</div></div>
        <div class="collection-tools"><div class="toolbar-blur" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
          <div class="browse-controls"><button class="filter-button" id="open-filters" data-action="filters" aria-label="Filters" aria-haspopup="dialog" aria-expanded="false">${icon('filter')}<span>Filters</span><span class="filter-count" hidden></span></button><div id="active-filters" class="active-filters" hidden></div></div>
        </div>
        ${state.demo ? '<div class="demo-banner"><span>Sample saves</span><button data-action="exit-demo">Close</button></div>' : ''}
        <div id="results"></div>
      </div>
    </main>
  </div>`;
  const search = $('#search');
  search.onpointerdown = () => rememberSearchView();
  search.onfocus = e => { if (!state.query && (!searchReturnView || searchReturnView.scope !== resultsScopeKey())) rememberSearchView(e.relatedTarget); };
  search.onblur = () => { if (!state.query) searchReturnView = null; };
  search.oninput = e => {
    if (e.target.value && !state.query && !searchReturnView) rememberSearchView();
    state.query = e.target.value;
    if (!state.query) searchReturnView = null;
    clearTimeout(searchTimer); searchTimer = setTimeout(renderResults, 100);
  };
  renderAccountNavigation();
  renderResults();
  renderSync();
  $('.sidebar-tabs').onkeydown = event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key) || !event.target.matches('[role=tab]')) return;
    event.preventDefault();
    const view = event.key === 'Home' ? 'accounts' : event.key === 'End' ? 'collections' : state.sidebarView === 'accounts' ? 'collections' : 'accounts';
    selectSidebarView(view, true);
  };
  // The fade under the pinned tabs appears only once rows actually slide beneath them.
  $('.sidebar nav')?.addEventListener('scroll', event => { event.currentTarget.classList.toggle('is-scrolled', event.currentTarget.scrollTop > 0); renderSidebarMarkers(); }, { passive: true });
  ['.sidebar', '.sidebar-header', '.sidebar nav'].forEach(selector => { const element = $(selector); if (element) sidebarObserver.observe(element); });
  renderUpdateButton();
  if (focusId && document.getElementById(focusId)) { const next = document.getElementById(focusId); next.focus({ preventScroll: true }); if (typeof selection === 'number' && next.type === 'text') next.setSelectionRange(selection, selection); }
}
function renderResults(restoreView) {
  if (!$('#results')) return;
  renderFilterUI();
  if (showingCollectionFolders()) { renderCollectionFolders(); return; }
  if (showingTopicsHome()) state.cardView = 'grid';
  const posts = filteredPosts();
  const pageKey = resultsScopeKey();
  const pageChanged = pageKey !== resultsPageKey;
  if (pageChanged) { resultsPageKey = pageKey; resultsLimits.clear(); }
  const restoring = restoreView?.scope === pageKey;
  if (restoring) { resultsLimits.clear(); for (const [key, limit] of restoreView.limits) resultsLimits.set(key, limit); }
  resultsPosts = posts;
  if (!posts.length && showingChromeSetup()) { moreResultsObserver?.disconnect(); disposeCardLayout(); disposeEmbeds(); renderChromeSetup(); return; }
  if (!posts.length && emptySourcePlatform()) { moreResultsObserver?.disconnect(); disposeCardLayout(); disposeEmbeds(); renderSourceConnect(); return; }
  if (!posts.length) {
    moreResultsObserver?.disconnect();
    disposeCardLayout();
    const emptyLibrary = !scopedPosts().length;
    $('#results').innerHTML = emptyLibrary
      ? state.archive ? '<section class="empty-state"><h2>No archived saves</h2></section>' : `<section class="empty-state"><h2>No saves yet</h2><button class="text-button" data-action="demo">View sample saves</button></section>`
      : `<section class="no-results"><p>${state.query ? 'No matches' : 'No saves here yet'}</p><button class="text-button" data-action="clear">Clear filters</button></section>`;
    disposeEmbeds(); return;
  }
  renderResultsPage(!pageChanged && !restoring);
}
// The desktop app normally reads Chrome's bookmark file by itself. When Chrome keeps it
// somewhere else (common on managed work computers), the Chrome page walks through
// loading the small helper extension, then imports as soon as Chrome connects.
const chromeSetup = { found: null, checking: false, saved: '' };
function showingChromeSetup() {
  return !!window.saveXDesktop?.chromeBookmarksFound && !!state.sync?.nativeSocial?.enabled && !state.demo && !state.archive && !state.query.trim()
    && selectedSource() === 'chrome' && !allPosts().some(post => post.platform === 'chrome' && !post.archived);
}
function renderChromeSetup() {
  const root = $('#results'); if (!root) return;
  if (chromeSetup.found === null && !chromeSetup.checking) {
    chromeSetup.checking = true;
    void window.saveXDesktop.chromeBookmarksFound().then(found => { chromeSetup.found = found; }, () => { chromeSetup.found = false; }).finally(() => { chromeSetup.checking = false; if ($('.chrome-setup') || showingChromeSetup()) renderChromeSetup(); });
  }
  const sync = state.sync || {}, helper = sync.chromeBrowser, online = !!helper?.online, received = !!sync.chromeBookmarkTreeAt;
  const job = sync.job, importing = ['queued', 'running'].includes(job?.status) && job.targets?.includes('chrome');
  const importButton = `<button class="primary" type="button" data-action="import-chrome" ${importing || state.syncChecking ? 'disabled' : ''}>${importing ? 'Importing…' : 'Import bookmarks'}</button>`;
  let body;
  if (chromeSetup.found === null) body = '<p class="chrome-setup-lead">Looking for Chrome’s bookmarks…</p>';
  else if (chromeSetup.found || received) body = `<p class="chrome-setup-lead">${chromeSetup.found ? 'Chrome’s bookmarks are on this computer.' : 'Chrome is connected.'} Bring them into your library; your Chrome bookmarks aren’t changed.</p><div class="chrome-setup-actions">${importButton}</div>`;
  else {
    const status = !online ? ['waiting', 'Waiting for Chrome… This page continues on its own once the helper is loaded.'] : helper.bookmarksReady ? ['connected', 'Chrome is connected. Reading your bookmarks…'] : ['connected', 'Chrome is connected. Allow bookmarks in the saveXtension helper to continue.'];
    body = `<p class="chrome-setup-lead">saveXtension couldn’t find Chrome’s bookmarks on this computer. Work computers often keep them somewhere unusual. A small Chrome helper can share them instead. It’s a one-time, one-minute setup.</p>
      <ol class="chrome-setup-steps">
        <li class="${chromeSetup.saved ? 'is-done' : ''}"><div><strong>Save the helper to Downloads</strong><p>${chromeSetup.saved ? `Saved as <b>Downloads › saveXtension Chrome helper</b>.` : 'A folder named <b>saveXtension Chrome helper</b> appears in your Downloads.'}</p></div><button class="secondary" type="button" data-action="save-chrome-helper">${icon('download')}${chromeSetup.saved ? 'Show folder' : 'Save to Downloads'}</button></li>
        <li><div><strong>Open Chrome’s extensions page</strong><p>Or type <code>chrome://extensions</code> in Chrome’s address bar.</p></div><div class="chrome-setup-buttons"><button class="secondary" type="button" data-action="open-chrome-extensions">Open in Chrome</button><button class="text-button" type="button" data-action="copy-chrome-extensions">Copy address</button></div></li>
        <li><div><strong>Turn on Developer mode</strong><p>It’s the switch in the top-right corner of that page.</p></div></li>
        <li><div><strong>Click Load unpacked and choose the folder</strong><p>Pick <b>Downloads › saveXtension Chrome helper</b>. Your bookmarks start importing right away.</p></div></li>
      </ol>
      <p class="chrome-setup-status is-${status[0]}" role="status" aria-live="polite"><span class="chrome-setup-dot" aria-hidden="true"></span>${status[1]}</p>
      <p class="chrome-setup-note">If Developer mode is greyed out, your organization doesn’t allow extensions on this computer.</p>`;
  }
  const html = `<section class="chrome-setup" aria-labelledby="chrome-setup-title"><span class="chrome-setup-icon" aria-hidden="true">${sourceIcon('chrome')}</span><h2 id="chrome-setup-title">${chromeSetup.found === false && !received ? 'Connect Chrome to bring in your bookmarks' : 'Import your Chrome bookmarks'}</h2>${body}</section>`;
  if (!root.querySelector(':scope > .chrome-setup') || root.dataset.chromeSetup !== html) { root.innerHTML = html; root.dataset.chromeSetup = html; }
}
// Refreshing everything in the desktop app covers what is connected and skips the rest;
// connecting is offered on each source's own empty page instead.
function connectedTargets(targets) {
  const native = state.sync?.nativeSocial; if (!native?.enabled) return targets;
  const connected = new Set(native.accounts.filter(account => account.status === 'connected').map(account => account.platform));
  return targets.filter(target => target === 'chrome' || connected.has(target));
}
// An X or Instagram page with no saves offers to sign in, or to sync once signed in.
const sourceConnect = { awaiting: null };
function emptySourcePlatform() {
  if (!state.sync?.nativeSocial?.enabled || state.demo || state.archive || state.query.trim()) return null;
  const platform = selectedSource(), filters = state.filters;
  if (!['x', 'instagram'].includes(platform) || filters.topics.length || filters.collections?.length || filters.collection || filters.accounts.some(value => value.startsWith(`${platform}:@`))) return null;
  return allPosts().some(post => post.platform === platform && !post.archived) ? null : platform;
}
function sourceSyncRequest(platform) { return { ...selectedSyncRequest(), targets: [platform], xAccount: platform === 'x' ? 'all' : 'current', instagramAccount: 'current' }; }
function renderSourceConnect() {
  const root = $('#results'), platform = emptySourcePlatform(); if (!root || !platform) return;
  const name = platform === 'x' ? 'X' : 'Instagram', what = platform === 'x' ? 'bookmarks' : 'saved posts';
  const accounts = state.sync.nativeSocial.accounts.filter(account => account.platform === platform && account.status === 'connected');
  const job = state.sync.job, syncing = state.syncChecking || ['queued', 'running'].includes(job?.status) && job.targets?.includes(platform);
  // Signing in from this page brings the saves in as soon as the account connects.
  if (accounts.length && sourceConnect.awaiting === platform && !syncing) { sourceConnect.awaiting = null; void startSync('quick', sourceSyncRequest(platform)); }
  const html = accounts.length
    ? `<section class="chrome-setup source-connect" aria-labelledby="source-connect-title"><span class="chrome-setup-icon" aria-hidden="true">${sourceIcon(platform)}</span><h2 id="source-connect-title">No ${name} saves yet</h2><p class="chrome-setup-lead">Connected as ${accounts.map(account => `<b>${esc(account.handle)}</b>`).join(', ')}. Bring in your ${what}; nothing on ${name} changes.</p><div class="chrome-setup-actions"><button class="primary" type="button" data-action="sync-source" data-platform="${platform}" ${syncing ? 'disabled' : ''}>${syncing ? 'Syncing…' : `Sync ${name} now`}</button></div></section>`
    : `<section class="chrome-setup source-connect" aria-labelledby="source-connect-title"><span class="chrome-setup-icon" aria-hidden="true">${sourceIcon(platform)}</span><h2 id="source-connect-title">Connect ${name}</h2><p class="chrome-setup-lead">Sign in once and your ${name} ${what} show up here. You sign in on ${name}’s own page, so saveXtension never sees your password.</p><div class="chrome-setup-actions"><button class="primary" type="button" data-action="connect-source" data-platform="${platform}">Sign in to ${name}</button></div>${sourceConnect.awaiting === platform ? `<p class="chrome-setup-status is-waiting" role="status" aria-live="polite"><span class="chrome-setup-dot" aria-hidden="true"></span>Finish signing in in the ${name} window. Your ${what} start syncing right after.</p>` : ''}</section>`;
  if (!root.querySelector(':scope > .source-connect') || root.dataset.sourceConnect !== html) { root.innerHTML = html; root.dataset.sourceConnect = html; }
}
const CARD_BATCH_SIZE = 24;
const resultsLimits = new Map();
let resultsPageKey, resultsPosts = [], resultsTimeKey = '';
function rememberSearchView(focus = document.activeElement) {
  if (state.query || !$('#results')) return;
  const visible = [...document.querySelectorAll('#results .save-card:not([hidden])')].map(card => ({ id: card.dataset.postId, rect: card.getBoundingClientRect() })).filter(({rect}) => rect.height && rect.bottom > 0 && rect.top < innerHeight).sort((a,b) => Math.abs(a.rect.top) - Math.abs(b.rect.top));
  searchReturnView = { scope: resultsScopeKey(), limits: [...resultsLimits], x: scrollX, y: scrollY, anchor: visible[0] ? { id: visible[0].id, top: visible[0].rect.top } : null, focus: focus === $('#search') ? null : focus };
}
function dismissSearch() {
  const previous = searchReturnView, search = $('#search');
  clearTimeout(searchTimer); state.query = ''; search.value = ''; searchReturnView = null;
  search.blur();
  const restore = previous?.scope === resultsScopeKey() ? previous : null;
  const grid = $('#results > .cards'); grid?.classList.add('restoring-search');
  renderResults(restore);
  if (restore) {
    const anchor = restore.anchor && document.querySelector(`.save-card[data-post-id="${restore.anchor.id}"]`);
    const top = anchor && !anchor.hidden ? scrollY + anchor.getBoundingClientRect().top - restore.anchor.top : restore.y;
    if (restore.focus?.isConnected) restore.focus.focus?.({preventScroll:true});
    window.scrollTo({left:restore.x,top,behavior:'instant'});
  }
  // Commit restored positions before re-enabling normal card movement.
  grid?.getBoundingClientRect(); requestAnimationFrame(() => grid?.classList.remove('restoring-search'));
}
let moreResultsObserver;
function extendResults(entries) {
  let changed = false;
  for (const entry of entries) {
    const key = entry.target.dataset.moreGroup;
    if (!entry.isIntersecting || !entry.target.isConnected) continue;
    resultsLimits.set(key, (resultsLimits.get(key) || CARD_BATCH_SIZE) + CARD_BATCH_SIZE); changed = true;
  }
  if (changed) renderResultsPage();
}
function observeMoreResults() {
  moreResultsObserver?.disconnect();
  moreResultsObserver = new IntersectionObserver(extendResults, { rootMargin: `${innerHeight * PRELOAD_SCREENS}px 0px` });
  document.querySelectorAll('#results .more-saves').forEach(more => moreResultsObserver.observe(more));
}
window.addEventListener('resize', observeMoreResults, {passive:true});
function renderResultsPage(preservePlayers = true) {
  if (!$('#results') || showingCollectionFolders()) return;
  moreResultsObserver?.disconnect();
  const now = Date.now(), groups = new Map();
  const sequenceAccount = xSequenceAccount(state.filters);
  const displayed = new Set(preservePlayers ? [...document.querySelectorAll('#results .save-card')].map(card => card.dataset.postId) : []);
  resultsTimeKey = addedTimeKey(resultsPosts, now);
  for (const post of resultsPosts) {
    const group = sequenceAccount ? {key:'source-sequence',label:''} : addedTimeGroup(libraryAddedAt(post), now);
    if (!groups.has(group.key)) groups.set(group.key, { ...group, posts: [] });
    const section = groups.get(group.key); section.posts.push(post);
    // New saves and moving time boundaries must not evict mounted players.
    if (displayed.has(String(post.id))) resultsLimits.set(group.key, Math.max(resultsLimits.get(group.key) || CARD_BATCH_SIZE, section.posts.length));
  }
  const sections = [...groups.values()].map(group => ({ ...group, limit: resultsLimits.get(group.key) || CARD_BATCH_SIZE }));
  reconcileCards(sections); renderUnsaving();
  observeMoreResults();
}
function renderFilterUI() {
  if (state.filters.collection) {
    const collection = (state.instagramCollections || []).find(c => String(c.id) === String(state.filters.collection));
    if (collection) state.filters.collectionName = collection.name;
  }
  renderAccountNavigation(); renderTopicNavigation();
  requestAnimationFrame(syncToolbar);
  const chips = filterChips(state.filters, { collectionName: id => (state.instagramCollections || []).find(c => String(c.id) === String(id))?.name }), button = $('#open-filters'), badge = $('.filter-count');
  if (badge) { badge.hidden = !chips.length; badge.textContent = chips.length; }
  button?.classList.toggle('has-filters', !!chips.length);
  const active = $('#active-filters');
  if (active) {
    active.hidden = !chips.length;
    active.innerHTML = chips.map(c => `<button class="filter-chip" data-remove-filter="${c.key}" aria-label="${esc(c.removeLabel || `Remove ${c.key} filter`)}" title="${esc(c.title || c.label)}">${c.platform ? sourceIcon(c.platform) : c.icon ? icon(c.icon, 'filter-chip-icon') : ''}${esc(c.label)} ${icon('close')}</button>`).join('') + '<button class="text-button filter-more" data-action="filters" hidden></button>';
    fitFilterChips();
  }
  updateSidebarSelection();
  const folders = showingCollectionFolders();
  $('.page-content').dataset.folderView = String(folders);
  const tools = $('.collection-tools'); if (tools) tools.hidden = folders;
  if (button) button.hidden = folders;
  syncViewToggle();
  const topicCount = folders ? localCollections().length : 0;
  const heading = $('.page-content h1'); if (heading) { heading.textContent = folders ? `${topicCount} ${topicCount === 1 ? 'topic' : 'topics'}` : state.archive ? 'Archived' : state.filters.collectionName || state.filters.topics.join(', ') || selectedAccountLabel() || ({ all: 'All saves', x: 'X', instagram: 'Instagram', chrome: 'Chrome bookmarks' }[selectedSource()]); heading.className = folders || state.archive ? 'collection-heading' : 'sr-only'; }
  renderSidebarMarkers();
}
function filterDialog() {
  const current = state.filters, posts = allPosts().filter(post => !!post.archived === state.archive);
  const arranged = state.archive || state.demo ? [] : state.topicCatalog.map(t => t.name);
  const topics = [...new Set([...arranged, ...posts.flatMap(p => p.topics).filter(name => !arranged.includes(name)).sort()])];
  const accounts = accountOptions(posts, state.sync?.xAccounts?.accounts || []);
  const accountName = value => value.platform === 'chrome' ? 'Chrome bookmarks' : value.label === platformName(value.platform) ? value.label : `${platformName(value.platform)} ${value.label}`;
  const folders = [...new Set(posts.filter(p => p.platform === 'chrome').flatMap(p => p.folders || []))].sort();
  const chosen = value => current.accounts.length ? current.accounts.includes(value.value) || current.accounts.includes(`${value.platform}:*`) : current.sources.includes(value.platform);
  showModal(`<div class="filter-heading"><h2>Filters</h2></div><form id="filters-form"><div class="filter-fields">
    <fieldset class="filter-section" hidden><legend title="When each post first entered saveXtension">Date added</legend><div id="date-range"></div></fieldset>
    <fieldset class="filter-section"><legend>Accounts</legend><div class="filter-choices"><label class="filter-choice"><input type="checkbox" id="all-filter-sources" ${!current.sources.length && !current.accounts.length ? 'checked' : ''}><span>All</span></label>${accounts.map(value => `<label class="filter-choice account-choice" title="${esc(accountName(value))}"><input type="checkbox" name="accounts" value="${esc(value.value)}" aria-label="${esc(accountName(value))}" ${chosen(value) ? 'checked' : ''}><span>${sourceIcon(value.platform)}<span class="${value.label.startsWith('@') ? 'account-handle' : ''}">${esc(value.label)}</span></span></label>`).join('')}</div></fieldset>
    ${topics.length ? `<fieldset class="filter-section" aria-label="Topics"><legend class="filter-topics-heading"><span>Topics</span><label class="filter-topics-search">${icon('search')}<input id="filter-topics-search" type="search" placeholder="Find a collection" aria-label="Search topics" autocomplete="off"></label></legend><div class="filter-choices" id="filter-topic-choices">${topics.map(t => `<label class="filter-choice"><input type="checkbox" name="topics" value="${esc(t)}" ${current.topics.includes(t) ? 'checked' : ''}><span>${icon('folder')}${esc(t)}</span></label>`).join('')}</div><p class="filter-topics-empty" id="filter-topics-empty" role="status" hidden>No matching topics</p></fieldset>` : ''}
    <label id="filter-folder-group" hidden>Chrome folder<select id="bookmark-folder" name="folder" aria-label="Bookmark folder"><option value="">All bookmark folders</option>${folders.map(f => `<option value="${esc(f)}" ${current.folder === f ? 'selected' : ''}>${esc(f)}</option>`).join('')}</select></label>
    </div><footer class="filter-footer"><p id="filter-error" class="form-error" role="alert"></p><button class="secondary" type="button" id="cancel-filter-draft">Cancel</button><button class="primary" type="submit" id="show-filtered-saves">Show saves</button></footer></form>`);
  modal.classList.add('filter-dialog'); $('#open-filters')?.setAttribute('aria-expanded', 'true');
  const form = $('#filters-form');
  const timeline = mountDateRange($('#date-range'), current);
  const topicSearch = $('#filter-topics-search');
  // Chevrons beside the sideways topic list slide it one view at a time and
  // appear only where more topics wait; trackpad scrolling works as usual.
  const topicChoices = $('#filter-topic-choices');
  if (topicChoices) {
    const scroller = document.createElement('div'); scroller.className = 'filter-topic-scroller';
    topicChoices.before(scroller); scroller.append(topicChoices);
    for (const [cls, label, step] of [['is-prev', 'Earlier topics', -1], ['is-next', 'More topics', 1]]) {
      const button = document.createElement('button'); button.type = 'button'; button.className = `filter-topic-scroll ${cls}`;
      button.setAttribute('aria-label', label); button.innerHTML = icon('chevron');
      button.onclick = () => topicChoices.scrollBy({ left: step * topicChoices.clientWidth * .85 });
      scroller.append(button);
    }
    const edges = () => { scroller.classList.toggle('has-less', topicChoices.scrollLeft > 2); scroller.classList.toggle('has-more', topicChoices.scrollLeft + topicChoices.clientWidth < topicChoices.scrollWidth - 2); };
    topicChoices.addEventListener('scroll', edges, { passive: true }); new ResizeObserver(edges).observe(topicChoices); edges();
    topicSearch?.addEventListener('input', () => requestAnimationFrame(edges));
  }
  function searchTopics() {
    if (!topicSearch) return;
    const key = value => value.normalize('NFKC').trim().toLocaleLowerCase();
    const query = key(topicSearch.value), choices = [...form.querySelectorAll('#filter-topic-choices .filter-choice')];
    for (const choice of choices) choice.hidden = !key($('input', choice).value).includes(query);
    $('#filter-topics-empty').hidden = choices.some(choice => !choice.hidden);
  }
  if (topicSearch) topicSearch.onkeydown = event => { if (event.key === 'Enter') event.preventDefault(); };
  let preserveCollection = true;
  function draft() {
    const data = new FormData(form), accounts = data.getAll('accounts');
    const keepCollection = preserveCollection && (!accounts.length || accounts.some(a => a.startsWith('instagram:')));
    return { ...defaultFilters(), ...timeline.value(), collection: keepCollection ? current.collection : '', collectionName: keepCollection ? current.collectionName : '', sources: [...new Set(accounts.map(value => value.split(':')[0]))], accounts, topics: data.getAll('topics'), folder: data.get('folder') || '' };
  }
  function preview() {
    const sources = [...form.querySelectorAll('[name="accounts"]:checked')].map(el => el.value.split(':')[0]), chromeOnly = sources.length === 1 && sources[0] === 'chrome';
    $('#filter-folder-group').hidden = !chromeOnly; $('#bookmark-folder').disabled = !chromeOnly;
    $('#all-filter-sources').checked = !sources.length;
    const selected = draft(), bounds = dateBounds(selected), count = applyFilters(visibleInstagramSaves(posts, state.instagramSaveLists, selected.accounts), selected, { query: state.query, topicScope: name => topicScope(state.topicCatalog, name) }).length;
    $('#filter-error').textContent = bounds.error || ''; $('#show-filtered-saves').disabled = !!bounds.error;
    $('#show-filtered-saves').textContent = `Show ${count} ${count === 1 ? 'save' : 'saves'}`;
    styleSelects(form);
  }
  form.addEventListener('input', e => {
    if (e.target === topicSearch) { searchTopics(); return; }
    if (e.target.id === 'all-filter-sources') form.querySelectorAll('[name="accounts"]').forEach(el => { el.checked = false; });
    preview();
  });
  $('#cancel-filter-draft').onclick = () => modal.close();
  form.onsubmit = e => { e.preventDefault(); const selected = draft(); if (dateBounds(selected).error) return; state.filters = selected; modal.close(); renderResults(); $('#open-filters')?.focus(); };
  preview();
}
function bookmarkPreview(p, full = false) {
  const u = new URL(p.url);
  const folders = (p.folders || []).filter(f => full || !/^(Other bookmarks|Bookmarks bar|Mobile bookmarks)$/i.test(f));
  return `<div class="bookmark-preview" data-website-url="${esc(p.url)}"><span class="bookmark-host"><span class="bookmark-browser" role="img" aria-label="Chrome bookmark">${sourceIcon('chrome')}</span><span>${esc(u.hostname.replace(/^www\./, ''))}</span></span><a class="bookmark-title" href="${esc(p.url)}" title="${esc(p.bookmarkTitle || p.title || p.url)}" target="_blank" rel="noopener noreferrer">${esc(p.bookmarkTitle || u.hostname)}</a><a class="bookmark-media" href="${esc(p.url)}" aria-label="Open ${esc(p.bookmarkTitle || u.hostname)}" target="_blank" rel="noopener noreferrer" hidden><img alt="" decoding="async"></a><p class="bookmark-description" hidden></p></div><div class="bookmark-folders">${folders.map(f => `<span title="${esc(f)}">${esc(f)}</span>`).join('')}</div>`;
}
function embedMetadata(p, full = false) {
  const handle = p.author ? `@${String(p.author).replace(/^@+/, '')}` : '';
  const name = p.authorName || handle || platformName(p.platform);
  const caption = p.text || (p.title !== p.authorName ? p.title : '') || '';
  const image = p.thumbnail || p.media?.[0];
  const published = Number.isFinite(Date.parse(p.publishedAt));
  const date = published ? p.publishedAt : libraryAddedAt(p);
  const dated = Number.isFinite(Date.parse(date));
  return `<div class="embed-placeholder ${full ? 'is-full' : ''}"><div class="embed-capture-header">${sourceIcon(p.platform)}<div class="embed-capture-author"><strong>${esc(name)}</strong>${handle && p.authorName && p.authorName.toLowerCase() !== handle.slice(1).toLowerCase() ? `<span>${esc(handle)}</span>` : ''}</div><a class="icon-button embed-open-original" href="${esc(p.url)}" aria-label="Open original post" title="Open original" target="_blank" rel="noopener noreferrer">${icon('arrow')}</a></div>${image ? `<img class="embed-capture-image" src="${esc(image)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : ''}${caption ? `<p class="embed-capture-text">${esc(caption)}</p>` : `<a class="embed-capture-link" href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">${esc(p.url)}</a>`}${dated ? `<time class="embed-capture-date" datetime="${esc(date)}" title="${esc(new Date(date).toLocaleString())}">${published ? '' : 'Added '}${esc(relative(date))}</time>` : ''}<div class="embed-loading" role="status"><span class="embed-loading-spinner" aria-hidden="true"></span><span>Loading preview…</span></div></div>`;
}
function nativePreview(p, full = false) {
  if (p.platform === 'chrome') return bookmarkPreview(p, full);
  const supported = !!embedTarget(p.url);
  return `<section class="native-embed" data-post-url="${esc(p.url)}" data-embed-state="${supported ? 'pending' : 'failed'}" aria-busy="${supported}"><div class="embed-stage">${embedMetadata(p, full)}</div><div class="embed-error" ${supported ? 'hidden' : ''}><p>This post can’t be loaded right now.</p><div><button type="button" class="text-button" data-embed-retry>Retry</button><a href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">Open original</a></div></div></section>`;
}
function noteOpen(post) {
  const status = noteStates.get(noteKey(post));
  return state.cardView === 'feed' || openNoteIds.has(post.id) || !!notes.value(post).trim() || status === 'error' || status === 'saving' || status === 'pending';
}
function instagramCollectionLabel(post) {
  if (post.platform !== 'instagram' || state.archive || state.filters.collection || state.filters.topics.length) return '';
  const accounts = state.filters.accounts.filter(value => value.startsWith('instagram:'));
  const names = (post.collections || []).map(item => ({ ...state.instagramCollections.find(collection => String(collection.id) === String(item.id)), ...item }))
    .filter(collection => typeof collection.name === 'string' && collection.name.trim() && (!accounts.length || accounts.includes('instagram:*') || accounts.includes(`instagram:${collection.account?.toLowerCase()}`)))
    .map(collection => collection.name);
  return [...new Set(names)].sort((a,b) => a.localeCompare(b)).join(', ');
}
function cardPlatform(post, collections = instagramCollectionLabel(post)) {
  const label = platformName(post.platform);
  return `<span class="card-source" data-collections="${esc(collections)}" data-platform="${esc(post.platform)}">${collections ? `<span class="card-source-collection" title="${esc(collections)}">${esc(collections)}</span>` : ''}<span class="card-platform" role="img" aria-label="${esc(label)}" title="${esc(label)}">${sourceIcon(post.platform)}</span></span>`;
}
function feedSourceLabel(post) {
  const selected = state.filters.accounts.filter(value => value.startsWith(`${post.platform}:`));
  const memberships = (post.collections || []).map(item => ({ ...state.instagramCollections.find(collection => String(collection.id) === String(item.id)), ...item }));
  const owners = [...new Map((post.accounts || []).filter(account => account.startsWith('@') && (!selected.length || selected.includes(`${post.platform}:*`) || selected.includes(`${post.platform}:${account.toLowerCase()}`))).map(account => [account.toLowerCase(),account])).values()];
  return owners.map(account => {
    const collections = post.platform === 'instagram' ? [...new Set(memberships.filter(collection => collection.account?.toLowerCase() === account.toLowerCase() && (!state.filters.collection || String(collection.id) === String(state.filters.collection))).map(collection => collection.name).filter(Boolean))].sort((a,b) => a.localeCompare(b)) : [];
    return [account, ...collections].join(' · ');
  }).join(' · ') || platformName(post.platform);
}
function feedCardSource(post) {
  const label = feedSourceLabel(post);
  return `<span class="feed-source-pill" data-label="${esc(label)}" title="${esc(`${platformName(post.platform)} · ${label}`)}"><span class="card-platform" role="img" aria-label="${esc(platformName(post.platform))}">${sourceIcon(post.platform)}</span><span class="feed-source-label">${esc(label)}</span></span>`;
}

function card(p) {
  const native = p.platform !== 'chrome' && !!embedTarget(p.url), showNote = noteOpen(p), canUnsave = state.localMode && !state.demo && native && (p.accounts || []).some(account => /^@[\w.]+$/.test(account));
  return `<article class="save-card ${p.platform} ${native ? 'has-native-embed' : ''}" data-post-id="${p.id}"><div class="card-content">
    <div class="card-body">
    <header class="card-header"><div class="card-actions"><button class="icon-button" data-action="copy-post" aria-label="Copy post reference" title="Copy post reference">${icon('copy')}</button>${native ? `<button class="icon-button" data-action="retry-preview" aria-label="Retry post preview" title="Retry preview">${icon('refresh')}</button>` : ''}<button class="icon-button" data-archive="${p.id}" ${SHOW_ARCHIVE ? '' : 'hidden'} aria-label="${p.archived ? 'Restore save' : 'Archive save'}" title="${p.archived ? 'Restore to saves' : 'Archive'}">${icon(p.archived ? 'restore' : 'archive')}</button>${canUnsave ? `<button class="icon-button unsave-button" data-action="unsave" aria-label="Unsave on ${platformName(p.platform)}" title="Unsave on ${platformName(p.platform)}">${icon('unsave')}</button>` : ''}<button class="icon-button note-button" data-open="${p.id}" aria-label="Edit note" title="Edit note" aria-expanded="${showNote}" aria-controls="note-section-${p.id}">${icon('pencil')}</button></div>${cardPlatform(p)}</header>
    <div class="card-layout">${feedCardSource(p)}<section class="card-note" id="note-section-${p.id}" ${showNote ? '' : 'hidden'}><label class="sr-only" for="note-${p.id}">Note</label><div class="note-editor"><textarea class="note-input" id="note-${p.id}" name="notes" rows="3" maxlength="10000" placeholder="${state.cardView === 'feed' ? 'No notes added yet.' : 'Add a note…'}" ${state.demo ? 'readonly' : ''}>${esc(notes.value(p))}</textarea><div class="note-link-preview" hidden></div></div><button type="button" class="note-more" data-action="toggle-note-preview" aria-expanded="false" aria-controls="note-${p.id}" hidden>Read more</button><span class="note-status" role="status" aria-live="polite"></span></section>
    <div class="card-preview">${nativePreview(p)}</div>
    <footer class="card-footer"><button type="button" class="collection-add" data-action="add-collection" aria-label="Add to collection" title="Add to collection" aria-haspopup="dialog" aria-controls="collection-picker" aria-expanded="false" ${state.demo ? 'disabled' : ''}>${icon('plus')}</button><div class="card-tags">${[...new Set(p.topics)].map(t => `<span class="tag-pill"><button type="button" class="tag-icon" data-action="remove-topic" data-topic-name="${esc(t)}" aria-label="Remove from “${esc(t)}”" title="Remove from this topic"${state.demo ? ' disabled' : ''}>${icon('folder', 'tag-folder')}${icon('close', 'tag-close')}</button><button class="tag" data-topic="${esc(t)}">${esc(t)}</button></span>`).join('')}</div></footer></div>
    </div>
  </div></article>`;
}
function addCollection(button) {
  const id=Number(button.closest('.save-card').dataset.postId), post=allPosts().find(post=>post.id===id);
  if (!post||state.demo) return;
  closeSelect(); closeAccountMenu();
  openCollectionPicker({
    trigger:button, post, topics:state.topicCatalog,
    restoreFocus:()=>document.querySelector(`.save-card[data-post-id="${id}"] .collection-add`)?.focus({preventScroll:true}),
    icons:{ folder:icon('folder','collection-option-icon'), check:icon('check','collection-option-check'), remove:icon('close','collection-option-remove') },
    onRemove:topic=>removeTopicDialog(id,topic.name),
    onAdd:async selection=>{
      const result=await api(`/posts/${id}/collections`,{method:'POST',body:selection});
      collectionVersion++;
      state.posts=notes.overlay(state.posts.map(post=>post.id===id?{...post,...result.post}:post));
      state.topicCatalog=result.topics; updateCollection();
    }
  });
}
// A topic dragged from the sidebar onto a card joins that post, like picking it from +.
async function tagPost(id, topicIds) {
  const added = [];
  try {
    for (const topicId of topicIds) {
      const result = await api(`/posts/${id}/collections`, { method: 'POST', body: { topicId } });
      state.posts = notes.overlay(state.posts.map(post => post.id === id ? { ...post, ...result.post } : post));
      state.topicCatalog = result.topics; added.push(state.topicCatalog.find(topic => topic.id === topicId)?.name);
    }
  } catch (failure) { toast(failure.message, true, 'bottom-center'); }
  if (!added.length) return;
  collectionVersion++; updateCollection();
  toast(`Added to “${added.filter(Boolean).join('”, “')}”`, false, 'bottom-center');
}
// Removing a post from a topic only drops this one membership, after a confirmation.
function removeTopicDialog(id, name) {
  const topic = state.topicCatalog.find(t => t.name === name);
  if (!topic || state.demo) return;
  showModal(`<h2>Remove from “${esc(name)}”?</h2><p>This save leaves the topic. It stays in your library and in any other topics.</p><form id="remove-topic-form"><p class="form-error" role="alert"></p><div class="button-row"><button class="primary danger-button" type="submit">Remove</button><button class="secondary" type="button" id="cancel-remove-topic">Cancel</button></div></form>`);
  const form = $('#remove-topic-form'); $('#cancel-remove-topic').onclick = () => modal.close(); $('#cancel-remove-topic').focus();
  form.onsubmit = async event => {
    event.preventDefault();
    const controls = [...form.querySelectorAll('button')]; controls.forEach(control => control.disabled = true);
    try {
      const result = await api(`/posts/${id}/collections/${topic.id}`, { method: 'DELETE' });
      collectionVersion++;
      state.posts = notes.overlay(state.posts.map(post => post.id === id ? { ...post, ...result.post } : post));
      state.topicCatalog = result.topics; updateCollection();
      modal.close(); toast(`Removed from “${name}”`, false, 'bottom-center');
    } catch (failure) { $('.form-error', form).textContent = failure.message; controls.forEach(control => control.disabled = false); }
  };
}
function postReference(post) {
  const localSave = !state.demo && Number.isInteger(post.id) && post.id > 0;
  const heading = localSave ? `saveXtension save #${post.id}` : 'saveXtension sample save';
  const context = !localSave ? 'Sample preview; not part of the MCP library.' : post.archived
    ? 'Archived; restore this save in saveXtension before reading it through MCP.'
    : `Read its metadata and my note with saveXtension MCP get_saves: ${JSON.stringify({postIds:[post.id]})}`;
  return `${heading}\n${post.url}\n${context}`;
}
async function copyPostReference(button) {
  const id = Number(button.closest('[data-post-id]')?.dataset.postId), post = allPosts().find(post => post.id === id);
  if (!post) return;
  const reference = postReference(post);
  try {
    if (window.saveXDesktop?.copyText) await window.saveXDesktop.copyText(reference);
    else {
      try { await navigator.clipboard.writeText(reference); }
      catch {
        const focused = document.activeElement, field = document.createElement('textarea');
        field.value = reference; field.tabIndex = -1; field.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
        document.body.append(field);
        try { field.select(); if (!document.execCommand('copy')) throw new Error('Copy unavailable'); }
        finally { field.remove(); focused?.focus({preventScroll:true}); }
      }
    }
    toast('Reference copied', false, 'bottom-center');
  } catch { toast('Couldn’t copy reference. Try again.', true, 'bottom-center'); }
}
function sizeNote(field) {
  if (CSS.supports('field-sizing','content') || !field.getClientRects().length) return;
  field.style.height = '0px'; field.style.height = `${Math.max(document.activeElement === field ? 66 : 22,field.scrollHeight)}px`;
}
function syncNotePreview(field) {
  if (!field.isConnected) return;
  const button = field.closest('.card-note').querySelector('.note-more');
  const expanded = expandedNoteIds.has(Number(field.closest('.save-card').dataset.postId));
  field.dataset.expanded = String(expanded);
  syncNoteLinks(field);
  sizeNote(field);
  const focused = document.activeElement === field;
  if (!expanded && !focused) field.scrollTop = 0;
  const overflow = field.scrollHeight > parseFloat(getComputedStyle(field).lineHeight) * 6 + 1;
  button.hidden = focused || (!expanded && !overflow);
  const label = expanded ? 'Show less' : 'Read more';
  if (button.textContent !== label) button.textContent = label;
  button.setAttribute('aria-expanded', String(expanded));
}
const observedNotes = new Set();
const notePreviewObserver = new ResizeObserver(entries => { for (const {target} of entries) syncNotePreview(target); });
function observeNotePreviews(root) {
  for (const field of observedNotes) if (!field.isConnected) { notePreviewObserver.unobserve(field); observedNotes.delete(field); }
  for (const field of root.querySelectorAll('.note-input')) {
    if (!observedNotes.has(field)) { observedNotes.add(field); notePreviewObserver.observe(field); }
    syncNotePreview(field);
  }
}
function syncCardNote(card, post, immediate = false, preview = true) {
  const section = $('.card-note',card), field = $('.note-input',card), label = $('.note-status',card);
  if (!field) return;
  const status = noteStates.get(noteKey(post)), focused = document.activeElement === field;
  if (!focused && !notes.value(post).trim() && status !== 'pending' && status !== 'saving' && status !== 'error') openNoteIds.delete(post.id);
  if (!focused && field.value !== notes.value(post)) field.value = notes.value(post);
  const shown = noteOpen(post);
  field.placeholder = state.cardView === 'feed' ? 'No notes added yet.' : 'Add a note…';
  if (immediate) { finishNoteAnimation(section); section.hidden = !shown; section.dataset.noteOpen = String(shown); }
  else setNoteVisibility(section, shown);
  section.onclick = event => { if (state.cardView === 'feed' && event.target !== field && !event.target.closest('button,a')) field.focus({preventScroll:true}); };
  $('.note-button',card)?.setAttribute('aria-expanded',String(shown));
  label.textContent = status === 'error' ? 'Not saved yet · retrying' : status === 'pending' || status === 'saving' ? 'Saving…' : '';
  label.dataset.state = status || '';
  // A view switch resizes every note, so the preview observer measures it then.
  if (preview) syncNotePreview(field);
  field.onfocus = () => { openNoteIds.add(post.id); activeNote = post; activeNoteScope = resultsScopeKey(); syncNotePreview(field); };
  field.oninput = () => {
    if (state.demo) return;
    finishNoteAnimation(section);
    notes.edit(post,field.value); state.posts = notes.overlay(state.posts); syncNotePreview(field);
  };
  field.onblur = event => {
    if (activeNote?.id === post.id) flushActiveNote();
    if (event.relatedTarget === $('.note-button',card)) return;
    const current = allPosts().find(p => p.id === post.id && p.url === post.url);
    if (current) syncCardNote(card,current);
  };
}
function editNote(id) {
  const post = allPosts().find(p => p.id === Number(id)), card = document.querySelector(`.save-card[data-post-id="${id}"]`);
  if (!post || !card) return;
  const field = $('.note-input',card), section = $('.card-note',card), button = $('.note-button',card);
  const shown = section.dataset.noteOpen === 'true';
  if (shown && !field.value.trim()) {
    openNoteIds.delete(post.id); expandedNoteIds.delete(post.id);
    if (activeNote?.id === post.id) flushActiveNote();
    button.setAttribute('aria-expanded','false'); setNoteVisibility(section,false);
    button.focus({preventScroll:true}); return;
  }
  openNoteIds.add(post.id); button.setAttribute('aria-expanded','true');
  setNoteVisibility(section,true,() => { sizeNote(field); field.focus({preventScroll:true}); });
}
window.addEventListener('resize', () => { if (!CSS.supports('field-sizing','content')) document.querySelectorAll('.note-input').forEach(sizeNote); }, {passive:true});
// Preserve the iframe itself while background sync refreshes metadata around it.
const cardVersions = new WeakMap();
// Posts first added today carry a small "New" tag on the post's top edge.
function markNew(card, post) {
  const fresh = addedTimeGroup(libraryAddedAt(post)).key === 'added-today', layout = $('.card-layout', card);
  let tag = $(':scope > .new-tag', layout);
  if (!fresh) { tag?.remove(); return; }
  if (!tag) { tag = document.createElement('span'); tag.className = 'new-tag'; tag.textContent = 'New'; tag.title = 'Added to saveXtension today'; layout.prepend(tag); }
}
function reconcileCards(sections) {
  let cards = $('#results > .cards');
  if (!cards) { $('#results').innerHTML = '<div class="cards"></div>'; cards = $('#results > .cards'); }
  cards.classList.add('cards');
  const previous = new Map([...cards.querySelectorAll(':scope > .save-card')].map(el => [el.dataset.postId, el]));
  const headings = new Map([...cards.querySelectorAll(':scope > .save-time-separator')].map(el => [el.dataset.saveGroup, el]));
  const sentinels = new Map([...cards.querySelectorAll(':scope > .more-saves')].map(el => [el.dataset.moreGroup, el]));
  const groups = new Set(sections.map(section => section.key));
  for (const heading of headings.values()) heading.remove();
  for (const [key, more] of sentinels) if (!sections.some(section => section.key === key && section.posts.length > section.limit)) { more.remove(); sentinels.delete(key); }
  const wanted = new Set(sections.flatMap(section => section.posts.slice(0, section.limit)).map(post => String(post.id)));
  for (const [key, el] of previous) if (!wanted.has(key)) { el.remove(); previous.delete(key); }
  let cursor = cards.firstElementChild;
  // Insert headings and new cards around existing players without moving them.
  const place = el => { if (el === cursor) cursor = cursor.nextElementSibling; else if (el.parentElement === cards && cards.moveBefore) cards.moveBefore(el, cursor); else cards.insertBefore(el, cursor); };
  for (const group of sections) {
    group.posts.slice(0, group.limit).forEach(post => {
      const key = String(post.id), version = JSON.stringify(post);
      let el = previous.get(key); previous.delete(key);
      if (!el) {
        const template = document.createElement('template'); template.innerHTML = card(post); el = template.content.firstElementChild;
      } else if (cardVersions.get(el) !== version) {
        const template = document.createElement('template'); template.innerHTML = card(post); const next = template.content.firstElementChild;
        const replaceMetadata = () => { for (const selector of ['.card-actions', '.card-footer', '.embed-placeholder']) { const current = el.querySelector(selector), replacement = next.querySelector(selector); if (current && replacement && current.outerHTML !== replacement.outerHTML) current.replaceWith(replacement); } };
        const holder = el.querySelector('.native-embed');
        if (holder) animateEmbedStage(holder, replaceMetadata); else replaceMetadata();
        if (post.platform === 'chrome') {
          const current=el.querySelector('.bookmark-preview'),replacement=next.querySelector('.bookmark-preview');
          if(current.dataset.websiteUrl!==replacement.dataset.websiteUrl||current.querySelector('.bookmark-title').textContent!==replacement.querySelector('.bookmark-title').textContent)current.replaceWith(replacement);
          const folders=el.querySelector('.bookmark-folders'),nextFolders=next.querySelector('.bookmark-folders');
          if(folders.outerHTML!==nextFolders.outerHTML)folders.replaceWith(nextFolders);
        }
      }
      cardVersions.set(el, version);
      const source = el.querySelector('.card-source'), collections = instagramCollectionLabel(post);
      if (source.dataset.collections !== collections || source.dataset.platform !== post.platform) {
        const template = document.createElement('template'); template.innerHTML = cardPlatform(post, collections); source.replaceWith(template.content.firstElementChild);
      }
      const feedSource = el.querySelector('.feed-source-pill');
      if (feedSource.dataset.label !== feedSourceLabel(post)) {
        const template = document.createElement('template'); template.innerHTML = feedCardSource(post); feedSource.replaceWith(template.content.firstElementChild);
      }
      el.hidden = false; el.dataset.savedGroup = group.key; place(el); syncCardNote(el,post); markNew(el, post);
    });
    if (group.posts.length > group.limit) {
      let more = sentinels.get(group.key);
      if (!more) {
        more = document.createElement('div'); more.className = 'more-saves'; more.dataset.moreGroup = group.key; more.setAttribute('role','status');
        more.innerHTML = '<span class="embed-loading-spinner" aria-hidden="true"></span><span>Loading more saves…</span>';
      }
      place(more);
    }
  }
  for (const el of previous.values()) el.remove();
  cards.dataset.view = state.cardView;
  layoutCards(cards); observeNotePreviews(cards); mountEmbeds(cards); mountWebsitePreviews(cards);
}
function updateCollection() {
  if (!$('#results')) return render();
  const posts = allPosts(), live = posts.filter(p => !p.archived);
  const counts = { all: live.length, x: live.filter(p => p.platform === 'x').length, instagram: live.filter(p => p.platform === 'instagram').length, chrome: live.filter(p => p.platform === 'chrome').length };
  document.querySelectorAll('[data-filter]').forEach(button => { const count = button.querySelector('.nav-count'); if (count) { count.textContent = counts[button.dataset.filter]; button.setAttribute('aria-label', `${button.dataset.navLabel} ${counts[button.dataset.filter]}`); } });
  const archive = $('.archive-nav'); if (archive) { const count = posts.length - live.length; $('.nav-count', archive).textContent = count; archive.setAttribute('aria-label', `Archived ${count}`); }
  renderResults();
}
async function refresh(silent = false) {
  if (state.demo) return;
  const version = collectionVersion;
  try { const data = await api('/posts?scope=all'); if (version !== collectionVersion) return; if (data.embedOrigin) configureEmbeds(data.embedOrigin); const changed = JSON.stringify(state.posts) !== JSON.stringify(data.posts) || JSON.stringify(state.instagramCollections) !== JSON.stringify(data.instagramCollections || []) || JSON.stringify(state.topicCatalog) !== JSON.stringify(data.topics || []) || JSON.stringify(state.instagramSaveLists) !== JSON.stringify(data.instagramSaveLists || {}); state.posts = notes.overlay(data.posts); state.runs = data.runs; state.topicCatalog = data.topics || []; state.instagramCollections = data.instagramCollections || []; state.instagramSaveLists = data.instagramSaveLists || {}; if (changed || !silent) updateCollection(); else if ($('#results > .cards') && resultsTimeKey !== addedTimeKey(resultsPosts)) renderResults(); }
  catch (e) { if (!silent) toast(e.message, true); }
}
let handlingUnsave = false;
const noticedUnsaves = new Set();
async function handleUnsaveStatus(job) {
  if(!job || ['queued','running'].includes(job.status) || handlingUnsave)return;
  handlingUnsave=true;
  try{
    if(!noticedUnsaves.has(job.id)){
      noticedUnsaves.add(job.id);
      if(job.status==='succeeded'){
        const post=state.posts.find(post=>post.id===job.post_id);
        if(job.deleted){
          notes.forget(post || {id:job.post_id,url:job.url});openNoteIds.delete(job.post_id);expandedNoteIds.delete(job.post_id);
          if(activeNote?.id===job.post_id)activeNote=null;
          state.posts=state.posts.filter(post=>post.id!==job.post_id);
        }else state.posts=state.posts.map(post=>post.id===job.post_id?{...post,accounts:post.accounts.filter(account=>account.toLowerCase()!==job.account.toLowerCase()),collections:(post.collections||[]).filter(collection=>collection.account?.toLowerCase()!==job.account.toLowerCase())}:post);
        collectionVersion++;updateCollection();await refresh(true);
        const message = job.phase === 'checking' ? job.deleted ? 'Removed from saveXtension.' : `Removed from ${job.account}’s saves.` : `Unsaved on ${platformName(job.platform)}.`;
        toast(message,false,'bottom-center');
      }else toast(job.message||'Couldn’t verify the unsave. Check the original post.',true,'bottom-center');
    }
    await api(`/unsave/${job.id}/ack`,{method:'POST',body:{}});
    if(state.sync?.unsave?.id===job.id)state.sync.unsave=null;
  }catch{ /* Retry acknowledging the result on the next heartbeat. */ }
  finally{handlingUnsave=false;}
}
// The post being unsaved keeps a quiet red overlay until the job finishes.
// Cancelled or failed jobs clear it; a success removes the card itself.
function renderUnsaving() {
  const job = state.sync?.unsave, id = ['queued', 'running'].includes(job?.status) ? job.post_id : null;
  for (const card of document.querySelectorAll('#results .save-card')) {
    const active = Number(card.dataset.postId) === id, target = $('.card-preview', card) || card;
    let overlay = $('.unsave-overlay', target);
    card.toggleAttribute('data-unsaving', active); card.setAttribute('aria-busy', String(active));
    if (!active) { overlay?.remove(); continue; }
    if (!overlay) { overlay = document.createElement('div'); overlay.className = 'unsave-overlay'; overlay.setAttribute('role', 'status'); target.append(overlay); }
    const text = `Unsaving on ${platformName(job.platform)}…`;
    if (overlay.textContent !== text) overlay.innerHTML = `<span class="unsave-label"><span class="embed-loading-spinner" aria-hidden="true"></span>${esc(text)}</span>`;
  }
}
// Empty space in a grid card's own frame opens the post larger over a dark backdrop.
function openPostPreview(card) {
  const post = allPosts().find(post => post.id === Number(card.dataset.postId)); if (!post) return;
  // The same actions as a feed card, in a column beside the post.
  const canUnsave = state.localMode && !state.demo && (post.accounts || []).some(account => /^@[\w.]+$/.test(account));
  showModal(`<div class="post-preview-actions" data-post-id="${post.id}"><button class="icon-button preview-action" data-action="copy-post" aria-label="Copy post reference" title="Copy post reference">${icon('copy')}</button><button class="icon-button preview-action" data-action="retry-preview" aria-label="Retry post preview" title="Retry preview">${icon('refresh')}</button>${canUnsave ? `<button class="icon-button preview-action unsave-button" data-action="unsave" aria-label="Unsave on ${platformName(post.platform)}" title="Unsave on ${platformName(post.platform)}">${icon('unsave')}</button>` : ''}</div><div class="post-preview-layout"><div class="post-preview">${nativePreview(post, true)}</div><section class="card-note post-preview-note" data-post-id="${post.id}" aria-label="Note"><label class="sr-only" for="preview-note">Note</label><textarea class="note-input" id="preview-note" name="notes" rows="4" maxlength="10000" placeholder="Add a note…" ${state.demo ? 'readonly' : ''}>${esc(notes.value(post))}</textarea><span class="note-status" role="status" aria-live="polite"></span></section></div>`);
  modal.className = 'post-preview-dialog'; renderSync();
  // The note beside the post edits the same saved note as its card.
  const field = $('#preview-note', modal);
  field.onfocus = () => { activeNote = post; activeNoteScope = resultsScopeKey(); };
  field.oninput = () => { if (state.demo) return; notes.edit(post, field.value); state.posts = notes.overlay(state.posts); };
  field.onblur = () => { if (activeNote?.id === post.id) flushActiveNote(); };
  $('.post-preview-note', modal).onclick = event => { if (event.target !== field) field.focus(); };
  syncPreviewNote(post);
  mountEmbeds(modal, true);
}
function syncPreviewNote(post) {
  const panel = modal.open && modal.querySelector(`.post-preview-note[data-post-id="${post.id}"]`); if (!panel) return;
  const status = noteStates.get(noteKey(post)), label = $('.note-status', panel);
  label.textContent = status === 'error' ? 'Not saved yet · retrying' : status === 'pending' || status === 'saving' ? 'Saving…' : '';
  label.dataset.state = status || '';
}
modal.addEventListener('close', () => { if (modal.classList.contains('post-preview-dialog')) { flushActiveNote(); disposeEmbeds(modal); modal.innerHTML = ''; modal.className = ''; } });
async function openUnsave(button) {
  const post=allPosts().find(post=>post.id===Number(button.closest('[data-post-id]').dataset.postId));if(!post||state.demo)return;
  await unsaveDialog(post,{api,showModal,modal,esc,icon,sourceIcon,onQueued:job=>{
    void window.saveXDesktop?.returnAfterUnsave?.(job.id).catch(()=>{});
    state.sync={...state.sync,unsave:job};renderSync();toast(`Unsaving on ${platformName(job.platform)}…`,false,'bottom-center');wakeExtension();
  }});
}
// Shift-click adds or removes a sidebar row; every selected row becomes a filter chip.
// Accounts, Chrome and Instagram collections combine; topics combine with each other.
function toggleSidebarPick(button) {
  if (state.archive) { state.archive = false; state.filters = defaultFilters(); }
  const filters = state.filters, toggle = (list, value) => list.includes(value) ? list.filter(item => item !== value) : [...list, value];
  if (button.dataset.navTopic) filters.topics = toggle(filters.topics, button.dataset.navTopic);
  else {
    // A plain-click selection joins the multi-selection: a single collection
    // implied its owner account, and the Chrome row only set the source.
    let accounts = [...filters.accounts], collections = (filters.collections || []).map(String);
    if (filters.collection) { collections.push(String(filters.collection)); accounts = []; }
    if (!accounts.length && filters.sources.length === 1 && filters.sources[0] === 'chrome') accounts = ['chrome:*'];
    if (button.dataset.instagramCollection) collections = toggle(collections, button.dataset.instagramCollection);
    else accounts = toggle(accounts, button.dataset.navAccount || 'chrome:*');
    Object.assign(filters, { accounts, collections: [...new Set(collections)], collection: '', collectionName: '' });
    filters.sources = [...new Set([...accounts.map(value => value.split(':')[0]), ...(filters.collections.length ? ['instagram'] : [])])];
    if (!filters.sources.includes('chrome')) filters.folder = '';
  }
  updateCollection(); renderSync();
}
async function connectDialog() { await startSync(); }
function bridgeRequest(type = 'PROBE_EXTENSION', timeout = 1400) {
  if (window.saveXDesktop) return Promise.all([window.saveXDesktop.connect(type), window.saveXDesktop.helperInfo()]).then(([browser, helper]) => {
    state.desktopHelperVersion = helper.version;
    state.bridge = browser ? { ...browser, seenAt: Date.now() } : null;
    return state.bridge;
  });
  return new Promise(resolve => {
    const requestId = crypto.randomUUID();
    const done = value => { clearTimeout(timer); window.removeEventListener('message', receive); resolve(value); };
    const receive = event => {
      if (event.source !== window || event.origin !== location.origin || event.data?.source !== 'savex-extension' || event.data.requestId !== requestId || !event.data.ok) return;
      state.bridge = { ready: event.data.ready === true, bookmarksReady: event.data.bookmarksReady === true, bookmarksSupported: event.data.bookmarksSupported === true, version: event.data.version, seenAt: Date.now() };
      done(state.bridge);
    };
    const timer = setTimeout(() => done(null), timeout);
    window.addEventListener('message', receive);
    window.postMessage({ source: 'savex-library', type, requestId }, location.origin);
  });
}
function currentAvailability(targets = state.pendingTargets || sourceTargets()) {
  if (state.sync?.nativeSocial?.enabled) {
    const request = state.checkingSyncRequest || state.pendingSyncRequest || selectedSyncRequest();
    const connected = state.sync.nativeSocial.accounts.filter(account => account.status === 'connected');
    for (const platform of targets.filter(target => target !== 'chrome')) {
      const available = connected.filter(account => account.platform === platform);
      const selection = platform === 'x' ? request.xAccount : request.instagramAccount;
      const handles = Array.isArray(selection) ? selection : selection && !['all', 'current'].includes(selection) ? [selection] : [];
      if (!available.length || handles.some(handle => !available.some(account => account.handle.toLowerCase() === handle.toLowerCase()))) return 'native-accounts';
    }
    // The desktop app reads Chrome's bookmark file itself.
    return 'ready';
  }
  const bridge = state.bridge && Date.now() - state.bridge.seenAt < 5000 ? state.bridge : null;
  const browser = bridge || state.sync?.browser;
  if (window.saveXDesktop && state.desktopHelperVersion && browser?.version && browser.version !== state.desktopHelperVersion) return 'missing';
  return syncAvailability(state.sync?.browser, bridge, targets);
}
function downloadExtension() {
  const link = document.createElement('a'); link.href = '/extension.zip'; link.download = 'savextension.zip';
  document.body.append(link); link.click(); link.remove(); sessionStorage.setItem('savex-extension-downloaded', 'true');
}
function setupDialog(mode, targets, download = false, syncMode = 'quick', request = { targets, xAccount: selectedSyncRequest().xAccount }) {
  if (mode === 'native-accounts' && window.saveXDesktop?.connectSocial) {
    const platforms = targets.filter(target => target !== 'chrome');
    showModal('<h2>Connect accounts</h2><p>Sign in once. Your accounts stay connected on this computer.</p><section id="native-connect-panel" class="section-gap"></section><p class="setup-status" id="setup-status" role="status">Your scan starts after your accounts are connected.</p>');
    modal.dataset.syncSetup = mode; state.pendingTargets = targets; state.pendingSyncRequest = request; state.pendingMode = syncMode;
    const handles = value => Array.isArray(value) ? value : value?.startsWith('@') ? [value] : [];
    mountSocialAccounts($('#native-connect-panel'), { esc, icon, sourceIcon, platforms, expected: { x: handles(request.xAccount), instagram: handles(request.instagramAccount) }, onChange: () => void syncStatus() });
    return;
  }
  const missing = mode === 'missing', offline = mode === 'offline', chromeBookmarks = targets.includes('chrome');
  const title = missing ? 'Install once. Then just Sync.' : offline ? 'Open Chrome to sync.' : chromeBookmarks ? 'Allow Chrome bookmarks once.' : 'Allow background access once.';
  const intro = missing ? window.saveXDesktop ? 'The included Chrome helper imports your browser bookmarks. Load or reload it once in Chrome or Edge.' : 'The extension wasn’t detected. Your download contains the browser helper that brings your saves here.' : offline ? 'Your Chrome helper was connected before, but it isn’t responding right now. Open Chrome with the profile where you installed saveXtension.' : chromeBookmarks ? 'Chrome needs your permission to read bookmark titles, links and folders from this profile and save them in your local library.' : 'Your extension is installed. Chrome needs your permission to read saved posts in background tabs.';
  showModal(`<div class="sync-setup"><span class="dialog-kicker">${missing ? 'One-time setup' : 'Almost ready'}</span><h2>${title}</h2><p>${intro}</p>${missing ? `<ol class="setup-steps"><li><strong>Unzip the download</strong><p>Keep the extracted folder somewhere permanent.</p></li><li><strong>Open Chrome’s extensions page</strong><p>Enter <code>chrome://extensions</code> in Chrome’s address bar. For Edge, use <code>edge://extensions</code>.</p><button class="text-button" id="copy-extensions">Copy Chrome address</button></li><li><strong>Load the extension folder</strong><p>Turn on <b>Developer mode</b>, click <b>Load unpacked</b>, and choose the extracted <code>extension</code> folder.</p></li><li><strong>Allow your selected sources</strong><p>Open saveXtension once and click <b>${chromeBookmarks ? 'Settings → Allow Chrome bookmarks' : 'Enable background sync'}</b>. Approve Chrome’s permission request.</p></li></ol><div class="button-row"><a class="secondary" href="/extension.zip" download="savextension.zip">${icon('download')} Download again</a><button class="primary" id="check-extension">Check installation</button></div>` : offline ? `<p>Leave Chrome open. We’ll start your sync as soon as it reconnects.</p><div class="button-row"><button class="primary" id="check-extension">Check connection</button><button class="text-button" id="reinstall-extension">Reinstall extension</button></div><p class="fine-print">If the extension is disabled, enable it at <code>chrome://extensions</code>. If you recently reloaded it, refresh the library in Chrome.</p>` : `<p>Click below to open setup in Chrome, then click <b>${chromeBookmarks ? 'Allow Chrome bookmarks' : 'Enable background sync'}</b>${targets.length > 1 && chromeBookmarks ? ' and enable background sync for your social saves' : ''}. Your sync starts automatically after you approve access.</p><button class="primary" id="open-extension-setup">Open setup in Chrome</button><p class="fine-print">If setup doesn’t open, click the saveXtension extension icon in Chrome and choose ${chromeBookmarks ? 'Settings → Allow Chrome bookmarks' : 'Enable background sync'}.</p>`}<p class="setup-status" id="setup-status" role="status">${missing ? 'Waiting for installation. Your sync will start automatically when ready.' : offline ? 'Waiting for Chrome…' : 'Waiting for permission…'}</p></div>`);
  modal.dataset.syncSetup = mode; state.pendingTargets = targets; state.pendingSyncRequest = request; state.pendingMode = syncMode;
  if (missing && window.saveXDesktop) {
    $('.setup-steps', modal).innerHTML = `<li><strong>Open Chrome or Edge extensions</strong><p>Reload saveXtension if it is already installed. For a new install, turn on <b>Developer mode</b>.</p><button class="text-button" id="desktop-open-extensions">Open extensions</button></li><li><strong>Load the included helper</strong><p>Click <b>Load unpacked</b> and choose the extension folder shown below. The desktop app keeps this folder updated.</p><div class="button-row"><button class="secondary" id="desktop-show-helper">Show helper folder</button><button class="text-button" id="desktop-copy-helper">Copy folder path</button></div><p class="fine-print" id="desktop-helper-path"></p></li><li><strong>Allow Chrome bookmarks</strong><p>Open the helper’s settings and approve bookmark access. X and Instagram connect directly inside saveXtension.</p></li>`;
    const zip = $('a[download="savextension.zip"]', modal); if (zip) zip.remove();
    $('#desktop-open-extensions').onclick = () => window.saveXDesktop.openExtensions().catch(error => toast(error.message, true));
    $('#desktop-show-helper').onclick = () => window.saveXDesktop.showHelper().catch(error => toast(error.message, true));
    $('#desktop-copy-helper').onclick = async () => { await window.saveXDesktop.copyHelperPath(); $('#desktop-copy-helper').textContent = 'Copied'; };
    void window.saveXDesktop.helperInfo().then(info => { if ($('#desktop-helper-path')) $('#desktop-helper-path').textContent = info.path; });
  } else if (missing && download && sessionStorage.getItem('savex-extension-downloaded') !== 'true') downloadExtension();
  if ($('#copy-extensions')) $('#copy-extensions').onclick = async () => { try { await navigator.clipboard.writeText('chrome://extensions'); $('#copy-extensions').textContent = 'Copied'; } catch { $('#setup-status').textContent = 'Enter chrome://extensions in Chrome’s address bar.'; } };
  if ($('#check-extension')) $('#check-extension').onclick = checkSetup;
  if ($('#reinstall-extension')) $('#reinstall-extension').onclick = () => { setupDialog('missing', targets, false, syncMode, request); if (!window.saveXDesktop) downloadExtension(); };
  if ($('#open-extension-setup')) $('#open-extension-setup').onclick = async e => {
    e.target.disabled = true;
    try {
      const opened = await bridgeRequest(chromeBookmarks ? 'OPEN_BOOKMARK_SETUP' : 'OPEN_SETUP');
      if (!opened) { await api('/sync/setup', { method: 'POST', body: { kind: chromeBookmarks ? 'chrome' : 'social' } }); wakeExtension(); }
      if ($('#setup-status')) $('#setup-status').textContent = 'Setup will open in Chrome. Approve background access there; syncing will start here automatically.';
    } catch (error) { if ($('#setup-status')) $('#setup-status').textContent = error.message; }
    finally { if (e.target.isConnected) e.target.disabled = false; }
  };
}
async function checkSetup() {
  const button = $('#check-extension'); if (button) button.disabled = true;
  try {
    await bridgeRequest(); await syncStatus();
    if (state.pendingTargets && modal.open && $('#setup-status')) $('#setup-status').textContent = currentAvailability() === 'offline' ? 'Chrome hasn’t reconnected yet. Check that saveXtension is enabled in the correct Chrome profile.' : 'Not connected yet. Finish the steps above; this page checks automatically.';
  } finally { if (button?.isConnected) button.disabled = false; }
}
function saveSyncAccounts(selected) {
  state.syncAccounts = [...new Set(selected)];
  localStorage.setItem('savex-sync-accounts', JSON.stringify(state.syncAccounts));
}
function allSourcesScanDialog() {
  showModal(`<h2>Refresh all sources</h2><div class="scan-source-summary" role="img" aria-label="X, Instagram and Chrome">${sourceIcon('x')}${sourceIcon('instagram')}${sourceIcon('chrome')}</div><div class="scan-choices"><button class="scan-choice" data-action="scan-all" data-scan-mode="quick" aria-label="Quick scan" aria-describedby="quick-scan-description"><strong>Quick scan</strong><span id="quick-scan-description">New saves</span></button><button class="scan-choice" data-action="scan-all" data-scan-mode="deep" aria-label="Deep scan" aria-describedby="deep-scan-description"><strong>Deep scan</strong><span id="deep-scan-description">Full history · takes longer</span></button></div>`);
  modal.dataset.syncOptions = 'true'; modal.dataset.allSourcesScan = 'true'; modal.classList.add('all-sources-scan-dialog');
  $('[data-action="scan-options"]')?.setAttribute('aria-expanded', 'true'); renderSync();
}
function syncOptionsDialog() {
  showModal(`<h2 id="sync-options-heading">Sync accounts</h2><fieldset class="sync-account-fieldset"><legend>Accounts</legend><div class="filter-choices" id="sync-account-choices"></div></fieldset><div class="sync-options-actions"><div class="deep-scan-control" id="deep-scan-control"><button class="secondary" data-action="deep-sync">Deep scan</button><button type="button" class="icon-button deep-scan-info" aria-label="About deep scans" aria-describedby="deep-scan-tooltip">${icon('info')}</button><span class="deep-scan-tooltip" id="deep-scan-tooltip" role="tooltip">Checks older saves across your selected accounts. Large libraries can take a while; you can keep browsing while it runs.</span></div><button class="primary" data-action="sync">${icon('refresh')} Sync now</button></div>`);
  modal.classList.add('sync-options-dialog'); modal.dataset.syncOptions = 'true';
  $('[data-action="sync-options"]')?.setAttribute('aria-expanded', 'true');
  const scanInfo = $('.deep-scan-info');
  const showScanInfo = () => delete $('#deep-scan-control').dataset.dismissed;
  scanInfo.onmouseenter = showScanInfo; scanInfo.onfocus = showScanInfo; scanInfo.onclick = showScanInfo;
  scanInfo.onkeydown = event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); $('#deep-scan-control').dataset.dismissed = 'true'; } };
  $('#sync-account-choices').onchange = event => {
    const value = event.target.value, checked = event.target.checked;
    let selected = selectedSyncAccounts();
    const options = syncAccountOptions(allPosts(), state.sync?.xAccounts, selected);
    if (value === 'all') selected = checked ? options.filter(option => option.value !== 'x:current' || !options.some(other => other.value.startsWith('x:@'))).map(option => option.value) : [];
    else {
      selected = selected.filter(item => item !== value && !(checked && value.startsWith('x:') && (value === 'x:current' ? item.startsWith('x:') : item === 'x:current')));
      if (checked) selected.push(value);
    }
    saveSyncAccounts(selected); renderSync();
  };
  renderSync();
}
function renderSyncAccounts() {
  const group = $('#sync-account-choices'); if (!group) return;
  const selected = selectedSyncAccounts(), options = syncAccountOptions(allPosts(), state.sync?.xAccounts, selected);
  const signature = JSON.stringify(options);
  if (group.dataset.options !== signature) {
    const focused = document.activeElement?.value;
    group.innerHTML = `<label class="filter-choice"><input type="checkbox" value="all" aria-label="All accounts"><span>All</span></label>` + options.map((option, index) => `<label class="filter-choice sync-account-choice"><input type="checkbox" value="${esc(option.value)}" aria-label="${esc(option.platform === 'chrome' ? 'Chrome bookmarks' : `${platformName(option.platform)} ${option.label}`)}" aria-describedby="sync-account-count-${index}"><span>${sourceIcon(option.platform)}<span class="${option.label.startsWith('@') ? 'account-handle' : ''}">${esc(option.label)}</span><span class="sync-account-count" id="sync-account-count-${index}" aria-label="${option.count} saves">${option.count}</span></span></label>`).join('');
    group.dataset.options = signature;
    if (focused) [...group.querySelectorAll('input')].find(input => input.value === focused)?.focus({ preventScroll: true });
  }
  const selectable = options.filter(option => option.value !== 'x:current' || !options.some(other => other.value.startsWith('x:@')));
  const busy = state.syncChecking || ['queued', 'running'].includes(state.sync?.job?.status);
  group.querySelectorAll('input').forEach(input => { input.checked = input.value === 'all' ? selectable.every(option => selected.includes(option.value)) : selected.includes(input.value); input.disabled = busy; });
}
function renderSync() {
  const el = $('#sync-status'); if (!el) return;
  renderSyncAccounts(); renderAccountNavigation(); updateSidebarSelection();
  const job = state.sync?.job, browser = state.sync?.browser;
  const busy = job && ['queued', 'running'].includes(job.status);
  const unsaveBusy = ['queued','running'].includes(state.sync?.unsave?.status);
  renderUnsaving();
  document.querySelectorAll('[data-action="unsave"]').forEach(button=>{button.disabled=!!busy||unsaveBusy||state.syncChecking;button.setAttribute('aria-busy',String(unsaveBusy&&Number(button.closest('[data-post-id]').dataset.postId)===state.sync.unsave.post_id));});
  styleSelects(app); if (modal.dataset.syncOptions) styleSelects(modal);
  const options = $('[data-action="sync-options"]'); if (options) options.disabled = !!busy || state.syncChecking;
  const allRefresh = $('[data-action="scan-options"]'); if (allRefresh) { allRefresh.disabled = !!busy || unsaveBusy || state.syncChecking; allRefresh.setAttribute('aria-busy', String(!!busy || unsaveBusy || state.syncChecking)); }
  const timestamp = lastSyncTime(state.sync, state.runs), age = syncAge(timestamp);
  document.querySelectorAll('[data-action="sync"],[data-action="deep-sync"],[data-action="scan-all"]').forEach(button => {
    button.disabled = !!busy || state.syncChecking || (button.dataset.action !== 'scan-all' && !sourceTargets().length);
    button.setAttribute('aria-busy', String(!!busy || state.syncChecking));
    if (button.dataset.action === 'deep-sync') { button.hidden = !sourceTargets().some(target => target !== 'chrome'); $('#deep-scan-control').hidden = button.hidden; return; }
    if (button.dataset.action !== 'scan-all') button.title = timestamp ? `Last synced ${new Date(timestamp).toLocaleString()} · Click to sync` : 'Sync your saves';
  });
  const label = $('#last-sync-label');
  if (label) label.textContent = state.syncChecking ? 'Checking…' : busy ? job.status === 'queued' ? 'Sync queued…' : job.mode === 'deep' ? 'Deep scanning…' : 'Syncing…' : age ? `Synced ${age}` : 'Not synced yet';
  const heading = $('#sync-options-heading'); if (heading) heading.textContent = timestamp ? `Last synced ${syncAge(timestamp, Date.now(), { long: true })}` : 'Sync accounts';
  renderSidebarMarkers();
  let message = state.syncChecking ? 'Checking Chrome…' : job?.message || 'Syncing in the background…';
  if (job?.status === 'queued') {
    const needsBookmarks = job.targets?.includes('chrome') && !browser?.bookmarksReady;
    const needsSocial = job.targets?.some(t => t !== 'chrome') && !browser?.ready;
    message = browser?.online && (needsBookmarks || needsSocial)
      ? needsBookmarks ? 'Allow Chrome bookmarks in extension settings' : 'Allow background access in Chrome'
      : 'Waiting for Chrome to sync in the background…';
    if (job.targets?.includes('x') && (Array.isArray(job.xAccount) ? !browser?.selectedAccounts : job.xAccount !== 'current' && !browser?.accountSwitching) && browser?.online) message = 'Reload the extension to select X accounts';
    if (job.targets?.includes('chrome') && browser?.online && !browser.bookmarksSupported) message = 'Reload the extension to import Chrome bookmarks';
    if (job.mode === 'deep' && browser?.online && !browser.syncModes) message = 'Reload the extension to use manual deep scans';
    if (job.targets?.includes('instagram') && browser?.online && !browser.instagramCollections) message = 'Reload the extension to import Instagram collections';
    if (job.instagramScope && browser?.online && !browser.instagramSaveLists) message = 'Reload the extension to refresh selected Instagram collections';
  }
  renderSyncToast(job, busy, message);
}
function dismissSyncToast(id = state.sync?.job?.id) {
  if (state.syncChecking || ['queued', 'running'].includes(state.sync?.job?.status)) return;
  if (id && id !== state.sync?.job?.id) return;
  if (id) {
    dismissedSyncJobs.add(id);
    try { sessionStorage.setItem('savex-dismissed-sync-jobs', JSON.stringify([...dismissedSyncJobs].slice(-40))); } catch { /* Dismissal still lasts until reload. */ }
  }
  clearTimeout(syncToastTimer); syncReportTimers.clear();
  const el = $('#sync-status'); el.hidden = true; el.replaceChildren(); delete el.dataset.content;
}
function updateSyncCountdown() {
  if (syncReportTicking) return;
  syncReportTicking = true; clearTimeout(syncToastTimer);
  try {
    const now = performance.now(), expired = [];
    for (const [platform, timer] of syncReportTimers) {
      const card = syncNotice.querySelector(`.sync-platform-card[data-platform="${platform}"]`);
      if (!card || syncNotice.hidden) { syncReportTimers.delete(platform); continue; }
      const paused = document.hidden || card.matches(':hover') || card.contains(document.activeElement) || !!card.querySelector('details[open]');
      if (!paused) timer.remaining = Math.max(0, timer.remaining - (now - timer.at));
      timer.at = now;
      const indicator = card.querySelector('.sync-dismiss-timer'), seconds = Math.ceil(timer.remaining / 1000);
      if (indicator) { const label = paused ? 'Paused' : `${seconds}s`; if (indicator.textContent !== label) indicator.textContent = label; indicator.title = paused ? 'Auto-dismiss paused while you read' : `Dismisses in ${seconds} seconds`; }
      card.querySelector('.sync-dismiss-progress > span')?.style.setProperty('transform', `scaleX(${timer.remaining / SYNC_REPORT_DURATION})`);
      if (!timer.remaining) { syncReportTimers.delete(platform); expired.push(platform); }
    }
    expired.forEach(dismissSyncPlatform);
  } finally {
    syncReportTicking = false;
    if (syncReportTimers.size) syncToastTimer = setTimeout(updateSyncCountdown, 250);
  }
}
function mountSyncCountdown(job) {
  if (syncReportTimerJob !== job.id) { syncReportTimers.clear(); syncReportTimerJob = job.id; }
  const now = performance.now();
  syncNotice.querySelectorAll('.sync-platform-card[data-tone="success"]').forEach(card => {
    if (!syncReportTimers.has(card.dataset.platform)) syncReportTimers.set(card.dataset.platform, { remaining: SYNC_REPORT_DURATION, at: now });
  });
  updateSyncCountdown();
}
function dismissSyncPlatform(platform) {
  const job = state.sync?.job;
  if (!job || !['completed', 'partial', 'failed'].includes(job.status)) return;
  dismissedSyncJobs.add(`${job.id}:${platform}`);
  try { sessionStorage.setItem('savex-dismissed-sync-jobs', JSON.stringify([...dismissedSyncJobs].slice(-40))); } catch { /* Keep dismissal in memory. */ }
  if (syncReport(job).every(report => dismissedSyncJobs.has(`${job.id}:${report.platform}`))) dismissSyncToast(job.id);
  else renderSync();
}
function syncReportCards(job) {
  return syncReport(job).filter(report => !dismissedSyncJobs.has(`${job.id}:${report.platform}`)).map(report => {
    const stats = report.missing ? '' : `<div class="sync-report-counts"><span><b>${report.imported}</b> new saves</span>${report.updated ? `<span><b>${report.updated}</b> refreshed</span>` : ''}${report.enriched ? `<span><b>${report.enriched}</b> with added details</span>` : ''}${report.removed ? `<span><b>${report.removed}</b> removed</span>` : ''}</div>`;
    const details = report.entries.map(result => {
      const collection = result.message?.match(/^(.+?) · \d+ new saves/);
      const label = [result.account, collection?.[1]].filter(Boolean).join(' · ') || platformName(report.platform);
      return `<div class="sync-report-entry"><strong>${esc(label)}</strong><p>${esc(result.message || (result.status === 'completed' ? 'Sync complete' : 'No further details available'))}</p></div>`;
    }).join('') || (report.fallback ? `<p>${esc(report.fallback)}</p>` : '');
    return `<article class="sync-platform-card" data-platform="${report.platform}" data-tone="${report.warning ? 'warning' : 'success'}" aria-label="${platformName(report.platform)} sync report"><div class="sync-report-header">${sourceIcon(report.platform)}<strong>${platformName(report.platform)}</strong><span class="sync-report-state">${report.warning ? 'Needs attention' : 'Sync complete'}</span>${!report.warning ? '<span class="sync-dismiss-timer" role="timer" aria-live="off" aria-label="Auto-dismiss countdown">8s</span>' : ''}<button class="icon-button" data-action="dismiss-sync-platform" data-platform="${report.platform}" aria-label="Dismiss ${platformName(report.platform)} sync report">${icon('close')}</button></div>${stats}${report.notes.length ? `<ul class="sync-report-issues">${report.notes.map(note => `<li>${esc(note)}</li>`).join('')}</ul>` : ''}${details || report.warning ? `<div class="sync-report-footer${report.warning ? ' has-retry' : ''}">${details ? `<details class="sync-report-details"><summary>Details${report.entries.length > 1 ? ` · ${report.entries.length} checks` : ''}${icon('chevron')}</summary><div class="sync-report-log">${details}</div></details>` : ''}${report.warning ? `<button class="sync-report-retry secondary" data-action="retry-sync-platform" data-platform="${report.platform}" aria-label="Retry ${platformName(report.platform)} sync">${icon('refresh')}Retry</button>` : ''}</div>` : ''}${!report.warning ? '<div class="sync-dismiss-progress" aria-hidden="true"><span></span></div>' : ''}</article>`;
  }).join('');
}
const syncNotice = $('#sync-status');
function expandSyncNotice(expanded) {
  syncNotice.dataset.expanded = String(expanded);
  syncNotice.querySelector('.sync-toast-summary')?.setAttribute('aria-expanded', String(expanded));
}
syncNotice.addEventListener('pointerenter', event => { if (event.pointerType === 'mouse') expandSyncNotice(true); });
syncNotice.addEventListener('pointerleave', () => { if (!syncNotice.contains(document.activeElement)) expandSyncNotice(false); });
syncNotice.addEventListener('focusin', () => expandSyncNotice(true));
syncNotice.addEventListener('focusout', () => queueMicrotask(() => { if (!syncNotice.matches(':hover') && !syncNotice.contains(document.activeElement)) expandSyncNotice(false); }));
document.addEventListener('visibilitychange', () => { const now = performance.now(); syncReportTimers.forEach(timer => { timer.at = now; }); updateSyncCountdown(); });
document.addEventListener('pointerdown', event => { if (!syncNotice.contains(event.target)) expandSyncNotice(false); }, { passive: true });
function renderSyncToast(job, busy, message) {
  const el = $('#sync-status'), checking = state.syncChecking;
  if (job?.status === 'completed' && previousSyncJob?.id === job.id && ['queued', 'running'].includes(previousSyncJob.status)) completedToastJob = job.id;
  previousSyncJob = job && { id: job.id, status: job.status };
  const key = checking ? 'checking' : job ? `${job.id}:${job.status}` : '';
  const changed = key !== syncToastKey;
  if (changed) { clearTimeout(syncToastTimer); syncToastKey = key; expandSyncNotice(el.matches(':hover') || el.contains(document.activeElement)); }
  const finished = ['failed', 'partial', 'completed'].includes(job?.status);
  const visible = checking || job && (busy || !dismissedSyncJobs.has(job.id) && (['failed', 'partial'].includes(job.status) || job.status === 'completed' && completedToastJob === job.id));
  el.hidden = !visible;
  if (!visible) { clearTimeout(syncToastTimer); syncReportTimers.clear(); el.replaceChildren(); delete el.dataset.content; return; }
  el.classList.toggle('sync-report-stack', finished && !checking);
  if (finished && !checking) {
    el.dataset.tone = job.status === 'completed' ? 'success' : 'warning';
    const contentKey = JSON.stringify([job.id, job.status, job.targets, job.results, job.message, [...dismissedSyncJobs]]);
    if (el.dataset.content !== contentKey) {
      const expanded = [...el.querySelectorAll('.sync-platform-card:has(details[open])')].map(card => card.dataset.platform);
      el.innerHTML = syncReportCards(job); el.dataset.content = contentKey;
      expanded.forEach(platform => { const details = el.querySelector(`[data-platform="${platform}"] details`); if (details) details.open = true; });
    }
    mountSyncCountdown(job);
    return;
  }
  clearTimeout(syncToastTimer); syncReportTimers.clear();
  const targets = checking ? ['chrome'] : job?.targets || [];
  const active = /instagram/i.test(message) ? 'instagram' : /\bX\b|twitter/i.test(message) ? 'x' : /chrome/i.test(message) ? 'chrome' : targets.length === 1 ? targets[0] : '';
  const sources = active ? [active] : targets;
  const sourceName = active ? platformName(active) : 'saves';
  const title = checking ? 'Connecting to Chrome' : job.status === 'queued' ? 'Sync queued' : busy ? `${job.mode === 'deep' ? 'Deep scanning' : 'Syncing'} ${sourceName}` : job.status === 'failed' ? 'Sync needs attention' : job.status === 'partial' ? 'Sync finished with a few issues' : 'Sync complete';
  if (/No tab with id/i.test(message)) message = `The background ${active ? platformName(active) : 'browser'} tab closed before syncing finished. Your saves are kept. Try syncing again.`;
  el.dataset.tone = checking || busy ? 'active' : job.status === 'completed' ? 'success' : 'warning';
  const summary = `<strong>${esc(title)}</strong>${checking || busy ? '<span class="sync-dots" aria-hidden="true"><span>.</span><span>.</span><span>.</span></span>' : ''}`;
  const content = `<div class="sync-toast-sources" aria-hidden="true">${sources.map(sourceIcon).join('')}</div><div class="sync-toast-content"><div class="sync-toast-heading">${checking || busy ? `<button class="sync-toast-summary" data-action="show-sync-details" aria-expanded="false" aria-controls="sync-toast-details">${summary}</button>` : summary}<div class="sync-toast-actions">${busy ? '<button class="sync-stop" data-action="stop-sync">Stop</button>' : ''}${job && !checking && !busy ? `<button class="icon-button" data-action="dismiss-sync" aria-label="Dismiss sync status">${icon('close')}</button>` : ''}</div></div><p id="sync-toast-details"></p></div>`;
  if (el.dataset.content !== content) {
    const focusedAction = el.contains(document.activeElement) ? document.activeElement.dataset.action : null;
    el.innerHTML = content; el.dataset.content = content;
    if (focusedAction) el.querySelector(`[data-action="${focusedAction}"]`)?.focus({ preventScroll: true });
  }
  $('#sync-toast-details', el).textContent = message;
  el.querySelector('.sync-toast-summary')?.setAttribute('aria-expanded', String(el.dataset.expanded === 'true'));
}
async function queueSync(targets, mode = 'quick', request = selectedSyncRequest()) {
  const { job } = await api('/sync', { method: 'POST', body: { targets, xAccount: request.xAccount, instagramAccount: request.instagramAccount, instagramCollectionId: request.instagramCollectionId, mode } });
  state.sync = { ...state.sync, job }; renderSync(); wakeExtension();
}
let statusLoading = false;
async function syncStatus() {
  if (!state.localMode || statusLoading) return;
  statusLoading = true;
  try {
    state.sync = await api('/sync'); renderSync(); void handleUnsaveStatus(state.sync.unsave);
    if ($('.source-connect')) renderSourceConnect();
    else if ($('.chrome-setup')) {
      // The first copy from Chrome queues an import; wake the desktop worker so it starts now.
      if (state.sync.job?.status === 'queued' && state.sync.job.targets?.includes('chrome')) void window.saveXDesktop?.wakeSocial?.();
      renderChromeSetup();
    }
    if (state.pendingTargets && modal.open && modal.dataset.syncSetup && !state.syncChecking) {
      const availability = currentAvailability(), targets = state.pendingTargets, mode = state.pendingMode, request = state.pendingSyncRequest;
      if (availability === 'ready') {
        state.pendingTargets = null; modal.close(); await queueSync(targets, mode, request);
      } else if (['permissions', 'missing', 'offline', 'native-accounts'].includes(availability) && modal.dataset.syncSetup !== availability) setupDialog(availability, targets, false, mode, request);
    }
  } catch { /* The reconnect screen handles server downtime. */ }
  finally { statusLoading = false; }
}
function wakeExtension() {
  if (window.saveXDesktop) { void window.saveXDesktop.connect('WAKE_SYNC').catch(error => toast(error.message, true)); return; }
  window.postMessage({ source: 'savex-library', type: 'WAKE_SYNC' }, location.origin);
}
async function startSync(mode = 'quick', request = selectedSyncRequest()) {
  if (state.syncChecking || ['queued', 'running'].includes(state.sync?.job?.status) || !request.targets.length) return;
  const fromOptions = modal.open && modal.dataset.syncOptions === 'true';
  if (state.demo) { state.demo = false; render(); }
  state.syncChecking = true; state.checkingSyncRequest = request; renderSync();
  try {
    const targets = request.targets;
    // Probe the current browser, then fall back to Chrome's server-side heartbeat.
    await bridgeRequest();
    state.sync = await api('/sync');
    if (fromOptions && (!modal.open || modal.dataset.syncOptions !== 'true')) return;
    const availability = currentAvailability(targets);
    if (availability === 'ready') { await queueSync(targets, mode, request); if (fromOptions && modal.dataset.syncOptions) modal.close(); }
    else setupDialog(availability, targets, availability === 'missing', mode, request);
  } finally { state.syncChecking = false; state.checkingSyncRequest = null; renderSync(); }
}
const archivePending = new Set();
async function toggleArchive(id) {
  const post = allPosts().find(p => p.id === Number(id));
  if (!post || archivePending.has(post.id)) return;
  const archived = !post.archived;
  archivePending.add(post.id);
  document.querySelectorAll(`[data-archive="${post.id}"]`).forEach(button => { button.disabled = true; });
  try {
    await notes.flush(post);
    const updated = state.demo ? { ...post, archived } : await api(`/posts/${post.id}`, { method: 'PATCH', body: { archived } });
    collectionVersion++;
    if (state.demo) Object.assign(post, updated);
    else state.posts = notes.overlay(state.posts.map(p => p.id === updated.id ? updated : p));
    if (modal.open && modal.dataset.postId === String(post.id)) modal.close();
    updateCollection();
    toast(archived ? 'Moved to Archive' : 'Restored to saves');
  } finally {
    archivePending.delete(post.id);
    document.querySelectorAll(`[data-archive="${post.id}"]`).forEach(button => { button.disabled = false; });
  }
}
function mountUpdateSettings() {
  if (!window.saveXDesktop?.updateStatus) return;
  $('#library-form').insertAdjacentHTML('afterend', '<section class="app-updates settings-section" aria-labelledby="app-update-heading"><div class="app-update-heading"><h3 id="app-update-heading">App version</h3><span class="fine-print" id="app-update-current" role="status" aria-live="polite" hidden>· Up to date</span><span class="fine-print" id="app-update-version"></span></div><p id="app-update-status" role="status" aria-live="polite" hidden></p><progress id="app-update-progress" aria-label="Update download" max="100" value="0" hidden></progress><button class="secondary" type="button" id="app-update-button">Check for updates</button></section>');
  const section = $('.app-updates'), button = $('#app-update-button'), progress = $('#app-update-progress');
  let latest, reading = false;
  function render(status) {
    if (!section.isConnected || !modal.open) return;
    latest = status;
    $('#app-update-current', section).hidden = status.phase !== 'current';
    $('#app-update-version', section).textContent = status.currentVersion ? `· ${status.currentVersion}` : '';
    const statusLabel = $('#app-update-status', section);
    const messages = { checking: 'Checking…', unpublished: 'No updates available.', error: 'Couldn’t check for updates. Try again.' };
    statusLabel.textContent = status.phase === 'available' ? `Version ${status.availableVersion} available` : messages[status.phase] || ''; statusLabel.hidden = !statusLabel.textContent;
    button.hidden = false;
    const downloading = status.phase === 'downloading';
    progress.hidden = !downloading; progress.value = status.percent || 0;
    progress.setAttribute('aria-valuetext', `${status.percent || 0}% downloaded`);
    button.textContent = status.phase === 'available' ? 'View release' : status.phase === 'ready' ? `Install version ${status.availableVersion}` : downloading ? `Downloading… ${status.percent || 0}%` : status.phase === 'checking' ? 'Checking…' : status.phase === 'error' ? 'Try again' : 'Check for updates';
    button.disabled = ['checking', 'downloading'].includes(status.phase);
  }
  async function refreshUpdate() {
    if (reading || !section.isConnected || !modal.open) return;
    reading = true;
    try { render(await window.saveXDesktop.updateStatus()); }
    catch { if (section.isConnected) { const label = $('#app-update-status', section); label.textContent = 'Couldn’t check for updates. Try again.'; label.hidden = false; } }
    finally { reading = false; }
  }
  button.onclick = async () => {
    button.disabled = true;
    try {
      if (latest?.phase === 'available') await window.saveXDesktop.viewUpdateRelease();
      else if (latest?.phase === 'ready') await window.saveXDesktop.installUpdate();
      else render(await window.saveXDesktop.checkForUpdates());
    } catch (error) { toast(error.message, true); }
    finally { await refreshUpdate(); }
  };
  void refreshUpdate(); updatePoll = setInterval(refreshUpdate, 1000);
}
async function settingsDialog() {
  if (state.localMode) {
    showModal(`<h2>Settings</h2><form id="library-form"><label>Library name<input name="name" value="${esc(state.name)}" maxlength="50" placeholder="My saves"></label><button class="primary" type="submit">Save name</button></form><section class="settings-section"><h3>Backup</h3><div class="button-row"><a class="secondary" href="/api/export" download>${icon('download')} Export library</a><button class="secondary" data-action="import">${icon('plus')} Import a file</button></div></section>`);
    modal.classList.add('settings-dialog');
    $('#library-form').onsubmit = async e => { e.preventDefault(); try { const result = await api('/library', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); state.name = result.name; modal.close(); render(); toast('Library name saved.'); } catch (error) { toast(error.message, true); } };
    const mcpSection = document.createElement('section'); mcpSection.className = 'mcp-settings settings-section';
    $('#library-form').insertAdjacentElement('afterend', mcpSection);
    void mountMcpSettings(mcpSection, { api, toast, esc, icon });
    if (window.saveXDesktop?.socialAccounts) {
      const section = document.createElement('section'); section.className = 'native-account-settings settings-section';
      section.innerHTML = '<h3>Accounts<span class="settings-heading-detail" id="settings-account-count"></span></h3><div id="native-account-settings-list"></div>';
      $('#library-form').insertAdjacentElement('afterend', section);
      mountSocialAccounts($('#native-account-settings-list'), { esc, icon, sourceIcon, onChange: accounts => { $('#settings-account-count', section).textContent = ` · ${accounts.length}`; void syncStatus(); } });
    }
    mountUpdateSettings(); renderSync(); return;
  }
  showModal('<h2>Settings</h2><p>Loading settings…</p>');
  try {
    const { devices } = await api('/devices');
    if (!modal.open) return;
    showModal(`<span class="dialog-kicker">Make it yours</span><h2>Settings</h2><h3>Connected browsers</h3><div class="device-list">${devices.length ? devices.map(d => `<div class="device"><span>${icon('shield')}</span><div><strong>${esc(d.name)}</strong><small>${d.lastSeen ? `Last used ${relative(d.lastSeen).toLowerCase()}` : 'Paired, ready to sync'}</small></div><button class="text-button danger" data-revoke="${d.id}">Disconnect</button></div>`).join('') : '<p class="muted">No browsers paired yet.</p>'}</div><button class="secondary" data-action="connect">${icon('plus')} Pair a browser</button><h3 class="section-gap">Your data, always yours.</h3><p>Back up your saves, notes and tags as JSON. Import that file to restore a new library.</p><div class="button-row"><a class="secondary" href="/api/export" download>${icon('download')} Export library</a><button class="secondary" data-action="import">${icon('plus')} Import a file</button></div><div class="notice">Topic suggestions use simple local keyword matching. No posts are sent to an AI service. Thumbnails load from the original platform and may expire; your captured text and notes stay saved.</div><button class="text-button" data-action="logout">${icon('logout')} Sign out of this browser</button>`);
  } catch (e) { toast(e.message, true); modal.close(); }
}
function importDialog() {
  showModal(`<h2>Import saves</h2><p>Import a saveXtension backup, extracted Instagram/X export file, or plain list of post URLs.</p><form id="import-form"><label class="file-drop">${icon('file')}<strong>Choose a JSON, HTML, JS, or TXT file</strong><span>Extract downloaded ZIP archives first. Maximum 20 MB.</span><input type="file" id="import-file" accept=".json,.html,.htm,.txt,.js" required></label><label>Source account <span class="optional">optional</span><input name="sourceAccount" placeholder="e.g. @my-personal-account" maxlength="100"></label><p class="form-error" id="import-error" role="alert"></p><button class="primary full">Import supported post links ${icon('arrow')}</button><p id="import-progress" role="status"></p></form><p class="fine-print">Exports vary: some include only links, and some omit saves entirely. We’ll tell you how many supported posts we find. JavaScript export files are read as data, never executed.</p>`);
  $('#import-form').onsubmit = async e => {
    e.preventDefault(); const button = $('button', e.target); button.disabled = true;
    try {
      const file = $('#import-file').files[0]; if (file.size > 20 * 1024 * 1024) throw new Error('Choose a file smaller than 20 MB.');
      const content = await file.text(), posts = parseImport(content, file.name);
      let topicMetadata; try { const backup = JSON.parse(content); if (backup.version && Array.isArray(backup.posts) && Array.isArray(backup.topics)) topicMetadata = backup.topics; } catch { /* Other supported import formats have no topic catalog. */ }
      if (!posts.length && !topicMetadata?.length) throw new Error('No supported Instagram or X post links were found in this file.');
      const account = new FormData(e.target).get('sourceAccount');
      let imported = 0, updated = 0, rejected = 0;
      for (let i = 0; i < Math.max(posts.length, topicMetadata ? 1 : 0); i += 100) {
        $('#import-progress').textContent = `Importing ${Math.min(i + 100, posts.length)} of ${posts.length}…`;
        const result = await api('/posts/import', { method: 'POST', body: { posts: posts.slice(i, i + 100).map(p => ({ ...p, sourceAccount: account || p.sourceAccount })), ...(i === 0 && topicMetadata ? { topics: topicMetadata } : {}) } });
        imported += result.imported; updated += result.updated; rejected += result.rejected;
      }
      state.demo = false; modal.close(); await refresh(); toast(`${imported} new saves · ${updated} revisited${rejected ? ` · ${rejected} skipped` : ''}`);
    } catch (error) { $('#import-error').textContent = error.message; button.disabled = false; }
  };
}
export function parseImport(content, name = '') {
  const found = new Map();
  function add(url, metadata = {}) {
    if (typeof url !== 'string') return;
    if (metadata.platform === 'chrome') { try { const u = new URL(url); if (['http:', 'https:'].includes(u.protocol) && !u.username && !u.password) found.set('chrome:' + u.href, { ...metadata, url: u.href }); } catch {} return; }
    const normalized = url.replace(/&amp;/g, '&');
    if (!/^https?:\/\/(?:www\.|mobile\.)?(?:(?:x|twitter)\.com\/(?:\w+|i\/web)\/status\/\d+|instagram\.com\/(?:p|reels?|tv)\/[\w-]+)/i.test(normalized)) return;
    const p = { ...metadata, url: normalized }; found.set(normalized.split('?')[0], { ...found.get(normalized.split('?')[0]), ...p });
  }
  if (/\.html?$/i.test(name)) {
    const doc = new DOMParser().parseFromString(content, 'text/html'); doc.querySelectorAll('a[href]').forEach(a => add(a.getAttribute('href')));
  } else if (/\.(json|js)$/i.test(name) || /^[\s]*[\[{]/.test(content)) {
    let data; const raw = /\.js$/i.test(name) ? content.slice(content.indexOf('=') + 1).trim().replace(/;\s*$/, '') : content;
    try { data = JSON.parse(raw); } catch { throw new Error('This file isn’t valid JSON data. Extract the export archive and choose its bookmarks or saved-posts file.'); }
    let visited = 0;
    function walk(node, depth = 0) {
      if (++visited > 200000 || depth > 60) return;
      if (typeof node === 'string') return add(node);
      if (!node || typeof node !== 'object') return;
      if (typeof node.url === 'string') add(node.url, node);
      if (node.tweetId && /^\d+$/.test(String(node.tweetId))) add(`https://x.com/i/status/${node.tweetId}`, { text: node.fullText || node.full_text || '' });
      for (const value of Object.values(node)) walk(value, depth + 1);
    }
    walk(data);
  } else { (content.match(/https?:\/\/[^\s<>"']+/g) || []).forEach(url => add(url)); }
  return [...found.values()];
}

function accountMenuTrigger(target) {
  return target.closest('[data-instagram-collection]') || target.closest('.source-account-group')?.querySelector('[data-nav-account]') || target.closest('[data-filter="chrome"]');
}
document.addEventListener('contextmenu', event => {
  const collection = event.target.closest('[data-collection-id]');
  if (collection) { event.preventDefault(); localCollectionMenu(collection, { x: event.clientX, y: event.clientY }); return; }
  const trigger = accountMenuTrigger(event.target); if (!trigger) return;
  event.preventDefault(); accountMenu(trigger, { x: event.clientX, y: event.clientY });
});
document.addEventListener('keydown', event => {
  if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return;
  const collection = event.target.closest('[data-collection-id]');
  if (collection) { event.preventDefault(); localCollectionMenu(collection); return; }
  const trigger = accountMenuTrigger(event.target); if (!trigger) return;
  event.preventDefault(); accountMenu(trigger);
});
document.addEventListener('click', async e => {
  const button = e.target.closest('[data-filter],[data-nav-account],[data-instagram-collection],[data-nav-topic],[data-open-collection],[data-topic],[data-action],[data-open],[data-archive],[data-remove-filter],[data-revoke]');
  if (!button) {
    const card = e.target.closest('#results .cards[data-view="grid"] > .save-card.has-native-embed');
    if (card && !e.target.closest('a,button,input,textarea,select,label,.card-note') && !getSelection()?.toString()) openPostPreview(card);
    return;
  }
  try {
    if (e.shiftKey && (button.dataset.navAccount || button.dataset.instagramCollection || button.dataset.navTopic || button.dataset.filter === 'chrome')) { toggleSidebarPick(button); return; }
    if (button.dataset.filter) { if (state.archive) { state.archive = false; state.filters = defaultFilters(); state.query = ''; $('#search').value = ''; } state.filters.sources = button.dataset.filter === 'all' ? [] : [button.dataset.filter]; state.filters.folder = ''; state.filters.collection = ''; state.filters.collectionName = ''; state.filters.accounts = []; state.filters.topics = []; updateCollection(); renderSync(); }
    else if (button.dataset.navAccount) {
      if (state.archive) { state.archive = false; state.filters = defaultFilters(); state.query = ''; $('#search').value = ''; }
      const value = button.dataset.navAccount;
      if (value.startsWith('instagram:')) toggleInstagramCollections(value);
      state.filters.sources = [value.split(':')[0]]; state.filters.accounts = [value]; state.filters.folder = ''; state.filters.collection = ''; state.filters.collectionName = ''; state.filters.topics = [];
      updateCollection();
    }
    else if (button.dataset.instagramCollection) {
      const collection = (state.instagramCollections || []).find(c => String(c.id) === button.dataset.instagramCollection);
      if (!collection) return;
      state.archive = false; state.filters = { ...defaultFilters(), sources: ['instagram'], accounts: [`instagram:${collection.account.toLowerCase()}`], collection: String(collection.id), collectionName: collection.name };
      state.query = ''; $('#search').value = ''; updateCollection();
    }
    else if (button.dataset.navTopic || button.dataset.openCollection) {
      state.archive = false; state.filters = { ...defaultFilters(), topics: [button.dataset.navTopic || button.dataset.openCollection] };
      state.query = ''; $('#search').value = ''; updateCollection();
      if (button.dataset.openCollection) {
        window.scrollTo({ top: 0, behavior: 'instant' });
        [...document.querySelectorAll('#topic-navigation [data-nav-topic]')].find(row => row.dataset.navTopic === button.dataset.openCollection)?.focus({ preventScroll: true });
      }
    }
    // A topic pill on a post opens that topic, like its sidebar row; it never
    // toggles the view away. Shift-click adds it to (or removes it from) the selection.
    else if (button.dataset.topic) {
      const t = button.dataset.topic;
      if (e.shiftKey) state.filters.topics = state.filters.topics.includes(t) ? state.filters.topics.filter(v => v !== t) : [...state.filters.topics, t];
      else { state.archive = false; state.filters = { ...defaultFilters(), topics: [t] }; state.query = ''; $('#search').value = ''; }
      updateCollection();
    }
    else if (button.dataset.removeFilter) { const key = button.dataset.removeFilter; if (key.startsWith('account:') || key.startsWith('collection:')) { if (key.startsWith('account:')) state.filters.accounts = state.filters.accounts.filter(value => value !== key.slice(8)); else state.filters.collections = (state.filters.collections || []).filter(id => id !== key.slice(11)); state.filters.sources = [...new Set([...state.filters.accounts.map(value => value.split(':')[0]), ...(state.filters.collections?.length ? ['instagram'] : [])])]; if (!state.filters.sources.includes('chrome')) state.filters.folder = ''; } else if (key.startsWith('topic:')) { state.filters.topics = state.filters.topics.filter(topic => topic !== key.slice(6)); } else if (key === 'date') { state.filters.date = 'any'; state.filters.start = 'all'; state.filters.end = 'now'; state.filters.from = ''; state.filters.to = ''; } else { state.filters[key] = defaultFilters()[key]; if (key === 'collection') state.filters.collectionName = ''; if (key === 'sources') state.filters.folder = ''; } renderResults(); }
    else if (button.dataset.archive) await toggleArchive(button.dataset.archive);
    else if (button.dataset.open) editNote(button.dataset.open);
    else if (button.dataset.revoke) { if (confirm('Disconnect this browser? Its next sync will require pairing again.')) { await api(`/devices/${button.dataset.revoke}`, { method: 'DELETE' }); await settingsDialog(); } }
    else switch (button.dataset.action) {
      case 'unsave': await openUnsave(button); break;
      case 'sidebar-view': selectSidebarView(button.dataset.sidebarView); break;
      case 'topics-view': setTopicsView('folders'); break;
      case 'card-view': {
        const view = button.dataset.cardView;
        if (showingTopicsHome()) { setTopicsView('cards'); break; }
        if (view === state.cardView) break;
        state.cardView = view; localStorage.setItem('savex-card-view', view);
        document.querySelectorAll('[data-action="card-view"]').forEach(control => control.setAttribute('aria-pressed', String(control.dataset.cardView === view)));
        const cards = $('#results .cards');
        if (cards) {
          const posts = new Map(allPosts().map(post => [String(post.id), post]));
          setCardView(cards, view, () => {
            for (const card of cards.querySelectorAll('.save-card')) { const post = posts.get(card.dataset.postId); if (post) syncCardNote(card, post, true, false); }
          });
        }
        break;
      }
      case 'add-collection': addCollection(button); break;
      case 'connect-source': sourceConnect.awaiting = button.dataset.platform; renderSourceConnect(); await window.saveXDesktop.connectSocial({ platform: button.dataset.platform }); break;
      case 'sync-source': await startSync('quick', sourceSyncRequest(button.dataset.platform)); renderSourceConnect(); break;
      case 'import-chrome': await startSync('quick', { ...selectedSyncRequest(), targets: ['chrome'] }); renderChromeSetup(); break;
      case 'save-chrome-helper': try { chromeSetup.saved = (await window.saveXDesktop.saveHelperToDownloads()).path; renderChromeSetup(); } catch (failure) { toast(failure.message, true); } break;
      case 'open-chrome-extensions': try { await window.saveXDesktop.openExtensions(); } catch (failure) { toast(failure.message, true); } break;
      case 'copy-chrome-extensions': try { await window.saveXDesktop.copyText('chrome://extensions'); button.textContent = 'Copied'; } catch (failure) { toast(failure.message, true); } break;
      case 'install-update': try { await window.saveXDesktop?.installUpdate(); } catch (failure) { toast(failure.message, true); } finally { void refreshUpdate(); } break;
      case 'copy-post': await copyPostReference(button); break;
      case 'remove-topic': removeTopicDialog(Number(button.closest('[data-post-id]').dataset.postId), button.dataset.topicName); break;
      case 'retry-preview': retryEmbed(button.closest('.save-card')?.querySelector('.native-embed') || $('#modal .native-embed')); break;
      case 'toggle-note-preview': {
        const card = button.closest('.save-card'), id = Number(card.dataset.postId);
        if (expandedNoteIds.has(id)) expandedNoteIds.delete(id); else expandedNoteIds.add(id);
        syncNotePreview($('.note-input',card)); break;
      }
      case 'toggle-collections': toggleInstagramCollections(button.dataset.collectionsAccount); break;
      case 'toggle-topic': toggleTopic(button.dataset.topicId); break;
      case 'refresh-account': {
        await startSync('quick', accountRefreshRequest(button.dataset.syncAccount));
        break;
      }
      case 'refresh-collection': {
        const request=collectionRefreshRequest(button.dataset.syncCollection);if(request)await startSync('quick',request);
        break;
      }
      case 'scan-options': allSourcesScanDialog(); break;
      case 'scan-all': await startSync(button.dataset.scanMode === 'deep' ? 'deep' : 'quick', { targets: connectedTargets(['chrome', 'x', 'instagram']), xAccount: 'all' }); break;
      case 'sync-options': syncOptionsDialog(); break;
      case 'sync': await startSync(); break;
      case 'deep-sync': await startSync('deep'); break;
      case 'archive-view': state.archive = true; state.filters = defaultFilters(); state.query = ''; $('#search').value = ''; updateCollection(); break;
      case 'filters': filterDialog(); break;
      case 'reset-filters': state.filters = defaultFilters(); renderResults(); break;
      case 'show-sync-details': expandSyncNotice(true); break;
      case 'dismiss-sync': dismissSyncToast(); break;
      case 'dismiss-sync-platform': dismissSyncPlatform(button.dataset.platform); break;
      case 'retry-sync-platform': {
        const job = state.sync?.job, request = job && syncRetryRequest(job, button.dataset.platform);
        if (request) await startSync(job.mode === 'deep' ? 'deep' : 'quick', request);
        break;
      }
      case 'stop-sync': await api('/sync/stop', { method: 'POST', body: {} }); wakeExtension(); await syncStatus(); break;
      case 'connect': await connectDialog(); break;
      case 'settings': await settingsDialog(); break;
      case 'import': importDialog(); break;
      case 'clear': state.filters = defaultFilters(); state.query = ''; render(); break;
      case 'demo': state.archive = false; state.demo = true; state.filters = defaultFilters(); render(); break;
      case 'exit-demo': state.demo = false; render(); break;
      case 'logout': await api('/logout', { method: 'POST', body: {} }); modal.close(); await boot(); break;
    }
  } catch (error) { toast(error.message, true); }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    const search = $('#search'), editing = e.target.closest?.('input,textarea,select,[contenteditable="true"],[contenteditable=""]');
    if (e.defaultPrevented || e.isComposing || modal.open || !state.query || !search || editing && editing !== search) return;
    e.preventDefault(); dismissSearch(); return;
  }
  const modifier = macKeyboard ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
  if (e.key.toLowerCase() !== 'f' || !modifier || e.altKey || e.shiftKey || e.isComposing) return;
  const search = $('#search'); if (!search) return;
  e.preventDefault();
  closeSelect(); closeCollectionPicker();
  if (modal.open) { flushActiveNote(); modal.close(); }
  rememberSearchView();
  search.focus(); search.select();
});
document.addEventListener('visibilitychange', () => { if (document.hidden) void notes.flushAll(); else if ($('#results')) refresh(true); });
window.addEventListener('online', () => { void notes.flushAll(); });
window.addEventListener('pagehide', () => { void notes.flushAll(); });
setInterval(() => { if ($('#results') && state.localMode) syncStatus(); }, 2000);
setInterval(() => { if (!document.hidden && !modal.open && $('#results')) refresh(true); }, 5000);
const demoPosts = [
  { id: -1, platform: 'x', title: '', text: 'The best AI workflow isn’t the one with the most tools.\n\nIt’s the one that removes the step you keep putting off. Start there.', author: 'example_creator', authorName: 'An example creator', topics: ['AI & models', 'Tools'], favorite: true },
  { id: -2, platform: 'instagram', title: 'A small collection of useful interfaces.', text: 'Save the details that make something feel effortless: clear labels, generous spacing, and one obvious next step.', author: 'design_example', authorName: 'Design example', topics: ['Design'], favorite: false },
  { id: -3, platform: 'x', title: 'A learning list for the weekend', text: 'One paper. One working prototype. One thing you can explain to a friend.\n\nA little practice goes a long way.', author: 'learning_example', authorName: 'Learning example', topics: ['Research', 'Learning'], favorite: false },
  { id: -4, platform: 'instagram', title: 'Your next side project starts here.', text: 'The idea you scribbled down. The tutorial you saved. The tiny problem you know how to fix. Put them in the same place.', author: 'build_example', authorName: 'Build example', topics: ['Coding', 'Business'], favorite: false },
  { id: -5, platform: 'x', title: '', text: 'A note to future me:\n\nBookmark fewer things you feel you should read. Keep more things you actually want to try.', author: 'notes_example', authorName: 'Notes example', topics: ['Tools'], favorite: true },
  { id: -6, platform: 'instagram', title: 'Make room for curiosity.', text: 'A useful idea can come from anywhere. Finding it again should be the easy part.', author: 'curious_example', authorName: 'Curiosity example', topics: ['Design', 'Learning'], favorite: false }
].map((p, i) => ({ thumbnail: '', kind: 'text', tags: [], accounts: ['@example'], notes: '', archived: false, savedAt: new Date(Date.now() - i * 86400000).toISOString(), url: p.platform === 'x' ? 'https://x.com' : 'https://www.instagram.com', ...p }));
// Filter chips stay on one row beside the Filters button; the rest collapse
// into "+N more", which opens the Filters dialog with everything selected.
function fitFilterChips() {
  const active = $('#active-filters'), more = $('.filter-more', active || document), clear = $('[data-action="reset-filters"]', active || document);
  if (!active || !more) return;
  const chips = [...active.querySelectorAll('.filter-chip')], rowBottom = $('#open-filters').getBoundingClientRect().bottom;
  chips.forEach(chip => { chip.hidden = false; }); more.hidden = true; if (clear) clear.hidden = false;
  // Shorter controls sit centred in the row, so only a top below the Filters button means a new line.
  const wraps = () => [...active.children].some(el => !el.hidden && el.getBoundingClientRect().top >= rowBottom - 2);
  // "Clear all" goes first (the Filters dialog can reset too), so as many chips as fit stay visible.
  if (clear && wraps()) clear.hidden = true;
  let hidden = 0;
  while (wraps() && hidden < chips.length) {
    chips[chips.length - 1 - hidden].hidden = true; hidden++;
    more.hidden = false; more.textContent = `+${hidden} more`; more.title = `${hidden} more ${hidden === 1 ? 'filter' : 'filters'}`;
  }
  // With no room for even one chip, the count on the Filters button says enough.
  if (hidden && hidden === chips.length) more.hidden = true;
}
// The toolbar's blur backdrop appears only once posts can slide under it, and
// spans everything right of the sidebar at the toolbar's current height.
function syncToolbar() {
  document.documentElement.classList.toggle('page-scrolled', scrollY > 4);
  const tools = $('.collection-tools'), main = $('.main'), root = document.documentElement.style;
  if (main) root.setProperty('--toolbar-left', `${main.getBoundingClientRect().left}px`);
  if (tools?.offsetHeight) root.setProperty('--toolbar-height', `${Math.max(tools.getBoundingClientRect().bottom, $('.search-tools')?.getBoundingClientRect().bottom || 0, tools.offsetHeight + 16)}px`);
}
addEventListener('scroll', syncToolbar, { passive: true }); addEventListener('resize', () => { fitFilterChips(); syncToolbar(); }); syncToolbar();
enableTopicDrag({ topics: () => state.topicCatalog, describe: id => state.topicCatalog.find(topic => topic.id === id), move: moveTopic, arrange: arrangeTopics,
  tag: { has: (postId, id) => state.demo || !!allPosts().find(post => post.id === postId)?.topics.includes(state.topicCatalog.find(topic => topic.id === id)?.name), add: tagPost },
  selection: () => state.filters.topics.map(name => state.topicCatalog.find(topic => topic.name === name)?.id).filter(Boolean) });
boot();
