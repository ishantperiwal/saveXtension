import { syncAvailability, lastSyncTime, syncAge } from './sync-state.js';
import { syncAccountOptions, legacySyncSelection, syncSelectionRequest } from './sync-selection.js';
import { sidebarAccounts } from './sidebar-accounts.js';
import { embedTarget } from './embed-target.js';
import { mountEmbeds, disposeEmbeds, configureEmbeds } from './embeds.js';
import { createNoteAutosave } from './notes.js';
import { applyFilters, defaultFilters, dateBounds, filterChips, accountOptions } from './filters.js';
import { mountDateRange } from './date-range.js';
import { enhanceSelects, closeSelect } from './select.js';
const $ = (selector, root = document) => root.querySelector(selector);
const app = $('#app'), modal = $('#modal');
const paths = {
  bookmark: '<path d="M6 4h12v17l-6-4-6 4z"/>',
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
  settings: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3" fill="currentColor"/><circle cx="15" cy="17" r="3" fill="currentColor"/>',
  filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
  list: '<path d="M8 5h13M8 12h13M8 19h13M3 5h.01M3 12h.01M3 19h.01"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z"/><path d="m8 11 3 3 5-5"/>',
  logout: '<path d="M10 4H4v16h6M13 8l4 4-4 4M9 12h12"/>',
  file: '<path d="M14 2H5v20h14V7zM14 2v6h5M8 13h8M8 17h6"/>',
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
let storedSyncAccounts = null;
try { const saved = JSON.parse(localStorage.getItem('savex-sync-accounts')); if (Array.isArray(saved) && saved.every(value => /^(x:(current|@[a-z0-9_]{1,30})|instagram:current|chrome:\*)$/.test(value))) storedSyncAccounts = [...new Set(saved)]; } catch { /* Migrate previous source choices. */ }
const state = { syncAccounts: storedSyncAccounts, instagramCollections: [], posts: [], runs: [], filters: defaultFilters(), query: '', archive: false, demo: false, busy: false, name: '', localMode: true, sync: null, bridge: null, syncChecking: false, pendingTargets: null, pendingMode: 'quick', source: localStorage.getItem('savex-source') || 'x', xAccount: localStorage.getItem('savex-x-account') || 'current' };
let toastTimer, searchTimer, collectionVersion = 0;
let syncToastTimer, syncToastKey = '', previousSyncJob = null, completedToastJob = null;
let dismissedSyncJobs = new Set();
try { dismissedSyncJobs = new Set(JSON.parse(sessionStorage.getItem('savex-dismissed-sync-jobs') || '[]')); } catch { /* First notification in this tab. */ }
function toast(message, error = false) { const el = $('#toast'); el.textContent = message; el.className = `visible ${error ? 'error' : ''}`; clearTimeout(toastTimer); toastTimer = setTimeout(() => el.className = '', 4200); }
async function api(path, { method = 'GET', body, keepalive = false } = {}) {
  const res = await fetch(`/api${path}`, { method, credentials: 'same-origin', keepalive, headers: body === undefined ? {} : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const result = await res.json();
  if (!res.ok) { if (res.status === 401 && !['/login', '/setup'].includes(path)) boot(); throw new Error(result.error || 'Request failed.'); }
  return result;
}
let activeNote = null;
const notes = createNoteAutosave({
  storage: localStorage,
  save: (id, value) => api(`/posts/${id}`, { method: 'PATCH', body: { notes: value }, keepalive: true }),
  onSaved: post => {
    state.posts = notes.overlay(state.posts.map(p => p.id === post.id ? { ...p, notes: post.notes, updatedAt: post.updatedAt } : p));
    updateCollection();
  },
  onState: (post, status) => {
    if (activeNote?.id !== post.id || activeNote?.url !== post.url) return;
    const label = $('#note-status'); if (!label) return;
    label.textContent = status === 'saved' ? 'Saved' : status === 'error' ? 'Not saved yet · retrying' : 'Saving…';
    label.dataset.state = status;
  }
});
function flushActiveNote() { if (activeNote) { void notes.flush(activeNote); activeNote = null; } }
function showModal(content, wide = false) {
  closeSelect();
  flushActiveNote();
  disposeEmbeds(modal);
  state.pendingTargets = null; delete modal.dataset.syncSetup; delete modal.dataset.postId; delete modal.dataset.syncOptions;
  $('[data-action="sync-options"]')?.setAttribute('aria-expanded', 'false');
  modal.innerHTML = `<button class="icon-button modal-close" aria-label="Close dialog">${icon('close')}</button>${content}`;
  modal.className = wide ? 'wide' : ''; if (!modal.open) modal.showModal();
  $('.modal-close', modal).onclick = () => modal.close();
}
modal.addEventListener('click', e => { if (e.target === modal) { const b = modal.getBoundingClientRect(); if (e.clientX < b.left || e.clientX > b.right || e.clientY < b.top || e.clientY > b.bottom) modal.close(); } });
modal.addEventListener('close', () => { closeSelect(); $('#open-filters')?.setAttribute('aria-expanded', 'false'); $('[data-action="sync-options"]')?.setAttribute('aria-expanded', 'false'); flushActiveNote(); disposeEmbeds(modal); state.pendingTargets = null; delete modal.dataset.syncSetup; delete modal.dataset.postId; delete modal.dataset.syncOptions; });

async function boot() {
  try {
    const session = await api('/session'); state.name = session.name; state.localMode = session.localMode; configureEmbeds(session.embedOrigin);
    if (!session.authenticated) return authScreen(session.setupRequired);
    const data = await api('/posts?scope=all'); state.posts = notes.overlay(data.posts); state.runs = data.runs; state.instagramCollections = data.instagramCollections || []; state.demo = false; render(); void notes.resume(data.posts); if (state.localMode) await syncStatus();
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
function allPosts() { return state.demo ? demoPosts : state.posts; }
function scopedPosts() { return allPosts().filter(post => !!post.archived === state.archive); }
function filteredPosts() { return applyFilters(scopedPosts(), state.filters, { query: state.query }); }
function selectedSource() { return state.filters.sources.length === 1 ? state.filters.sources[0] : 'all'; }
function navItem(filter, label, symbol, count) {
  return `<button class="nav-item ${(filter === 'all' ? !state.filters.sources.length : state.filters.sources.length === 1 && state.filters.sources[0] === filter) ? 'active' : ''}" data-filter="${filter}" data-nav-label="${label}" aria-label="${label} ${count}" title="${label}">${sourceIcon(filter)}<span class="nav-label-text">${filter === 'chrome' ? 'Chrome' : label}</span><span class="nav-count">${count}</span></button>`;
}
function navigationAccounts() { return sidebarAccounts(allPosts(), state.sync?.xAccounts?.accounts || [], state.demo ? [] : state.instagramCollections || []); }
function selectedAccountLabel() { return state.filters.accounts.length === 1 ? navigationAccounts().find(account => account.value === state.filters.accounts[0])?.label || '' : ''; }
function renderAccountNavigation() {
  const root = $('#account-navigation'); if (!root) return;
  const accounts = navigationAccounts(), collections = state.demo ? [] : state.instagramCollections || [];
  const counts = new Map();
  for (const post of allPosts().filter(post => !post.archived)) for (const id of new Set((post.collections || []).map(collection => collection.id))) counts.set(id, (counts.get(id) || 0) + 1);
  const signature = JSON.stringify([accounts, collections, [...counts]]);
  if (root.dataset.signature === signature) return;
  const focused = root.contains(document.activeElement) ? { account: document.activeElement.dataset.navAccount, collection: document.activeElement.dataset.instagramCollection } : null;
  root.innerHTML = accounts.map(account => {
    const name = account.label === platformName(account.platform) ? account.label : `${platformName(account.platform)} ${account.label}`;
    const folders = account.platform === 'instagram' ? collections.filter(collection => account.value === `instagram:${collection.account.toLowerCase()}`) : [];
    return `<div class="source-account-group"><button class="nav-item account-nav-item" data-nav-account="${esc(account.value)}" aria-label="${esc(name)} ${account.count}" aria-pressed="false" title="${esc(name)}">${sourceIcon(account.platform)}<span class="nav-label-text ${account.label.startsWith('@') ? 'account-handle' : ''}">${esc(account.label)}</span><span class="nav-count">${account.count}</span></button>${folders.length ? `<ul class="instagram-collections" aria-label="Instagram collections for ${esc(account.label)}">${folders.map(collection => `<li><button class="nav-item instagram-collection" data-instagram-collection="${collection.id}" aria-pressed="false" aria-label="${esc(collection.name)} · ${esc(collection.account)} · ${counts.get(collection.id) || 0} saves" title="${esc(collection.name)}"><span class="collection-label">${esc(collection.name)}</span><span class="nav-count">${counts.get(collection.id) || 0}</span></button></li>`).join('')}</ul>` : ''}</div>`;
  }).join('');
  root.dataset.signature = signature;
  if (focused) [...root.querySelectorAll('button')].find(button => focused.account ? button.dataset.navAccount === focused.account : button.dataset.instagramCollection === focused.collection)?.focus({ preventScroll: true });
}
function updateSidebarSelection() {
  document.querySelectorAll('[data-filter]').forEach(button => {
    const active = !state.archive && (button.dataset.filter === 'all' ? !state.filters.sources.length : state.filters.sources.length === 1 && state.filters.sources[0] === button.dataset.filter);
    button.classList.toggle('active', active); button.setAttribute('aria-pressed', active);
  });
  document.querySelectorAll('[data-nav-account]').forEach(button => {
    const value = button.dataset.navAccount, platform = value.split(':')[0];
    const active = !state.archive && (state.filters.accounts.length ? state.filters.accounts.includes(value) || state.filters.accounts.includes(`${platform}:*`) : state.filters.sources.length === 1 && state.filters.sources[0] === platform);
    button.classList.toggle('active', active); button.setAttribute('aria-pressed', active);
  });
  document.querySelectorAll('[data-instagram-collection]').forEach(button => {
    const active = !state.archive && String(state.filters.collection) === button.dataset.instagramCollection;
    button.classList.toggle('active', active); button.setAttribute('aria-pressed', active);
  });
  const archive = $('.archive-nav'); if (archive) { archive.classList.toggle('active', state.archive); archive.setAttribute('aria-pressed', state.archive); }
}
function renderSidebarMarkers() {
  const sidebar = $('.sidebar'), marks = $('.sidebar-selection-marks');
  if (!sidebar || !marks) return;
  const bounds = sidebar.getBoundingClientRect();
  const selected = [...sidebar.querySelectorAll('[data-filter].active, [data-nav-account].active, [data-instagram-collection].active, .archive-nav.active')].filter(item => {
    if (!item.getClientRects().length) return false;
    const rect = item.getBoundingClientRect(), clip = item.closest('nav').getBoundingClientRect();
    return rect.top + rect.height / 2 >= clip.top && rect.top + rect.height / 2 <= clip.bottom && rect.left + rect.width / 2 >= clip.left && rect.left + rect.width / 2 <= clip.right;
  });
  marks.replaceChildren(...selected.map(item => {
    const rect = item.getBoundingClientRect(), mark = document.createElement('span');
    mark.style.top = `${rect.top - bounds.top - sidebar.clientTop + sidebar.scrollTop + (rect.height - 16) / 2}px`;
    return mark;
  }));
}
const sidebarObserver = new ResizeObserver(renderSidebarMarkers);
function render() {
  closeSelect();
  sidebarObserver.disconnect();
  const focused = document.activeElement; const focusId = focused?.id; const selection = focused?.selectionStart;
  const posts = allPosts(), live = posts.filter(p => !p.archived);
  app.innerHTML = `<div class="workspace">
    <aside class="sidebar">
      <div class="sidebar-header"><a href="/" class="brand">${icon('bookmark')}<span>save<span class="accent">X</span>tension</span></a></div>
      <div class="sidebar-sync-group"><button class="sidebar-sync" data-action="sync" aria-label="Sync" aria-describedby="last-sync-label">${icon('refresh')}<span id="last-sync-label">Sync saves</span></button><button class="sidebar-sync-options" data-action="sync-options" aria-label="Sync options" title="Sources, accounts and deep scan" aria-haspopup="dialog" aria-controls="modal" aria-expanded="false">${icon('chevron')}</button></div>
      <nav aria-label="Library">
        ${navItem('all', 'All saves', 'grid', live.length)}
        <div class="source-nav">
          <div id="account-navigation"></div>
          ${navItem('chrome', 'Chrome bookmarks', 'bookmark', live.filter(p => p.platform === 'chrome').length)}
          <button class="nav-item archive-nav" data-action="archive-view" aria-label="Archive ${posts.length - live.length}" aria-pressed="false" title="Archive">${icon('archive')}<span class="nav-label-text">Archive</span><span class="nav-count">${posts.length - live.length}</span></button>
        </div>
      </nav>
      <div class="sidebar-bottom"><button class="nav-item settings-button" data-action="settings" aria-label="Settings & backups" title="Settings & backups">${icon('settings')}<span>Settings</span></button></div>
      <div class="sidebar-selection-marks" aria-hidden="true"></div>
    </aside>
    <main class="main">
      <div class="page-content">
        <h1 class="sr-only">${esc(state.filters.topics.join(', ') || selectedAccountLabel() || ({ all: 'All saves', x: 'X', instagram: 'Instagram', chrome: 'Chrome bookmarks' }[selectedSource()]))}</h1>
        <div class="collection-tools">
          <div class="browse-controls"><button class="filter-button" id="open-filters" data-action="filters" aria-label="Filters" aria-haspopup="dialog" aria-expanded="false">${icon('filter')}<span>Filters</span><span class="filter-count" hidden></span></button></div>
          <label class="search">${icon('search')}<input id="search" type="search" placeholder="Search" value="${esc(state.query)}" aria-label="Search saves" aria-keyshortcuts="${macKeyboard ? 'Meta' : 'Control'}+F"><kbd aria-label="${macKeyboard ? 'Command' : 'Control'} F">${searchKeys}</kbd></label>
        </div>
        ${state.demo ? '<div class="demo-banner"><span>Sample saves</span><button data-action="exit-demo">Close</button></div>' : ''}
        <div id="active-filters" class="active-filters" hidden></div>
        <div id="results"></div>
      </div>
    </main>
  </div>`;
  $('#search').oninput = e => { state.query = e.target.value; clearTimeout(searchTimer); searchTimer = setTimeout(renderResults, 100); };
  renderAccountNavigation();
  renderResults();
  renderSync();
  $('.sidebar nav')?.addEventListener('scroll', renderSidebarMarkers, { passive: true });
  ['.sidebar', '.sidebar-header', '.sidebar-sync-group', '.sidebar nav'].forEach(selector => { const element = $(selector); if (element) sidebarObserver.observe(element); });
  if (focusId && document.getElementById(focusId)) { const next = document.getElementById(focusId); next.focus({ preventScroll: true }); if (typeof selection === 'number' && next.type === 'text') next.setSelectionRange(selection, selection); }
}
function renderResults() {
  if (!$('#results')) return;
  renderFilterUI();
  const posts = filteredPosts();
  if (!posts.length) {
    const emptyLibrary = !scopedPosts().length;
    $('#results').innerHTML = emptyLibrary
      ? state.archive ? '<section class="empty-state"><h2>Archive is empty</h2></section>' : `<section class="empty-state"><h2>No saves yet</h2><button class="text-button" data-action="demo">View sample saves</button></section>`
      : `<section class="no-results"><p>${state.query ? 'No matches' : 'No saves here yet'}</p><button class="text-button" data-action="clear">Clear filters</button></section>`;
    disposeEmbeds(); return;
  }
  reconcileCards(posts);
}
function renderFilterUI() {
  if (state.filters.collection) {
    const collection = (state.instagramCollections || []).find(c => String(c.id) === String(state.filters.collection));
    if (collection) state.filters.collectionName = collection.name;
  }
  renderAccountNavigation();
  const chips = filterChips(state.filters), button = $('#open-filters'), badge = $('.filter-count');
  if (badge) { badge.hidden = !chips.length; badge.textContent = chips.length; }
  button?.classList.toggle('has-filters', !!chips.length);
  const active = $('#active-filters');
  if (active) {
    active.hidden = !chips.length;
    active.innerHTML = chips.map(c => `<button class="filter-chip" data-remove-filter="${c.key}" aria-label="${esc(c.removeLabel || `Remove ${c.key} filter`)}" title="${esc(c.title || c.label)}">${c.platform ? sourceIcon(c.platform) : ''}${esc(c.label)} ${icon('close')}</button>`).join('') + (chips.length > 1 ? '<button class="text-button" data-action="reset-filters">Clear all</button>' : '');
  }
  updateSidebarSelection();
  const heading = $('.page-content h1'); if (heading) { heading.textContent = state.archive ? 'Archive' : state.filters.collectionName || state.filters.topics.join(', ') || selectedAccountLabel() || ({ all: 'All saves', x: 'X', instagram: 'Instagram', chrome: 'Chrome bookmarks' }[selectedSource()]); heading.className = state.archive || state.filters.collection ? 'collection-heading' : 'sr-only'; }
  renderSidebarMarkers();
}
function filterDialog() {
  const current = state.filters, posts = scopedPosts();
  const topics = [...new Set(posts.flatMap(p => p.topics))].sort();
  const accounts = accountOptions(posts, state.sync?.xAccounts?.accounts || []);
  const accountName = value => value.platform === 'chrome' ? 'Chrome bookmarks' : value.label === platformName(value.platform) ? value.label : `${platformName(value.platform)} ${value.label}`;
  const folders = [...new Set(posts.filter(p => p.platform === 'chrome').flatMap(p => p.folders || []))].sort();
  const chosen = value => current.accounts.length ? current.accounts.includes(value.value) || current.accounts.includes(`${value.platform}:*`) : current.sources.includes(value.platform);
  showModal(`<div class="filter-heading"><h2>Filters</h2></div><form id="filters-form"><div class="filter-fields">
    <fieldset class="filter-section"><legend title="Instagram and X use the date they were first synced">Saved date</legend><div id="date-range"></div></fieldset>
    <fieldset class="filter-section"><legend>Accounts</legend><div class="filter-choices"><label class="filter-choice"><input type="checkbox" id="all-filter-sources" ${!current.sources.length && !current.accounts.length ? 'checked' : ''}><span>All</span></label>${accounts.map(value => `<label class="filter-choice account-choice" title="${esc(accountName(value))}"><input type="checkbox" name="accounts" value="${esc(value.value)}" aria-label="${esc(accountName(value))}" ${chosen(value) ? 'checked' : ''}><span>${sourceIcon(value.platform)}<span class="${value.label.startsWith('@') ? 'account-handle' : ''}">${esc(value.label)}</span></span></label>`).join('')}</div></fieldset>
    ${topics.length ? `<fieldset class="filter-section"><legend>Topics</legend><div class="filter-choices">${topics.map(t => `<label class="filter-choice"><input type="checkbox" name="topics" value="${esc(t)}" ${current.topics.includes(t) ? 'checked' : ''}><span>${esc(t)}</span></label>`).join('')}</div></fieldset>` : ''}
    <label id="filter-folder-group" hidden>Chrome folder<select id="bookmark-folder" name="folder" aria-label="Bookmark folder"><option value="">All bookmark folders</option>${folders.map(f => `<option value="${esc(f)}" ${current.folder === f ? 'selected' : ''}>${esc(f)}</option>`).join('')}</select></label>
    </div><footer class="filter-footer"><p id="filter-error" class="form-error" role="alert"></p><button class="secondary" type="button" id="reset-filter-draft">Reset</button><button class="primary" type="submit" id="show-filtered-saves">Show saves</button></footer></form>`);
  modal.classList.add('filter-dialog'); $('#open-filters')?.setAttribute('aria-expanded', 'true');
  const form = $('#filters-form');
  const timeline = mountDateRange($('#date-range'), current);
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
    const selected = draft(), bounds = dateBounds(selected), count = applyFilters(scopedPosts(), selected, { query: state.query }).length;
    $('#filter-error').textContent = bounds.error || ''; $('#show-filtered-saves').disabled = !!bounds.error;
    $('#show-filtered-saves').textContent = `Show ${count} ${count === 1 ? 'save' : 'saves'}`;
    styleSelects(form);
  }
  form.addEventListener('input', e => {
    if (e.target.id === 'all-filter-sources') form.querySelectorAll('[name="accounts"]').forEach(el => { el.checked = false; });
    preview();
  });
  $('#reset-filter-draft').onclick = () => { preserveCollection = false; form.reset(); timeline.reset(); form.querySelectorAll('input[type="checkbox"]').forEach(el => { el.checked = false; }); form.elements.folder.value = ''; preview(); };
  form.onsubmit = e => { e.preventDefault(); const selected = draft(); if (dateBounds(selected).error) return; state.filters = selected; modal.close(); renderResults(); $('#open-filters')?.focus(); };
  preview();
}
function bookmarkPreview(p, full = false) {
  const u = new URL(p.url);
  const folders = (p.folders || []).filter(f => full || !/^(Other bookmarks|Bookmarks bar|Mobile bookmarks)$/i.test(f));
  return `<div class="bookmark-preview"><span class="bookmark-host">${esc(u.hostname.replace(/^www\./, ''))}</span><a class="bookmark-title" href="${esc(p.url)}" title="${esc(p.bookmarkTitle || p.title || p.url)}" target="_blank" rel="noopener noreferrer">${esc(p.bookmarkTitle || u.hostname)}</a></div><div class="bookmark-folders">${folders.map(f => `<span title="${esc(f)}">${esc(f)}</span>`).join('')}</div>`;
}
function nativePreview(p, full = false) {
  if (p.platform === 'chrome') return bookmarkPreview(p, full);
  const supported = !!embedTarget(p.url);
  return `<section class="native-embed" data-post-url="${esc(p.url)}" data-embed-state="${supported ? 'pending' : 'failed'}"><div class="embed-stage"><div class="embed-placeholder" role="status"><span>Loading post…</span></div></div><div class="embed-error" ${supported ? 'hidden' : ''}><p>This post can’t be loaded right now.</p><div><button type="button" class="text-button" data-embed-retry>Retry</button><a href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">Open original</a></div></div></section>`;
}
function card(p) {
  const native = p.platform !== 'chrome' && !!embedTarget(p.url);
  return `<article class="save-card ${p.platform} ${native ? 'has-native-embed' : ''}" data-post-id="${p.id}">
    <div class="card-metadata" ${!p.notes ? 'hidden' : ''}>${p.notes ? `<p class="card-note">${esc(p.notes.slice(0, 220))}</p>` : ''}</div>
    ${nativePreview(p)}
    <footer class="card-footer"><div class="card-tags">${[...new Set(p.topics)].slice(0, 3).map(t => `<button class="tag" data-topic="${esc(t)}">${esc(t)}</button>`).join('')}</div><div class="card-actions"><button class="icon-button" data-archive="${p.id}" aria-label="${p.archived ? 'Restore save' : 'Archive save'}" title="${p.archived ? 'Restore to saves' : 'Archive'}">${icon(p.archived ? 'restore' : 'archive')}</button><button class="icon-button" data-open="${p.id}" aria-label="Edit note" title="Edit note">${icon('pencil')}</button><a class="icon-button" href="${esc(p.url)}" target="_blank" rel="noopener noreferrer" aria-label="Open original post" title="Open original">${icon('arrow')}</a></div></footer>
  </article>`;
}
// Preserve the iframe itself while background sync refreshes metadata around it.
const cardVersions = new WeakMap();
function reconcileCards(posts) {
  let cards = $('#results > .cards');
  if (!cards) { $('#results').innerHTML = '<div class="cards"></div>'; cards = $('#results > .cards'); }
  cards.className = 'cards';
  const previous = new Map([...cards.children].map(el => [el.dataset.postId, el]));
  const wanted = new Set(posts.map(p => String(p.id)));
  for (const [key, el] of previous) if (!wanted.has(key)) { el.remove(); previous.delete(key); }
  posts.forEach((post, index) => {
    const key = String(post.id), version = JSON.stringify(post);
    let el = previous.get(key); previous.delete(key);
    if (!el) {
      const template = document.createElement('template'); template.innerHTML = card(post); el = template.content.firstElementChild;
    } else if (cardVersions.get(el) !== version) {
      const template = document.createElement('template'); template.innerHTML = card(post); const next = template.content.firstElementChild;
      for (const selector of ['.card-metadata', '.card-footer']) el.querySelector(selector)?.replaceWith(next.querySelector(selector));
      if (post.platform === 'chrome') { el.querySelector('.bookmark-preview')?.replaceWith(next.querySelector('.bookmark-preview')); el.querySelector('.bookmark-folders')?.replaceWith(next.querySelector('.bookmark-folders')); }
    }
    cardVersions.set(el, version);
    if (cards.children[index] !== el) cards.insertBefore(el, cards.children[index] || null);
  });
  for (const el of previous.values()) el.remove();
  mountEmbeds(cards);
}
function updateCollection() {
  if (!$('#results')) return render();
  const posts = allPosts(), live = posts.filter(p => !p.archived);
  const counts = { all: live.length, x: live.filter(p => p.platform === 'x').length, instagram: live.filter(p => p.platform === 'instagram').length, chrome: live.filter(p => p.platform === 'chrome').length };
  document.querySelectorAll('[data-filter]').forEach(button => { const count = button.querySelector('.nav-count'); if (count) { count.textContent = counts[button.dataset.filter]; button.setAttribute('aria-label', `${button.dataset.navLabel} ${counts[button.dataset.filter]}`); } });
  const archive = $('.archive-nav'); if (archive) { const count = posts.length - live.length; $('.nav-count', archive).textContent = count; archive.setAttribute('aria-label', `Archive ${count}`); }
  renderResults();
}
async function refresh(silent = false) {
  if (state.demo) return;
  const version = collectionVersion;
  try { const data = await api('/posts?scope=all'); if (version !== collectionVersion) return; if (data.embedOrigin) configureEmbeds(data.embedOrigin); const changed = JSON.stringify(state.posts) !== JSON.stringify(data.posts) || JSON.stringify(state.instagramCollections) !== JSON.stringify(data.instagramCollections || []); state.posts = notes.overlay(data.posts); state.runs = data.runs; state.instagramCollections = data.instagramCollections || []; if (changed || !silent) updateCollection(); }
  catch (e) { if (!silent) toast(e.message, true); }
}
async function connectDialog() { await startSync(); }
function bridgeRequest(type = 'PROBE_EXTENSION', timeout = 1400) {
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
  const bridge = state.bridge && Date.now() - state.bridge.seenAt < 5000 ? state.bridge : null;
  return syncAvailability(state.sync?.browser, bridge, targets);
}
function downloadExtension() {
  const link = document.createElement('a'); link.href = '/extension.zip'; link.download = 'savextension.zip';
  document.body.append(link); link.click(); link.remove(); sessionStorage.setItem('savex-extension-downloaded', 'true');
}
function setupDialog(mode, targets, download = false, syncMode = 'quick') {
  const missing = mode === 'missing', offline = mode === 'offline', chromeBookmarks = targets.includes('chrome');
  const title = missing ? 'Install once. Then just Sync.' : offline ? 'Open Chrome to sync.' : chromeBookmarks ? 'Allow Chrome bookmarks once.' : 'Allow background access once.';
  const intro = missing ? 'The extension wasn’t detected. Your download contains the browser helper that brings your saves here.' : offline ? 'Your Chrome helper was connected before, but it isn’t responding right now. Open Chrome with the profile where you installed saveXtension.' : chromeBookmarks ? 'Chrome needs your permission to read bookmark titles, links and folders from this profile and save them in your local library.' : 'Your extension is installed. Chrome needs your permission to read saved posts in background tabs.';
  showModal(`<div class="sync-setup"><span class="dialog-kicker">${missing ? 'One-time setup' : 'Almost ready'}</span><h2>${title}</h2><p>${intro}</p>${missing ? `<ol class="setup-steps"><li><strong>Unzip the download</strong><p>Keep the extracted folder somewhere permanent.</p></li><li><strong>Open Chrome’s extensions page</strong><p>Enter <code>chrome://extensions</code> in Chrome’s address bar. For Edge, use <code>edge://extensions</code>.</p><button class="text-button" id="copy-extensions">Copy Chrome address</button></li><li><strong>Load the extension folder</strong><p>Turn on <b>Developer mode</b>, click <b>Load unpacked</b>, and choose the extracted <code>extension</code> folder.</p></li><li><strong>Allow your selected sources</strong><p>Open saveXtension once and click <b>${chromeBookmarks ? 'Settings → Allow Chrome bookmarks' : 'Enable background sync'}</b>. Approve Chrome’s permission request.</p></li></ol><div class="button-row"><a class="secondary" href="/extension.zip" download="savextension.zip">${icon('download')} Download again</a><button class="primary" id="check-extension">Check installation</button></div>` : offline ? `<p>Leave Chrome open. We’ll start your sync as soon as it reconnects.</p><div class="button-row"><button class="primary" id="check-extension">Check connection</button><button class="text-button" id="reinstall-extension">Reinstall extension</button></div><p class="fine-print">If the extension is disabled, enable it at <code>chrome://extensions</code>. If you recently reloaded it, refresh the library in Chrome.</p>` : `<p>Click below to open setup in Chrome, then click <b>${chromeBookmarks ? 'Allow Chrome bookmarks' : 'Enable background sync'}</b>${targets.length > 1 && chromeBookmarks ? ' and enable background sync for your social saves' : ''}. Your sync starts automatically after you approve access.</p><button class="primary" id="open-extension-setup">Open setup in Chrome</button><p class="fine-print">If setup doesn’t open, click the saveXtension extension icon in Chrome and choose ${chromeBookmarks ? 'Settings → Allow Chrome bookmarks' : 'Enable background sync'}.</p>`}<p class="setup-status" id="setup-status" role="status">${missing ? 'Waiting for installation. Your sync will start automatically when ready.' : offline ? 'Waiting for Chrome…' : 'Waiting for permission…'}</p></div>`);
  modal.dataset.syncSetup = mode; state.pendingTargets = targets; state.pendingMode = syncMode;
  if (missing && download && sessionStorage.getItem('savex-extension-downloaded') !== 'true') downloadExtension();
  if ($('#copy-extensions')) $('#copy-extensions').onclick = async () => { try { await navigator.clipboard.writeText('chrome://extensions'); $('#copy-extensions').textContent = 'Copied'; } catch { $('#setup-status').textContent = 'Enter chrome://extensions in Chrome’s address bar.'; } };
  if ($('#check-extension')) $('#check-extension').onclick = checkSetup;
  if ($('#reinstall-extension')) $('#reinstall-extension').onclick = () => { setupDialog('missing', targets, false, syncMode); downloadExtension(); };
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
  styleSelects(app); if (modal.dataset.syncOptions) styleSelects(modal);
  const options = $('[data-action="sync-options"]'); if (options) options.disabled = !!busy || state.syncChecking;
  const timestamp = lastSyncTime(state.sync, state.runs), age = syncAge(timestamp);
  document.querySelectorAll('[data-action="sync"],[data-action="deep-sync"]').forEach(button => {
    button.disabled = !!busy || state.syncChecking || !sourceTargets().length;
    button.setAttribute('aria-busy', String(!!busy || state.syncChecking));
    if (button.dataset.action === 'deep-sync') { button.hidden = !sourceTargets().some(target => target !== 'chrome'); $('#deep-scan-control').hidden = button.hidden; return; }
    button.title = timestamp ? `Last synced ${new Date(timestamp).toLocaleString()} · Click to sync` : 'Sync your saves';
  });
  const label = $('#last-sync-label');
  if (label) label.textContent = state.syncChecking ? 'Checking…' : busy ? job.status === 'queued' ? 'Sync queued…' : job.mode === 'deep' ? 'Deep scanning…' : 'Syncing…' : age ? `Synced ${age}` : 'Sync saves';
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
  }
  renderSyncToast(job, busy, message);
}
function dismissSyncToast(id = state.sync?.job?.id) {
  if (id) {
    dismissedSyncJobs.add(id);
    try { sessionStorage.setItem('savex-dismissed-sync-jobs', JSON.stringify([...dismissedSyncJobs].slice(-40))); } catch { /* Dismissal still lasts until reload. */ }
  }
  clearTimeout(syncToastTimer);
  const el = $('#sync-status'); el.hidden = true; el.replaceChildren(); delete el.dataset.content;
}
function renderSyncToast(job, busy, message) {
  const el = $('#sync-status'), checking = state.syncChecking;
  if (job?.status === 'completed' && previousSyncJob?.id === job.id && ['queued', 'running'].includes(previousSyncJob.status)) completedToastJob = job.id;
  previousSyncJob = job && { id: job.id, status: job.status };
  const key = checking ? 'checking' : job ? `${job.id}:${job.status}` : '';
  const changed = key !== syncToastKey;
  if (changed) { clearTimeout(syncToastTimer); syncToastKey = key; }
  const finished = ['failed', 'partial', 'completed'].includes(job?.status);
  const visible = checking || job && !dismissedSyncJobs.has(job.id) && (busy || ['failed', 'partial'].includes(job.status) || job.status === 'completed' && completedToastJob === job.id);
  el.hidden = !visible;
  if (!visible) { el.replaceChildren(); delete el.dataset.content; return; }
  if (changed && finished && !checking) syncToastTimer = setTimeout(() => dismissSyncToast(job.id), 8000);
  const targets = checking ? ['chrome'] : job?.targets || [];
  const active = /instagram/i.test(message) ? 'instagram' : /\bX\b|twitter/i.test(message) ? 'x' : /chrome/i.test(message) ? 'chrome' : targets.length === 1 ? targets[0] : '';
  const sources = active ? [active] : targets;
  const sourceName = active ? platformName(active) : 'saves';
  const title = checking ? 'Connecting to Chrome' : job.status === 'queued' ? 'Sync queued' : busy ? `${job.mode === 'deep' ? 'Deep scanning' : 'Syncing'} ${sourceName}` : job.status === 'failed' ? 'Sync needs attention' : job.status === 'partial' ? 'Sync finished with a few issues' : 'Sync complete';
  if (/No tab with id/i.test(message)) message = `The background ${active ? platformName(active) : 'browser'} tab closed before syncing finished. Your saves are kept. Try syncing again.`;
  el.dataset.tone = checking || busy ? 'active' : job.status === 'completed' ? 'success' : 'warning';
  const content = `<div class="sync-toast-sources" aria-hidden="true">${sources.map(sourceIcon).join('')}</div><div class="sync-toast-content"><div class="sync-toast-heading"><strong>${esc(title)}</strong>${busy ? '<button class="text-button" data-action="stop-sync">Stop</button>' : ''}${job && !checking ? `<button class="icon-button" data-action="dismiss-sync" aria-label="Dismiss sync status">${icon('close')}</button>` : ''}</div><p>${esc(message)}</p></div>`;
  if (el.dataset.content !== content) {
    const focusedAction = el.contains(document.activeElement) ? document.activeElement.dataset.action : null;
    el.innerHTML = content; el.dataset.content = content;
    if (focusedAction) el.querySelector(`[data-action="${focusedAction}"]`)?.focus({ preventScroll: true });
  }
}
async function queueSync(targets, mode = 'quick') {
  const { job } = await api('/sync', { method: 'POST', body: { targets, xAccount: selectedSyncRequest().xAccount, mode } });
  state.sync = { ...state.sync, job }; renderSync(); wakeExtension();
}
let statusLoading = false;
async function syncStatus() {
  if (!state.localMode || statusLoading) return;
  statusLoading = true;
  try {
    state.sync = await api('/sync'); renderSync();
    if (state.pendingTargets && modal.open && modal.dataset.syncSetup && !state.syncChecking) {
      const availability = currentAvailability(), targets = state.pendingTargets, mode = state.pendingMode;
      if (availability === 'ready') {
        state.pendingTargets = null; modal.close(); await queueSync(targets, mode);
      } else if (availability === 'permissions' && modal.dataset.syncSetup !== 'permissions') setupDialog('permissions', targets, false, mode);
    }
  } catch { /* The reconnect screen handles server downtime. */ }
  finally { statusLoading = false; }
}
function wakeExtension() { window.postMessage({ source: 'savex-library', type: 'WAKE_SYNC' }, location.origin); }
async function startSync(mode = 'quick') {
  if (state.syncChecking || !sourceTargets().length) return;
  const fromOptions = modal.open && modal.dataset.syncOptions === 'true';
  if (state.demo) { state.demo = false; render(); }
  state.syncChecking = true; renderSync();
  try {
    const targets = sourceTargets();
    // Probe the current browser, then fall back to Chrome's server-side heartbeat.
    await bridgeRequest();
    state.sync = await api('/sync');
    if (fromOptions && (!modal.open || modal.dataset.syncOptions !== 'true')) return;
    const availability = currentAvailability();
    if (availability === 'ready') { await queueSync(targets, mode); if (fromOptions && modal.dataset.syncOptions) modal.close(); }
    else setupDialog(availability, targets, availability === 'missing', mode);
  } finally { state.syncChecking = false; renderSync(); }
}
async function details(id) {
  const p = allPosts().find(p => p.id === Number(id)); if (!p) return;
  showModal(`<div class="detail-source">${icon(p.platform)} ${platformName(p.platform)} <span title="${esc(p.accounts.join(', '))}">${relative(p.savedAt)}</span></div><section class="detail-edit"><div class="note-heading"><label for="note">Note</label><span id="note-status" class="note-status" role="status" aria-live="polite"></span></div><textarea id="note" name="notes" rows="4" maxlength="10000" ${state.demo ? 'readonly' : ''}>${esc(notes.value(p))}</textarea></section>${nativePreview(p, true)}<a class="secondary" href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">Open original ${icon('arrow')}</a><div class="detail-actions"><button class="text-button danger" id="delete-post">${icon('trash')} Delete</button><button class="secondary" data-archive="${p.id}" aria-label="${p.archived ? 'Restore save' : 'Archive save'}">${icon(p.archived ? 'restore' : 'archive')} ${p.archived ? 'Restore to saves' : 'Archive'}</button></div>`);
  modal.dataset.postId = String(p.id);
  activeNote = state.demo ? null : p;
  mountEmbeds(modal, true);
  const field = $('#note');
  field.oninput = () => {
    if (state.demo) return;
    notes.edit(p, field.value);
    state.posts = notes.overlay(state.posts);
  };
  field.onblur = () => { if (!state.demo) void notes.flush(p); };
  if (!state.demo) void notes.flush(p);
  field.focus();
  $('#delete-post').onclick = async () => {
    if (state.demo) return toast('Sample saves can’t be deleted.');
    if (!confirm('Delete this save and its notes? This cannot be undone.')) return;
    try { await notes.flush(p); await api(`/posts/${p.id}`, { method: 'DELETE' }); notes.forget(p); modal.close(); await refresh(); toast('Save deleted.'); } catch (e) { toast(e.message, true); }
  };
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
async function settingsDialog() {
  if (state.localMode) {
    showModal(`<h2>Settings</h2><form id="library-form"><label>Library name<input name="name" value="${esc(state.name)}" maxlength="50" placeholder="My saves"></label><button class="primary" type="submit">Save name</button></form><h3 class="section-gap">Backup</h3><div class="button-row"><a class="secondary" href="/api/export" download>${icon('download')} Export library</a><button class="secondary" data-action="import">${icon('plus')} Import a file</button></div><details class="settings-history"><summary>Sync history</summary><div class="sync-history">${state.runs.length ? state.runs.slice(0, 8).map(r => `<div><span class="run-icon">${icon(r.platform)}</span><span><strong>${platformName(r.platform)}${r.account ? ` · ${esc(r.account)}` : ''}</strong><small>${r.imported} new · ${r.updated} revisited · ${esc(r.status)}${r.message ? `<br>${esc(r.message)}` : ''}</small></span><time>${relative(r.startedAt)}</time></div>`).join('') : '<p>Your first sync will appear here.</p>'}</div></details>`);
    $('#library-form').onsubmit = async e => { e.preventDefault(); try { const result = await api('/library', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); state.name = result.name; modal.close(); render(); toast('Library name saved.'); } catch (error) { toast(error.message, true); } };
    return;
  }
  showModal('<h2>Settings</h2><p>Loading settings…</p>');
  try {
    const { devices } = await api('/devices');
    if (!modal.open) return;
    showModal(`<span class="dialog-kicker">Make it yours</span><h2>Settings</h2><h3>Connected browsers</h3><div class="device-list">${devices.length ? devices.map(d => `<div class="device"><span>${icon('shield')}</span><div><strong>${esc(d.name)}</strong><small>${d.lastSeen ? `Last used ${relative(d.lastSeen).toLowerCase()}` : 'Paired, ready to sync'}</small></div><button class="text-button danger" data-revoke="${d.id}">Disconnect</button></div>`).join('') : '<p class="muted">No browsers paired yet.</p>'}</div><button class="secondary" data-action="connect">${icon('plus')} Pair a browser</button><h3 class="section-gap">Your data, always yours.</h3><p>Back up your saves, notes and tags as JSON. Import that file to restore a new library.</p><div class="button-row"><a class="secondary" href="/api/export" download>${icon('download')} Export library</a><button class="secondary" data-action="import">${icon('plus')} Import a file</button></div><details class="settings-history"><summary>Sync history</summary><div class="sync-history">${state.runs.length ? state.runs.slice(0, 8).map(r => `<div><span class="run-icon">${icon(r.platform)}</span><span><strong>${platformName(r.platform)}${r.account ? ` · ${esc(r.account)}` : ''}</strong><small>${r.imported} new · ${r.updated} revisited · ${esc(r.status)}${r.message ? `<br>${esc(r.message)}` : ''}</small></span><time>${relative(r.startedAt)}</time></div>`).join('') : '<p class="muted">Your first sync will appear here.</p>'}</div></details><div class="notice">Topic suggestions use simple local keyword matching. No posts are sent to an AI service. Thumbnails load from the original platform and may expire; your captured text and notes stay saved.</div><button class="text-button" data-action="logout">${icon('logout')} Sign out of this browser</button>`);
  } catch (e) { toast(e.message, true); modal.close(); }
}
function importDialog() {
  showModal(`<h2>Import saves</h2><p>Import a saveXtension backup, extracted Instagram/X export file, or plain list of post URLs.</p><form id="import-form"><label class="file-drop">${icon('file')}<strong>Choose a JSON, HTML, JS, or TXT file</strong><span>Extract downloaded ZIP archives first. Maximum 20 MB.</span><input type="file" id="import-file" accept=".json,.html,.htm,.txt,.js" required></label><label>Source account <span class="optional">optional</span><input name="sourceAccount" placeholder="e.g. @my-personal-account" maxlength="100"></label><p class="form-error" id="import-error" role="alert"></p><button class="primary full">Import supported post links ${icon('arrow')}</button><p id="import-progress" role="status"></p></form><p class="fine-print">Exports vary: some include only links, and some omit saves entirely. We’ll tell you how many supported posts we find. JavaScript export files are read as data, never executed.</p>`);
  $('#import-form').onsubmit = async e => {
    e.preventDefault(); const button = $('button', e.target); button.disabled = true;
    try {
      const file = $('#import-file').files[0]; if (file.size > 20 * 1024 * 1024) throw new Error('Choose a file smaller than 20 MB.');
      const posts = parseImport(await file.text(), file.name);
      if (!posts.length) throw new Error('No supported Instagram or X post links were found in this file.');
      const account = new FormData(e.target).get('sourceAccount');
      let imported = 0, updated = 0, rejected = 0;
      for (let i = 0; i < posts.length; i += 100) {
        $('#import-progress').textContent = `Importing ${Math.min(i + 100, posts.length)} of ${posts.length}…`;
        const result = await api('/posts/import', { method: 'POST', body: { posts: posts.slice(i, i + 100).map(p => ({ ...p, sourceAccount: account || p.sourceAccount })) } });
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

document.addEventListener('click', async e => {
  const button = e.target.closest('[data-filter],[data-nav-account],[data-instagram-collection],[data-topic],[data-action],[data-open],[data-archive],[data-remove-filter],[data-revoke]'); if (!button) return;
  try {
    if (button.dataset.filter) { if (state.archive) { state.archive = false; state.filters = defaultFilters(); state.query = ''; $('#search').value = ''; } state.filters.sources = button.dataset.filter === 'all' ? [] : [button.dataset.filter]; state.filters.folder = ''; state.filters.collection = ''; state.filters.collectionName = ''; state.filters.accounts = []; updateCollection(); renderSync(); }
    else if (button.dataset.navAccount) {
      if (state.archive) { state.archive = false; state.filters = defaultFilters(); state.query = ''; $('#search').value = ''; }
      const value = button.dataset.navAccount;
      state.filters.sources = [value.split(':')[0]]; state.filters.accounts = [value]; state.filters.folder = ''; state.filters.collection = ''; state.filters.collectionName = '';
      updateCollection();
    }
    else if (button.dataset.instagramCollection) {
      const collection = (state.instagramCollections || []).find(c => String(c.id) === button.dataset.instagramCollection);
      if (!collection) return;
      state.archive = false; state.filters = { ...defaultFilters(), sources: ['instagram'], accounts: [`instagram:${collection.account.toLowerCase()}`], collection: String(collection.id), collectionName: collection.name };
      state.query = ''; $('#search').value = ''; updateCollection();
    }
    else if (button.dataset.topic) { const t = button.dataset.topic; state.filters.topics = state.filters.topics.includes(t) ? state.filters.topics.filter(v => v !== t) : [...state.filters.topics, t]; renderResults(); }
    else if (button.dataset.removeFilter) { const key = button.dataset.removeFilter; if (key.startsWith('account:')) { state.filters.accounts = state.filters.accounts.filter(value => value !== key.slice(8)); state.filters.sources = [...new Set(state.filters.accounts.map(value => value.split(':')[0]))]; if (!state.filters.sources.includes('chrome')) state.filters.folder = ''; } else if (key === 'date') { state.filters.date = 'any'; state.filters.start = 'all'; state.filters.end = 'now'; state.filters.from = ''; state.filters.to = ''; } else { state.filters[key] = defaultFilters()[key]; if (key === 'collection') state.filters.collectionName = ''; if (key === 'sources') state.filters.folder = ''; } renderResults(); }
    else if (button.dataset.archive) await toggleArchive(button.dataset.archive);
    else if (button.dataset.open) await details(button.dataset.open);
    else if (button.dataset.revoke) { if (confirm('Disconnect this browser? Its next sync will require pairing again.')) { await api(`/devices/${button.dataset.revoke}`, { method: 'DELETE' }); await settingsDialog(); } }
    else switch (button.dataset.action) {
      case 'sync-options': syncOptionsDialog(); break;
      case 'sync': await startSync(); break;
      case 'deep-sync': await startSync('deep'); break;
      case 'archive-view': state.archive = true; state.filters = defaultFilters(); state.query = ''; $('#search').value = ''; updateCollection(); break;
      case 'filters': filterDialog(); break;
      case 'reset-filters': state.filters = defaultFilters(); renderResults(); break;
      case 'dismiss-sync': dismissSyncToast(); break;
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
  const modifier = macKeyboard ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
  if (e.key.toLowerCase() !== 'f' || !modifier || e.altKey || e.shiftKey || e.isComposing) return;
  const search = $('#search'); if (!search) return;
  e.preventDefault();
  closeSelect();
  if (modal.open) { flushActiveNote(); modal.close(); }
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
boot();
