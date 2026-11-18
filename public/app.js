import { unsaveDialog } from './unsave.js';
import { BUSY, busyNotice } from './busy-messages.js';
import { orderLibraryPosts, showsSiteList } from './source-order.js';
import { createMeaningSearch } from './meaning-search.js';
import { organizeTopics } from './organize.js';
import { dotLoader } from './dot-loader.js';
import { openCollectionPicker, closeCollectionPicker } from './collection-picker.js';
import { enablePostDrag } from './post-drag.js';
import { instagramSaveList, visibleInstagramSaves } from './instagram-save-lists.js';
import { openAccountMenu, closeAccountMenu } from './account-menu.js';
import { syncAvailability, lastSyncTime, syncAge } from './sync-state.js';
import { syncReport, syncRetryRequest } from './sync-report.js';
import { mountSocialAccounts } from './social-accounts.js';
import { syncAccountOptions, legacySyncSelection, syncSelectionRequest } from './sync-selection.js';
import { sidebarAccounts } from './sidebar-accounts.js';
import { embedTarget } from './embed-target.js';
import { mountEmbeds, disposeEmbeds, configureEmbeds, retryEmbed } from './embeds.js';
import { layoutCards, disposeCardLayout, setCardView, pauseReadingHold } from './masonry.js';
import { PRELOAD_SCREENS } from './preview-policy.js';
import { mountWebsitePreviews } from './website-previews.js';
import { createNoteAutosave } from './notes.js';
import { syncNoteLinks } from './note-links.js';
import { animateEmbedStage, setNoteVisibility, finishNoteAnimation, glideSize, noteHeightSeen, glideNote, shineNote } from './motion.js';
import { addedTimeGroup, addedTimeKey, addedToday, libraryAddedAt } from './saved-time.js';
import { applyFilters, defaultFilters, dateBounds, filterChips, accountOptions } from './filters.js';
import { mountDateRange } from './date-range.js';
import { enhanceSelects, closeSelect } from './select.js';
import { mountMcpSettings } from './mcp-settings.js';
import { topicTree, topicScope, canNest, enableTopicDrag } from './topic-tree.js';
import { isPinterestHost, PINTEREST_PIN } from './pinterest-host.js';
import { mountDocuments } from './documents.js';
import { createAiActivity } from './ai-activity.js';
import { enableActionTips } from './action-tips.js';
enableActionTips();
import { documentSections, searchDocuments, sectionKey, wordPattern } from './document-search.js';
const isPinterestPin = value => { try { const url = new URL(value); return isPinterestHost(url.hostname) && PINTEREST_PIN.test(url.pathname); } catch { return false; } };
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
  up: '<path d="M12 19V5M5.5 11.5 12 5l6.5 6.5"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  'double-tick': '<path d="m2.5 12.5 4.5 4.5L15 8M10.5 15l2 2L21.5 8"/>',
  sparkle: '<path d="M12 3.5 13.9 9l5.6 2-5.6 2-1.9 5.5-1.9-5.5-5.6-2 5.6-2zM19 3v3.5M17.2 4.8h3.6"/>',
  trash: '<path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13M10 11v5.5M14 11v5.5"/>',
  warning: '<path d="M10.3 4.3 2.9 17.2A2 2 0 0 0 4.6 20h14.8a2 2 0 0 0 1.7-2.8L13.7 4.3a2 2 0 0 0-3.4 0ZM12 9.5v4M12 16.8h.01"/>',
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
  puzzle: '<path d="M15.39 4.39a1 1 0 0 0 1.68-.474 2.5 2.5 0 1 1 3.014 3.015 1 1 0 0 0-.474 1.68l1.683 1.682a2.414 2.414 0 0 1 0 3.414L19.61 15.39a1 1 0 0 1-1.68-.474 2.5 2.5 0 1 0-3.014 3.015 1 1 0 0 1 .474 1.68l-1.683 1.682a2.414 2.414 0 0 1-3.414 0L8.61 19.61a1 1 0 0 0-1.68.474 2.5 2.5 0 1 1-3.014-3.015 1 1 0 0 0 .474-1.68l-1.683-1.682a2.414 2.414 0 0 1 0-3.414L4.39 8.61a1 1 0 0 1 1.68.474 2.5 2.5 0 1 0 3.014-3.015 1 1 0 0 1-.474-1.68l1.683-1.682a2.414 2.414 0 0 1 3.414 0z"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  plug: '<path d="M12 22v-5"/><path d="M9 8V2"/><path d="M15 8V2"/><path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z"/>',
  package: '<path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z"/><path d="M12 22V12"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="m7.5 4.27 9 5.15"/>',
  database: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="1"/><path d="m3 17 6-6 4 4 3-3 5 5"/>'
};
const icon = (name, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.bookmark}</svg>`;
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const platformName = p => p === 'x' ? 'X' : p === 'chrome' ? 'Chrome bookmarks' : p === 'pinterest' ? 'Pinterest' : p === 'threads' ? 'Threads' : 'Instagram';
const macKeyboard = /Mac|iPhone|iPad|iPod/i.test(navigator.userAgentData?.platform || navigator.platform || '');
const searchKeys = macKeyboard ? '⌘ F' : 'Ctrl F';
let sourceMarkId = 0;
function sourceIcon(source) {
  const mark = `instagram-mark-${++sourceMarkId}`;
  const svg = content => `<svg class="source-icon source-icon-${source}" viewBox="0 0 24 24" aria-hidden="true">${content}</svg>`;
  if (source === 'instagram') return svg(`<defs><linearGradient id="${mark}" x1="0" y1="1" x2="1" y2="0"><stop stop-color="#fbb04b"/><stop offset=".45" stop-color="#ed386b"/><stop offset="1" stop-color="#9b42ba"/></linearGradient></defs><rect x="1" y="1" width="22" height="22" rx="6" fill="url(#${mark})"/><rect x="5.5" y="5.5" width="13" height="13" rx="4" fill="none" stroke="#fff" stroke-width="1.7"/><circle cx="12" cy="12" r="3.2" fill="none" stroke="#fff" stroke-width="1.7"/><circle cx="16.4" cy="7.7" r="1" fill="#fff"/>`);
  if (source === 'pinterest') return svg('<path fill="#e60023" d="M12.017 0C5.396 0 .029 5.367.029 11.987c0 5.079 3.158 9.417 7.618 11.162-.105-.949-.199-2.403.041-3.439.219-.937 1.406-5.957 1.406-5.957s-.359-.72-.359-1.781c0-1.663.967-2.911 2.168-2.911 1.024 0 1.518.769 1.518 1.688 0 1.029-.653 2.567-.992 3.992-.285 1.193.6 2.165 1.775 2.165 2.128 0 3.768-2.245 3.768-5.487 0-2.861-2.063-4.869-5.008-4.869-3.41 0-5.409 2.562-5.409 5.199 0 1.033.394 2.143.889 2.741.099.12.112.225.085.345-.09.375-.293 1.199-.334 1.363-.053.225-.172.271-.401.165-1.495-.69-2.433-2.878-2.433-4.646 0-3.776 2.748-7.252 7.92-7.252 4.158 0 7.392 2.967 7.392 6.923 0 4.135-2.607 7.462-6.233 7.462-1.214 0-2.354-.629-2.758-1.379l-.749 2.848c-.269 1.045-1.004 2.352-1.498 3.146 1.123.345 2.306.535 3.55.535 6.607 0 11.985-5.365 11.985-11.987C23.97 5.39 18.592.026 11.985.026L12.017 0z"/>');
  // An @ drawn in one stroke, in the ink colour like X's mark.
  if (source === 'threads') return svg('<path fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" d="M15.6 12.4c0 2.6-1.3 4.1-3.3 4.1-1.8 0-3-1.4-3-3.4 0-2.1 1.3-3.6 3.2-3.6 1.5 0 2.6.8 3.1 2.1M15.6 8.6v4.6c0 1.7.9 2.7 2.2 2.7 1.8 0 2.9-1.8 2.9-4.3A8.7 8.7 0 1 0 12 20.4c1.9 0 3.4-.4 4.8-1.2"/>');
  if (source === 'x') return svg('<path fill="currentColor" d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.64 7.584H.47l8.6-9.835L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z"/>');
  if (source === 'chrome') return svg('<path fill="#ea4335" d="M12 1a11 11 0 0 1 9.526 5.5H12a5.5 5.5 0 0 0-4.763 8.25L2.474 6.5A11 11 0 0 1 12 1Z"/><path fill="#fbbc05" d="M21.526 6.5A11 11 0 0 1 12 23l4.763-8.25A5.5 5.5 0 0 0 12 6.5Z"/><path fill="#34a853" d="M12 23A11 11 0 0 1 2.474 6.5l4.763 8.25a5.5 5.5 0 0 0 9.526 0Z"/><circle cx="12" cy="12" r="4.6" fill="#4285f4" stroke="#fff" stroke-width=".9"/>');
  return icon('grid');
}
const selectedSyncAccounts = () => state.syncAccounts ?? legacySyncSelection(state.source, state.xAccount, state.sync?.xAccounts);
const selectedSyncRequest = () => syncSelectionRequest(selectedSyncAccounts(), state.sync?.xAccounts);
const sourceTargets = () => selectedSyncRequest().targets;
const styleSelects = (root = document) => enhanceSelects(root);
// Days are counted by the calendar, except that the last 6 hours always count as today, the same rule as the New tag
// (user's decision, 2026-11-18).
const calendarDays = date => { if (addedToday(date)) return 0; const day = value => { const at = new Date(value); at.setHours(12, 0, 0, 0); return +at; }; return Math.round((day(Date.now()) - day(date)) / 86400000); };
const relative = date => {
  const days = calendarDays(date);
  return days === 0 ? 'Today' : days === 1 ? 'Yesterday' : days < 7 ? `${days} days ago` : new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};
// When a post entered saveXtension, said shortly beside its name: today, yesterday, days ago, then the date.
const addedWhen = date => {
  const then = new Date(date), days = calendarDays(date);
  if (days <= 0) return 'Added today';
  if (days === 1) return 'Added yesterday';
  if (days < 7) return `Added ${days} days ago`;
  return `Added ${then.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: then.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' })}`;
};
const collapsedInstagramAccounts = new Set();
// Unsave replaced archiving in everyday use. The archive view and its controls
// stay in the code, hidden; the 'savex-show-archive' setting brings them back
// (the browser tests use it to keep archiving covered).
let SHOW_ARCHIVE = false;
try { SHOW_ARCHIVE = localStorage.getItem('savex-show-archive') === 'true'; } catch { /* Archive stays hidden. */ }
// Trying cards with saved details only. Setting this keeps the earlier live posts inside cards.
let LIVE_CARD_PREVIEWS = false;
try { LIVE_CARD_PREVIEWS = localStorage.getItem('savex-live-previews') === 'true'; } catch { /* Cards keep saved details. */ }
const collapsedTopics = new Set();
try { const saved = JSON.parse(localStorage.getItem('savex-collapsed-topics')); if (Array.isArray(saved)) for (const id of saved) if (typeof id === 'string') collapsedTopics.add(id); } catch { /* Start with subfolders expanded. */ }
try { const saved = JSON.parse(localStorage.getItem('savex-collapsed-instagram')); if (Array.isArray(saved)) for (const account of saved) if (typeof account === 'string') collapsedInstagramAccounts.add(account); } catch { /* Start with collections expanded. */ }
let storedSyncAccounts = null;
try { const saved = JSON.parse(localStorage.getItem('savex-sync-accounts')); if (Array.isArray(saved) && saved.every(value => /^(x:(current|@[a-z0-9_]{1,30})|instagram:current|pinterest:current|threads:current|chrome:\*)$/.test(value))) storedSyncAccounts = [...new Set(saved)]; } catch { /* Migrate previous source choices. */ }
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
function hideToast() {
  const el = $('#toast');
  clearTimeout(toastTimer);
  if (el.matches(':popover-open')) el.hidePopover();
  el.removeAttribute('popover'); el.className = ''; if (el.parentElement !== toastHome) toastHome.append(el);
}
function toast(message, error = false, position = '', detail = '') {
  // A refusal says why, stays long enough to read, and shows above any open dialog.
  const notice = error ? busyNotice(message) : null;
  if (notice) { message = notice.title; detail = notice.why; position = 'bottom-center'; }
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
  if (notice && ['queued', 'running'].includes(state.sync?.job?.status)) {
    const stop = document.createElement('button');
    stop.className = 'toast-action'; stop.dataset.action = 'stop-sync'; stop.textContent = 'Stop scan'; el.append(stop);
  }
  // Centered feedback must remain visible above a modal's top layer.
  if (position === 'bottom-center' && el.showPopover) { el.setAttribute('popover', 'manual'); el.showPopover(); }
  clearTimeout(toastTimer); toastTimer = setTimeout(hideToast, notice ? 9000 : 4200);
}
function toastWithActions(message, actions = [], { detail = '', duration = 8000 } = {}) {
  const el = $('#toast');
  if (el.matches(':popover-open')) el.hidePopover();
  el.removeAttribute('popover');
  const host = modal.open ? modal : toastHome;
  if (el.parentElement !== host) host.append(el);
  el.textContent = message;
  el.className = `visible bottom-center ${detail || actions.length ? 'with-detail' : ''}`;
  if (detail) {
    const description = document.createElement('span');
    description.className = 'toast-detail'; description.textContent = detail; el.append(description);
  }
  if (actions.length) {
    const row = document.createElement('div');
    row.className = 'toast-actions';
    for (const item of actions) {
      const btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'toast-action'; btn.textContent = item.label;
      btn.onclick = () => item.onClick(btn);
      row.append(btn);
    }
    el.append(row);
  }
  if (el.showPopover) { el.setAttribute('popover', 'manual'); el.showPopover(); }
  clearTimeout(toastTimer); toastTimer = setTimeout(hideToast, duration);
}
async function api(path, { method = 'GET', body, keepalive = false } = {}) {
  const res = await fetch(`/api${path}`, { method, credentials: 'same-origin', keepalive, headers: body === undefined ? {} : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const result = await res.json();
  if (!res.ok) { if (res.status === 401 && !['/login', '/setup'].includes(path)) boot(); throw new Error(result.error || 'Request failed.'); }
  return result;
}
let activeNote = null, activeNoteScope = null, documentUi = null;
const openNoteIds = new Set(), noteStates = new Map();
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
    syncNoteViewStatus(post, status);
  }
});
function flushActiveNote() { if (activeNote) { void notes.flush(activeNote); activeNote = null; activeNoteScope = null; } }
function closeModal() {
  if (!modal.open || modal.dataset.closing) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { modal.close(); return; }
  modal.dataset.closing = 'true';
  modal.classList.add('is-closing');
  // Whichever comes first, the animation's end or the timer, finishes the close and cancels the other, so a
  // dialog opened straight after isn't closed by this one's leftover listener.
  const finish = () => {
    cancelModalClose();
    delete modal.dataset.closing;
    modal.classList.remove('is-closing');
    if (modal.open) modal.close();
  };
  const onEnd = event => { if (event.target === modal) finish(); };
  const timer = setTimeout(finish, 200);
  modal.addEventListener('animationend', onEnd);
  cancelModalClose = () => { clearTimeout(timer); modal.removeEventListener('animationend', onEnd); cancelModalClose = () => {}; };
}
let cancelModalClose = () => {};
function showModal(content, wide = false) {
  cancelModalClose();
  delete modal.dataset.closing;
  modal.classList.remove('is-closing');
  restoreModalToast();
  clearInterval(updatePoll);
  closeSelect(); closeAccountMenu(); closeCollectionPicker();
  flushActiveNote();
  disposeEmbeds(modal);
  state.pendingTargets = null; state.pendingSyncRequest = null; delete modal.dataset.syncSetup; delete modal.dataset.postId; delete modal.dataset.syncOptions; delete modal.dataset.sendDocument;
  document.querySelectorAll('[data-action="sync-options"]').forEach(button => button.setAttribute('aria-expanded', 'false'));
  modal.innerHTML = `<button class="icon-button modal-close" aria-label="Close dialog">${icon('close')}</button>${content}`;
  modal.className = wide ? 'wide' : ''; if (!modal.open) modal.showModal();
  $('.modal-close', modal).onclick = () => closeModal();
}
// Dialogs glide to fit new content. The enlarged post has its own entrance and resizing embeds.
glideSize(modal, { enabled: () => modal.open && !modal.dataset.stacking && !modal.dataset.settling && !modal.dataset.closing });
modal.addEventListener('cancel', e => { if (modal.querySelector('.organize-dialog')) return; e.preventDefault(); closeModal(); });
modal.addEventListener('click', e => { if (e.target === modal) { const b = modal.getBoundingClientRect(); if (e.clientX < b.left || e.clientX > b.right || e.clientY < b.top || e.clientY > b.bottom) closeModal(); } });
modal.addEventListener('close', () => { restoreModalToast(); closeSelect(); $('#open-filters')?.setAttribute('aria-expanded', 'false'); document.querySelectorAll('[data-action="sync-options"]').forEach(button => button.setAttribute('aria-expanded', 'false')); flushActiveNote(); disposeEmbeds(modal); state.pendingTargets = null; state.pendingSyncRequest = null; delete modal.dataset.syncSetup; delete modal.dataset.postId; delete modal.dataset.syncOptions; delete modal.dataset.sendDocument; });

modal.addEventListener('close', () => { clearInterval(updatePoll); aiActivity.flushAnnouncements(); });

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
// The local model is part of the app, but its files aren't in the installer. They arrive on first launch, and the app opens once they have.
function installMiniLM() {
  return new Promise(resolve => {
    const paint = (title, detail, status) => {
      app.innerHTML = `<main class="first-launch"><div class="ai-progress-card">${dotLoader('download', 'large')}<div class="ai-progress-text"><p class="ai-progress">${esc(title)}</p>${status ? `<progress class="meaning-progress" max="${status.total}" value="${status.done}" aria-label="Download progress"></progress>` : ''}<p>${esc(detail)}</p>${status ? '' : '<button class="secondary" type="button" id="retry-minilm">Try again</button>'}</div></div></main>`;
      const retry = $('#retry-minilm'); if (retry) retry.onclick = () => void check(true);
    };
    const check = async start => {
      try {
        const status = start ? await api('/meaning', { method: 'POST', body: {} }) : await api('/meaning');
        if (!status.available || status.state === 'ready') return resolve(true);
        if (status.state === 'failed') return paint('Couldn’t finish setting up search', 'Check your internet connection and try again.');
        if (status.state === 'absent') return void check(true);
        paint('Setting up search', `${Math.round(status.done / 1000000)} of ${Math.round(status.total / 1000000)} MB. This only happens once.`, status);
        setTimeout(() => void check(false), 500);
      } catch { paint('Couldn’t finish setting up search', 'Check your internet connection and try again.'); }
    };
    void check(false);
  });
}
async function boot() {
  try {
    const session = await api('/session'); state.localMode = session.localMode; configureEmbeds(session.embedOrigin);
    if (!session.authenticated) return authScreen(session.setupRequired);
    if (!(await installMiniLM())) return;
    void loadAiSearch();
    const data = await api('/posts?scope=all'); state.posts = notes.overlay(data.posts); state.runs = data.runs; state.topicCatalog = data.topics || []; state.instagramCollections = data.instagramCollections || []; state.instagramSaveLists = data.instagramSaveLists || {}; state.demo = false; render(); aiActivity.render(); documentUi = mountDocuments({ icon, esc, toast, onActivity: syncExternalActivity, onDialogClose: () => { aiActivity.flushAnnouncements(); loadSearchableDocuments(true); } }); void notes.resume(data.posts); if (state.localMode) await syncStatus();
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
// Search by meaning is optional: nothing runs until its download is on this computer, and results join word search's.
let meaningMatches = null, meaningList = null;
const meaningSearch = createMeaningSearch({ onResults(query, matches) {
  if (!aiLocalActive || query !== state.query.trim()) return;
  const before = meaningMatches?.query === query ? [...meaningMatches.matches.keys()].join() : '';
  meaningMatches = { query, matches };
  if (before !== [...matches.keys()].join()) renderResults();
} });
function syncMeaningSearch() {
  if (!meaningSearch.running || state.demo || !state.posts) return;
  loadSearchableDocuments();
  // Worked out again only when saves, their edits or the visible collections change.
  const list = allPosts(), latest = list.reduce((newest, post) => newest > (post.updatedAt || '') ? newest : post.updatedAt || '', ''), described = list.filter(post => post.imageDescription).length;
  const documents = searchableDocs || [], token = `${list.length}|${latest}|${described}|${JSON.stringify(state.instagramSaveLists)}|${documents.map(doc => `${doc.id}@${doc.updatedAt}`).join()}`;
  if (meaningList === token) return;
  // Each document section is read on its own, with the document's name and heading, so a match points at that part.
  const sections = documents.flatMap(doc => documentSections(doc.body).map(section => ({ id: sectionKey(doc.id, section.index), text: [doc.title, section.heading, section.text].filter(Boolean).join('\n') })));
  meaningList = token; meaningSearch.index(token, list, sections);
}
// For MCP: the desktop app asks this page to rank a search by meaning, since the local model runs here. The answer is only
// ids and scores, closest first, from what this page has indexed: the saves it shows and the document sections.
window.saveXMeaningRank = async query => {
  if (!aiLocalActive || !meaningSearch.running || state.demo || typeof query !== 'string' || !query.trim()) return null;
  syncMeaningSearch();
  const ranked = await meaningSearch.rank(query.trim());
  return ranked ? { complete: !!ranked.complete, ranking: ranked.ranking.filter(([, score]) => score >= AI_NUDGE_SCORE).slice(0, 60) } : null;
};
function stopMeaningSearch(forget = false) {
  const wasRunning = meaningSearch.running;
  meaningSearch.stop(); meaningMatches = null; meaningList = null;
  if (forget) try { indexedDB.deleteDatabase('savex-meaning-2'); } catch { /* Nothing was saved. */ }
  if (wasRunning) renderResults();
}
const AI_NUDGE_SCORE = .38, AI_NUDGE_LIMIT = 40;
// The optional AI tool. It runs only when someone presses Enter, because it's slower and uses their plan.
let aiTool = '', aiToolName = '', aiResults = { query: '', matches: new Map() }, aiJob = 0, aiBusy = false, aiToolModel = '', aiLocalActive = false, aiNames = [], aiNamesAt = 0, aiNamesTimer = 0;
// Applies the one AI that's switched on. The local model runs here, so it starts or stops with its switch.
async function loadAiSearch() {
  try {
    const { selected, name, model, vision, localReady } = await api('/ai-search');
    document.documentElement.toggleAttribute('data-ai-vision', !!vision);
    document.documentElement.toggleAttribute('data-ai-tool', !!selected);
    // Cards can be on screen already, so their buttons follow the model that's now in use.
    aiScanModel = vision?.model || '';
    document.querySelectorAll('.ai-scan-button:not([data-busy])').forEach(button => { button.setAttribute('aria-label', scanLabel()); $('.ai-scan-label', button).textContent = scanLabel(); });
    aiTool = selected; aiToolName = name; aiToolModel = model; aiLocalActive = !!localReady;
    // The local model is always on, so word search and meaning search are the free default.
    if (localReady) { meaningSearch.start(); syncMeaningSearch(); meaningSearch.search(state.query); }
    paintSearchHint();
    // What a note can run on. A small model is always the default, and choosing another lasts for that note's run.
    ({ models: noteAiModels } = selected ? await api('/note-ai/models') : { models: [] });
    noteAiChoice.clear();
    if (selected) void openOrganize.resume().catch(() => {});
    // A note the AI was filling carries on through a reload.
    // Notes the AI is filling, or that wait their turn, carry on through a reload. A finished one keeps its Undo.
    if (!noteAiJobs.size) {
      const { jobs = [] } = await api('/note-ai');
      for (const job of jobs) {
        if (noteAiBusyState(job)) { noteAiJobs.set(job.post, job); paintNoteAi(job.post); syncNoteAiActivity(job); }
        else if (job.state === 'done' || job.state === 'failed') {
          if (job.state === 'done' && !noteAiUndo.has(job.post)) { const post = allPosts().find(item => item.id === job.post), card = document.querySelector(`.save-card[data-post-id="${job.post}"]`); if (post && notes.value(post) === job.notes) { noteAiUndo.set(job.post, { before: job.before, after: job.notes, jobId: job.id }); if (card) showNoteAiUndo(card, post); } }
          syncNoteAiActivity(job);
        }
      }
      if (noteAiJobs.size) void followNoteAi();
    }
    if (!docAiJob) {
      const { job } = await api('/document-ai');
      if (job?.state === 'running') { docAiJob = job; paintDocAiButtons(); syncDocAiActivity(job); void followDocAi(); }
      else if (job && ['done', 'failed'].includes(job.state)) syncDocAiActivity(job);
    }
    noteAiOpen.forEach(paintNoteAi);
  } catch { /* Search carries on without it. */ }
}
// While an AI searches, a loader sits where its cards will appear: in the middle if nothing's there yet, otherwise below the cards.
function showAiStatus(running) {
  aiBusy = running; const loader = $('.ai-results-loader'); if (loader) loader.hidden = !running;
  clearInterval(aiNamesTimer); aiNames = []; aiNamesAt = 0;
  if (running) { paintAiProgress(); aiNamesTimer = setInterval(paintAiNames, 1200); }
  paintSearchHint(running);
}
// Only what's really happening: batches finished, posts picked, and accounts in the batches being read right now.
function paintAiProgress(job) {
  const reading = $('.ai-progress'), found = $('.ai-progress-found'); if (!reading || !found) return;
  const checking = job?.phase === 'images', settling = job?.phase === 'settling';
  reading.textContent = job?.state === 'asking' ? 'Waiting for your answer' : settling ? `Checking saved descriptions · ${job.settleDone} of ${job.settleTotal}` : checking ? `Scanning images · ${job.imagesDone} of ${job.imagesTotal}` : job?.total ? `Reading your saves · ${job.done} of ${job.total} ${job.total === 1 ? 'batch' : 'batches'}` : 'Reading your saves';
  const bar = $('.ai-progress-bar i'); if (bar) bar.style.width = `${Math.max(4, settling && job.settleTotal ? job.settleDone / job.settleTotal * 100 : checking && job.imagesTotal ? job.imagesDone / job.imagesTotal * 100 : job?.total ? job.done / job.total * 100 : 0)}%`;
  found.textContent = job?.matches?.length ? `${job.matches.length} found so far${checking ? ', more may appear' : ''}` : '';
  aiNames = job?.reading || aiNames; paintAiNames();
  if (job?.id) syncAiSearchActivity(job, aiResults.query);
}
function paintAiNames() {
  const names = $('.ai-progress-names'); if (!names) return;
  const shown = aiNames.length ? Array.from({ length: Math.min(3, aiNames.length) }, (_, index) => aiNames[(aiNamesAt + index) % aiNames.length]) : [];
  names.textContent = shown.map(name => `@${String(name).replace(/^@+/, '')}`).join(', '); aiNamesAt += 1;
}
// AI search is the person's call, because it's slower and uses their plan. This button under the search bar runs it and names the model.
function paintSearchHint(running = aiBusy) {
  const hint = $('.search-hint'); if (!hint) return;
  hint.hidden = !aiTool; hint.closest('.search').toggleAttribute('data-ai-running', !!running);
  if (!aiTool) return;
  const searched = !running && aiResults.query && aiResults.query === state.query.trim();
  hint.disabled = !!running || !!searched;
  hint.innerHTML = `${AI_TOOL_ICONS[aiTool] || ''}<span>${running ? `${esc(aiToolName)} · ${esc(aiToolModel)} · searching` : searched ? `Searched with ${esc(aiToolModel)}` : `Search with ${esc(aiToolModel)}`}</span>`;
}
function stopAiSearch() {
  const prevJob = aiJob, wasRunning = !!prevJob;
  aiResults = { query: '', matches: new Map() }; aiJob = 0; showAiStatus(false);
  if (wasRunning) { aiActivity.remove(`search:${prevJob}`, { rememberDismissal: false }); void api('/ai-search', { method: 'DELETE', body: {} }).catch(() => {}); }
}
async function startAiSearch() {
  const query = state.query.trim();
  if (!aiTool || query.length < 3 || state.archive || state.demo || (aiResults.query === query && (aiJob || aiResults.matches.size))) return;
  stopAiSearch(); aiResults = { query, matches: new Map() }; showAiStatus(true); renderResults();
  window.scrollTo({ left: scrollX, top: 0, behavior: 'instant' });
  const filtered = applyFilters(scopedPosts(), state.filters, { topicScope: name => topicScope(state.topicCatalog, name) }).map(post => post.id);
  // The AI reads everything the filters allow. The local model can only add to what it checks, never remove: it reads saved descriptions, so a useless caption can't hide a good image.
  const ranked = await meaningSearch.rank(query);
  if (aiResults.query !== query) return;
  const allowed = new Set(filtered), postIds = filtered;
  const nudged = ranked?.complete ? ranked.ranking.filter(([id, score]) => allowed.has(id) && score >= AI_NUDGE_SCORE).slice(0, AI_NUDGE_LIMIT).map(([id]) => id) : [];
  try {
    const { job } = await api('/ai-search', { method: 'POST', body: { query, postIds, nudged, documents: searchesDocuments() } });
    if (aiResults.query !== query) return;
    aiJob = job.id; syncAiSearchActivity({ id: job.id, state: 'running', matches: [] }, query); void followAiSearch(job.id, query);
  } catch (error) { aiResults = { query: '', matches: new Map() }; showAiStatus(false); renderResults(); toast(error.message, true, 'bottom-center'); }
}
// New results can land above the card someone's looking at, and the layout would follow that card down the list.
// So anyone at the top stays at the top, watching results arrive. Someone who has scrolled is left where they are.
function renderAiResults() {
  const atTop = scrollY < 120;
  renderResults();
  if (!atTop) return;
  // The layout settles for a moment after a change, so hold the top until it has, every frame so it never shows.
  const until = performance.now() + 600;
  const hold = () => { if (scrollY > 0) window.scrollTo({ left: scrollX, top: 0, behavior: 'instant' }); if (performance.now() < until) requestAnimationFrame(hold); };
  hold();
}
// The AI that's on changing topics, from the Organize button. A topic's own row opens it, like a click would.
function postSummary(postId) {
  const id = Number(postId);
  const post = allPosts().find(item => item.id === id) || state.posts.find(item => item.id === id);
  if (!post) return '';
  const who = post.author ? `@${String(post.author).replace(/^@+/, '')}` : platformName(post.platform);
  const snippet = String(post.title || post.text || '').replace(/\s+/g, ' ').trim();
  return snippet ? `${who} — ${snippet.slice(0, 72)}${snippet.length > 72 ? '…' : ''}` : who;
}
let aiLocateTimer = 0, aiLocateStop = null;
function highlightLocatedPost(card) {
  clearTimeout(aiLocateTimer);
  document.querySelectorAll('.save-card.is-ai-located').forEach(el => el.classList.remove('is-ai-located'));
  // Read the layout once in between, so the glow plays again on a post that was just lit.
  void card.offsetWidth;
  card.classList.add('is-ai-located');
  aiLocateTimer = setTimeout(() => card.classList.remove('is-ai-located'), 2400);
}
function stopLocateWatch() {
  aiLocateStop?.();
  aiLocateStop = null;
}
function postScrollTop(card) {
  const toolbarHeight = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--toolbar-height')) || 64;
  return Math.max(0, window.scrollY + card.getBoundingClientRect().top - toolbarHeight - 20);
}
// aiView: opened from AI's notification, so the post is shown inside AI activity, or Processed today, when it's there.
async function showLibraryPost(postId, { aiView = false } = {}) {
  const id = Number(postId);
  stopLocateWatch();
  closeModal();
  closeSheet();
  await dismissPost();
  await documentUi?.close();
  const post = state.posts.find(item => item.id === id);
  if (!post) { toast('That post is no longer in your library.', true, 'bottom-center'); return; }
  if (state.demo) state.demo = false;
  let changedScope = false;
  if (!!post.archived !== state.archive) { state.archive = !!post.archived; changedScope = true; }
  if (showingCollectionFolders() || (state.sidebarView === 'collections' && state.topicsView === 'folders')) {
    state.topicsView = 'cards';
    try { localStorage.setItem('savex-topics-view', 'cards'); } catch { /* Keep cards view. */ }
    changedScope = true;
  }
  const view = aiView && !post.archived && aiDonePostIds().has(id) ? 'done' : null;
  if (view && state.filters.aiActivity !== view) { state.filters = { ...defaultFilters(), aiActivity: view }; changedScope = true; }
  if (changedScope || !filteredPosts().some(item => item.id === id)) {
    stopAiSearch();
    state.filters = view ? { ...defaultFilters(), aiActivity: view } : defaultFilters();
    state.query = '';
    const search = $('#search'); if (search) search.value = '';
    changedScope = true;
    updateCollection();
  }
  const sequence = inOwnOrder(), now = Date.now(), groups = new Map();
  for (const candidate of resultsPosts) {
    const group = sequence ? { key: 'source-sequence' } : addedTimeGroup(libraryAddedAt(candidate), now);
    const count = (groups.get(group.key) || 0) + 1;
    groups.set(group.key, count);
    if (candidate.id === id) {
      const needed = Math.max(resultsLimits.get(group.key) || CARD_BATCH_SIZE, count);
      if ((resultsLimits.get(group.key) || CARD_BATCH_SIZE) < needed) {
        resultsLimits.set(group.key, needed);
        changedScope = true;
        renderResultsPage();
      }
      break;
    }
  }
  pauseReadingHold(1200);
  if (changedScope) {
    // Let newly mounted masonry cards, toolbar height, and initial ResizeObserver layout settle before measuring.
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    pauseReadingHold(1000);
  }
  const findCard = () => document.querySelector(`.save-card[data-post-id="${id}"]`);
  const card = findCard();
  if (!card) { toast('Could not locate that post in the current view.', true, 'bottom-center'); return; }
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // The page glides to the post on its own curve: quick to start, then a long gentle settle. It follows the post if cards
  // above it grow on the way, and only once it has stopped does the post light up, every time, even with no scrolling.
  // The page can't scroll past its end, so a post near the bottom lands as far as it can go.
  const reachable = top => Math.min(top, document.documentElement.scrollHeight - window.innerHeight);
  const target = () => { const found = findCard(); return found ? reachable(postScrollTop(found)) : null; };
  let frame = 0, ended = false;
  const finish = () => {
    if (ended) return; ended = true;
    cancelAnimationFrame(frame);
    for (const evt of ['wheel', 'touchstart', 'keydown']) window.removeEventListener(evt, finish);
    if (aiLocateStop === finish) aiLocateStop = null;
    const found = findCard(); if (found) highlightLocatedPost(found);
  };
  let to = target();
  if (reduced) { window.scrollTo({ top: to, behavior: 'instant' }); requestAnimationFrame(finish); return; }
  // Only a very long way off does it jump first, to a little over a screen away, so the glide stays calm.
  if (Math.abs(to - window.scrollY) > window.innerHeight * 3) window.scrollTo({ top: to - Math.sign(to - window.scrollY) * window.innerHeight * 1.2, behavior: 'instant' });
  const from = window.scrollY, distance = Math.abs(to - from), duration = distance < 2 ? 0 : Math.min(900, 380 + distance * .3);
  const ease = t => 1 - Math.pow(1 - t, 4), started = performance.now();
  let still = 0;
  const step = now => {
    const next = target();
    if (next === null || now - started > 4000) { finish(); return; }
    to = next;
    const t = duration ? Math.min(1, (now - started) / duration) : 1;
    window.scrollTo({ top: from + (to - from) * ease(t), behavior: 'instant' });
    pauseReadingHold(600);
    if (t >= 1 && Math.abs(window.scrollY - to) < 2) { if (!still) still = now; else if (now - still > 120) { finish(); return; } }
    else still = 0;
    frame = requestAnimationFrame(step);
  };
  frame = requestAnimationFrame(step);
  for (const evt of ['wheel', 'touchstart', 'keydown']) window.addEventListener(evt, finish, { passive: true });
  aiLocateStop = finish;
}
// Everything AI is working on or has just finished, as the AI activity card lists it. Its posts make the
// AI activity view under All saves, until each item is dismissed.
let aiActivityList = [], aiActivityCollapsed = false, aiActivityShown = '';
// Every post AI worked on today, running or finished, is listed under "Processed today", with nothing to tick (user's decision,
// 2026-11-18). Today means the same as for New saves: today's date or the last 6 hours. Kept across restarts.
const AI_TODAY_KEY = 'savex-ai-processed';
const recentWork = item => addedToday(new Date(item.doneAt ?? item.createdAt ?? 0).toISOString());
let aiProcessed = [];
try { aiProcessed = JSON.parse(localStorage.getItem(AI_TODAY_KEY) || '[]').filter(recentWork); } catch { /* Start empty. */ }
const saveProcessed = () => { aiProcessed = aiProcessed.filter(recentWork).slice(-300); try { localStorage.setItem(AI_TODAY_KEY, JSON.stringify(aiProcessed)); } catch { /* Kept for this page only. */ } };
// A job counts from when it's first seen finished on this page. One shown again from storage after a restart was counted then.
function rememberProcessed(list) {
  let added = false;
  for (const { key, kind, title, detail, postId, documentId, documentTitle, state, persisted } of list) {
    if (state !== 'done' || !postId || persisted || aiProcessed.some(old => old.key === key)) continue;
    aiProcessed.push({ key, kind, state: 'done', title, detail, postId, documentId, documentTitle, doneAt: Date.now() }); added = true;
  }
  if (added) saveProcessed();
}
// What's running now joins what finished, so the row covers everything AI is doing or did today.
function processedItems() {
  const items = new Map(aiProcessed.filter(recentWork).map(item => [item.key, item]));
  for (const item of aiActivityList) {
    if (!item.postId || !['running', 'waiting', 'done'].includes(item.state)) continue;
    const kept = items.get(item.key);
    if (item.state !== 'done' || kept || recentWork(item)) items.set(item.key, { ...item, doneAt: kept?.doneAt ?? item.doneAt });
  }
  return [...items.values()];
}
// Work drops out as it gets older than today and 6 hours, so the row is checked again every few minutes.
setInterval(() => { saveProcessed(); renderAiActivityNavigation(); }, 5 * 60 * 1000);
try { aiActivityCollapsed = localStorage.getItem('savex-ai-activity-collapsed') === 'true'; } catch { /* Start expanded. */ }
const aiActivity = createAiActivity({
  container: $('#ai-status'),
  // AI search lists its results in place, so the sidebar leaves it out (user's decision).
  onChange: list => { aiActivityList = list.filter(item => item.kind !== 'search'); rememberProcessed(aiActivityList); renderAiActivityNavigation(); refreshAiTags(); },
  esc,
  icon,
  dotLoader,
  resolvePostLabel: postSummary,
  isDialogOpen: () => modal.open || $('#sheet')?.open || $('#post-panel')?.open || !!documentUi?.isOpen?.(),
  onAction: async (actionId, item, button) => {
    if (actionId === 'open-document' && item.documentId) {
      closeModal();
      closeSheet();
      await dismissPost();
      await documentUi?.open(item.documentId);
      return;
    }
    if (actionId === 'show-post' && item.postId) {
      await showLibraryPost(item.postId, { aiView: true });
      return;
    }
    if (actionId === 'open-organize') {
      closeSheet();
      await dismissPost();
      await documentUi?.close();
      if (!modal.open || !modal.querySelector('.organize-dialog')) void openOrganize();
      return;
    }
    if (actionId === 'show-search') {
      closeModal();
      closeSheet();
      await dismissPost();
      await documentUi?.close();
      if (item.searchQuery && $('#search')) {
        state.archive = false;
        state.demo = false;
        state.query = item.searchQuery;
        $('#search').value = item.searchQuery;
        updateCollection();
      }
      $('#search')?.focus({ preventScroll: true });
      return;
    }
    if (actionId === 'cancel') {
      button.disabled = true;
      try {
        if (item.kind === 'document' && docAiJob?.state === 'running') {
          ({ job: docAiJob } = await api('/document-ai', { method: 'DELETE', body: {} }));
          paintDocAiButtons();
          syncDocAiActivity(docAiJob);
        } else if (item.kind === 'note' && item.postId) {
          const { job } = await api('/note-ai', { method: 'DELETE', body: { post: item.postId } });
          if (job?.post === item.postId) noteAiJobs.set(item.postId, job);
          paintNoteAi(item.postId);
          syncNoteAiActivity(job || { id: item.serverRef?.split(':')[1], post: item.postId, state: 'cancelled' });
        } else if (item.kind === 'organize') {
          await api('/organize', { method: 'DELETE', body: {} });
        } else if (item.kind === 'search') {
          stopAiSearch();
        } else if (typeof item.cancel === 'function') {
          item.cancel();
        }
      } catch (error) {
        button.disabled = false;
        toast(error.message, true, 'bottom-center');
      }
      return;
    }
    if (actionId === 'undo' && item.canUndo && !item.undone) {
      button.disabled = true;
      try {
        if (item.kind === 'document' && item.changeId) {
          await api('/document-ai/undo', { method: 'POST', body: { changeId: item.changeId } });
          documentUi?.refresh();
          documentUi?.reloadIfOpen(item.documentId);
          aiActivity.upsert({ key: item.key, canUndo: false, undone: true, detail: `Undone · ${item.detail || item.documentTitle || ''}`.replace(/ · $/, '') });
        } else if (item.kind === 'note' && item.postId) {
          await undoNoteAi(item.postId, button);
          aiActivity.upsert({ key: item.key, canUndo: false, undone: true, detail: 'Undone — restored previous note' });
        } else if (item.kind === 'organize' && item.changeId) {
          await openOrganize.undo(item.changeId);
          aiActivity.upsert({ key: item.key, canUndo: false, undone: true, detail: 'Undone — topics restored' });
        }
      } catch (error) {
        button.disabled = false;
        toast(error.message, true, 'bottom-center');
      }
    }
  },
});
function syncDocAiActivity(job) {
  if (!job) return;
  const key = job.id ? `doc:${job.id}` : `doc:post:${job.post}`;
  if (job.state === 'cancelled') { aiActivity.remove(key, { rememberDismissal: false }); return; }
  const docName = job.documentTitle || 'Document';
  const serverRef = job.id ? `doc:${job.id}` : '';
  if (job.state === 'running') {
    aiActivity.upsert({
      key, serverRef, kind: 'document', loaderKind: 'write', state: 'running',
      title: `Sending to “${docName}”`,
      detail: `${job.step || 'Reading this save'}…`,
      postId: job.post, documentId: job.documentId, documentTitle: docName,
      cancellable: true,
    });
    return;
  }
  if (job.state === 'done') {
    aiActivity.upsert({
      key, serverRef, kind: 'document', loaderKind: 'write', state: 'done',
      title: `Updated “${docName}”`,
      detail: job.summary || (job.request ? `Added from “${job.request}”` : 'Saved note added to document.'),
      postId: job.post, documentId: job.documentId, documentTitle: docName,
      changeId: job.changeId || '', canUndo: Boolean(job.changeId), cancellable: false,
    });
    return;
  }
  if (job.state === 'failed') {
    aiActivity.upsert({
      key, serverRef, kind: 'document', loaderKind: 'write', state: 'failed',
      title: `Couldn’t update “${docName}”`,
      detail: job.error || 'Sending to document failed.',
      postId: job.post, documentId: job.documentId, documentTitle: docName,
      cancellable: false,
    });
  }
}
function syncNoteAiActivity(job) {
  if (!job) return;
  const key = job.id ? `note:${job.id}` : `note:post:${job.post}`;
  if (job.state === 'cancelled') { aiActivity.remove(key, { rememberDismissal: false }); return; }
  const serverRef = job.id ? `note:${job.id}` : '';
  if (job.state === 'waiting') {
    aiActivity.upsert({
      key, serverRef, kind: 'note', loaderKind: 'write', state: 'waiting',
      title: 'Filling note · queued',
      detail: job.position ? `${job.position} ahead in queue` : 'Waiting to start',
      postId: job.post, cancellable: true,
    });
    return;
  }
  if (job.state === 'running') {
    aiActivity.upsert({
      key, serverRef, kind: 'note', loaderKind: 'write', state: 'running',
      title: 'Filling note with AI',
      detail: `${job.step || 'Reading this save'}…`,
      postId: job.post, cancellable: true,
    });
    return;
  }
  if (job.state === 'done') {
    const post = allPosts().find(item => item.id === job.post);
    const canUndo = post ? noteAiUndo.has(job.post) && notes.value(post) === job.notes : Boolean(aiActivity.get(key)?.canUndo);
    aiActivity.upsert({
      key, serverRef, kind: 'note', loaderKind: 'write', state: 'done',
      title: 'Note updated',
      detail: job.request || 'Filled note with AI',
      postId: job.post, canUndo, cancellable: false,
    });
    return;
  }
  if (job.state === 'failed') {
    aiActivity.upsert({
      key, serverRef, kind: 'note', loaderKind: 'write', state: 'failed',
      title: 'Couldn’t fill note',
      detail: job.error || 'Note AI failed.',
      postId: job.post, cancellable: false,
    });
  }
}
function syncOrganizeActivity(job, { stepText } = {}) {
  if (!job) return;
  const key = job.id ? `organize:${job.id}` : 'organize:current';
  if (job.state === 'cancelled') { aiActivity.remove(key, { rememberDismissal: false }); return; }
  const serverRef = job.id ? `organize:${job.id}` : '';
  if (job.state === 'running') {
    aiActivity.upsert({
      key, serverRef, kind: 'organize', loaderKind: 'organize', state: 'running',
      title: 'Organizing topics',
      detail: stepText || job.request || 'Working…',
      cancellable: true,
    });
    return;
  }
  if (job.state === 'done') {
    aiActivity.upsert({
      key, serverRef, kind: 'organize', loaderKind: 'organize', state: 'done',
      title: job.undone ? 'Topics restored' : 'Topics organized',
      detail: job.summary?.[0] || job.message || job.request || 'Done.',
      changeId: job.changeId || '', canUndo: Boolean(job.changeId && !job.undone), undone: Boolean(job.undone),
      cancellable: false,
    });
    return;
  }
  if (job.state === 'failed') {
    aiActivity.upsert({
      key, serverRef, kind: 'organize', loaderKind: 'organize', state: 'failed',
      title: 'Couldn’t organize topics',
      detail: job.error || 'Organizing topics failed.',
      cancellable: false,
    });
  }
}
function syncAiSearchActivity(job, query = '') {
  if (!job?.id) return;
  const key = `search:${job.id}`, serverRef = key;
  const searchQuery = query || job.query || '';
  if (job.state === 'running' || job.state === 'asking') {
    const checking = job.phase === 'images', settling = job.phase === 'settling';
    const detail = job.state === 'asking'
      ? 'Waiting for your answer'
      : settling
        ? `Checking saved descriptions · ${job.settleDone} of ${job.settleTotal}`
        : checking
          ? `Scanning images · ${job.imagesDone} of ${job.imagesTotal}`
          : job.total
            ? `Reading your saves · ${job.done} of ${job.total}`
            : searchQuery ? `Searching for “${searchQuery}”` : 'Reading your saves';
    aiActivity.upsert({
      key, serverRef, kind: 'search', loaderKind: 'search', state: 'running',
      title: 'Searching with AI',
      detail, searchQuery, cancellable: true,
    });
    return;
  }
  if (job.error) {
    aiActivity.upsert({
      key, serverRef, kind: 'search', loaderKind: 'search', state: 'failed',
      title: 'AI search failed', detail: job.error, searchQuery, cancellable: false,
    });
    return;
  }
  const count = job.matches?.length || 0;
  aiActivity.upsert({
    key, serverRef, kind: 'search', loaderKind: 'search', state: 'done',
    title: 'AI search finished',
    detail: `${count} ${count === 1 ? 'match' : 'matches'}${searchQuery ? ` for “${searchQuery}”` : ''}`,
    searchQuery, cancellable: false,
  });
}
function syncExternalActivity(entry) {
  if (!entry?.key) return;
  if (entry.state === 'cancelled') { aiActivity.remove(entry.key, { rememberDismissal: false }); return; }
  aiActivity.upsert(entry);
}
const openOrganize = organizeTopics({ modal, showModal, api, toast, esc, icon, model: () => aiToolModel, refresh: () => refresh(true), askToScanImages, onActivity: syncOrganizeActivity, openTopic: name => [...document.querySelectorAll('[data-open-collection], #topic-navigation [data-nav-topic]')].find(item => (item.dataset.openCollection || item.dataset.navTopic) === name)?.click() });
// A search that wants to read a lot of images asks first, because it's the person's plan it uses.
function askToScanImages(count) {
  return new Promise(resolve => {
    showModal(`<h2>Scan ${count} images?</h2><p>${esc(aiToolName)} is unsure about ${count} posts and needs to see their images to decide. This uses your plan.</p><p>Each description is saved with its post, so these images won’t need scanning again.</p><div class="button-row"><button class="primary" type="button" data-scan-images>Scan ${count} images</button><button class="secondary" type="button" data-skip-images>Not now</button></div>`);
    let answer = false;
    $('[data-scan-images]', modal).onclick = () => { answer = true; modal.close(); };
    $('[data-skip-images]', modal).onclick = () => modal.close();
    modal.addEventListener('close', () => resolve(answer), { once: true });
  });
}
async function followAiSearch(id, query) {
  while (aiJob === id) {
    let job = null; try { ({ job } = await api(`/ai-search?job=${id}`)); } catch { /* Tried again below. */ }
    if (aiJob !== id) return;
    if (!job) { aiActivity.remove(`search:${id}`, { rememberDismissal: false }); aiJob = 0; showAiStatus(false); renderResults(); return; }
    const count = aiResults.matches.size; aiResults = { query, matches: new Map(job.matches) };
    paintAiProgress(job);
    if (job.state === 'asking') {
      if (aiResults.matches.size !== count) renderAiResults();
      const approve = await askToScanImages(job.askImages);
      if (aiJob !== id) return;
      try { await api('/ai-search/images', { method: 'POST', body: { job: id, approve } }); } catch { /* The next check shows where it stands. */ }
      continue;
    }
    if (job.state !== 'running') { aiJob = 0; showAiStatus(false); syncAiSearchActivity(job, query); renderAiResults(); if (job.imagesDone) void refresh(true); if (job.error) toast(job.error, true, 'bottom-center'); else if (job.note) toast(job.note, false, 'bottom-center'); return; }
    if (aiResults.matches.size !== count) renderAiResults();
    await new Promise(resolve => setTimeout(resolve, 800));
  }
}
// The posts an AI found and how likely each is, which sets their place in the results.
function relatedMatches() {
  const query = state.query.trim(), local = meaningMatches?.query === query ? meaningMatches.matches : null, picked = aiResults.query === query ? aiResults.matches : null;
  if (!picked?.size) return local;
  const combined = new Map(local || []);
  for (const [id, score] of picked) combined.set(id, 100 + score);
  return combined;
}
// Searching also looks through documents (user's decision, 2026-11-18): each document that matches shows as one card
// above the saves, at its best section, and opens there. Only for a search across the whole library, since documents
// don't belong to an account, topic or date. Their text is fetched again after a document closes, or when it's old.
let searchableDocs = null, searchableAt = 0, searchableLoading = null;
function loadSearchableDocuments(force = false) {
  if (state.demo || searchableLoading || (!force && searchableDocs && Date.now() - searchableAt < 15000)) return;
  searchableLoading = api('/documents/searchable').then(({ documents }) => {
    const changed = JSON.stringify(documents) !== JSON.stringify(searchableDocs);
    searchableDocs = documents || []; searchableAt = Date.now();
    if (changed) { syncMeaningSearch(); if (state.query.trim()) renderResults(); }
  }).catch(() => {}).finally(() => { searchableLoading = null; });
}
const searchesDocuments = () => !!state.query.trim() && !state.archive && !state.demo && !state.filters.aiActivity && !showingCollectionFolders()
  && !state.filters.sources.length && !state.filters.accounts.length && !state.filters.topics.length && !(state.filters.collections || []).length && !state.filters.folder && !state.filters.collection && state.filters.date === 'any';
function documentResults() {
  if (!searchesDocuments()) return [];
  loadSearchableDocuments();
  return searchableDocs ? searchDocuments(searchableDocs, state.query, { scores: relatedMatches() }).slice(0, 6) : [];
}
// The searched words, marked in the card's lines.
function markTerms(text, terms) {
  const spans = [];
  for (const term of terms) for (const found of text.matchAll(wordPattern(term))) spans.push([found.index, found.index + found[0].length]);
  spans.sort((a, b) => a[0] - b[0]);
  let html = '', last = 0;
  for (const [from, to] of spans) { if (from < last) continue; html += `${esc(text.slice(last, from))}<mark>${esc(text.slice(from, to))}</mark>`; last = to; }
  return html + esc(text.slice(last));
}
function documentCard(result) {
  const heading = result.heading && result.heading !== result.title ? `<span class="doc-result-heading">${markTerms(result.heading, result.terms)}</span>` : '';
  const picture = result.picture ? `<img class="doc-result-picture" src="/api/documents/${esc(result.picture.split('#')[0])}" alt="" loading="lazy">` : '';
  return `<article class="doc-result"><button type="button" class="doc-result-open" data-doc-result="${esc(result.documentId)}" data-heading="${esc(result.heading)}" data-nth="${result.nth}" data-section="${result.section}" data-terms="${esc(JSON.stringify(result.terms))}" aria-label="Open ${esc(result.title)}${result.heading ? `, ${esc(result.heading)}` : ''}">`
    + `<span class="doc-result-head"><span class="doc-result-icon" aria-hidden="true">${result.icon ? esc(result.icon) : icon('file')}</span><span class="doc-result-title">${esc(result.title)}</span>${result.more ? `<span class="doc-result-more">+${result.more}</span>` : ''}</span>`
    + `${heading}${picture}<span class="doc-result-snippet">${markTerms(result.snippet, result.terms)}</span></button></article>`;
}
function renderDocumentResults() {
  const host = $('#document-results'); if (!host) return 0;
  const results = documentResults(), html = results.map(documentCard).join('');
  host.hidden = !results.length; host.dataset.view = state.cardView;
  if (host.dataset.html !== html) { host.dataset.html = html; host.innerHTML = html; }
  if (results.length) requestAnimationFrame(alignDocumentResults);
  return results.length;
}
// Document cards line up with the posts below them: in one column, with the post's own box rather than the icons beside it,
// and in the grid, with its columns. Measured from the cards on show, since the layout sets their size.
function alignDocumentResults() {
  const host = $('#document-results'); if (!host || host.hidden) return;
  const card = $('#results .save-card'), box = card && (state.cardView === 'feed' ? $('.card-preview', card) : card);
  if (!box) { host.style.removeProperty('--doc-left'); host.style.removeProperty('--doc-width'); return; }
  const at = box.getBoundingClientRect(), edge = host.getBoundingClientRect();
  host.style.setProperty('--doc-left', state.cardView === 'feed' ? `${Math.max(0, Math.round(at.left - edge.left))}px` : '0px');
  host.style.setProperty('--doc-width', `${Math.round(at.width)}px`);
}
window.addEventListener('resize', () => requestAnimationFrame(alignDocumentResults), { passive: true });
document.addEventListener('click', async event => {
  const open = event.target.closest?.('[data-doc-result]'); if (!open) return;
  event.preventDefault();
  closeModal(); closeSheet(); await dismissPost();
  await documentUi?.open(open.dataset.docResult, { find: { heading: open.dataset.heading, nth: Number(open.dataset.nth) || 0, section: Number(open.dataset.section) || 0, terms: JSON.parse(open.dataset.terms || '[]') } });
});
// Processed today lists the latest AI work first (user's decision, 2026-11-18): anything running or waiting is now, and
// finished work is when it finished. A post AI worked on more than once goes by its latest.
function byLatestAiWork(posts) {
  const latest = new Map();
  for (const item of processedItems()) {
    const at = ['running', 'waiting'].includes(item.state) ? Infinity : item.doneAt ?? item.createdAt ?? 0, id = Number(item.postId);
    if (!(latest.get(id) >= at)) latest.set(id, at);
  }
  return [...posts].sort((a, b) => (latest.get(b.id) ?? 0) - (latest.get(a.id) ?? 0));
}
// Views listed in their own order rather than by date, so they have no Added today and Added earlier dividers.
const inOwnOrder = () => showsSiteList(state.filters) || state.filters.aiActivity === 'done';
function filteredPosts() {
  const listed = unordered();
  return state.filters.aiActivity === 'done' ? byLatestAiWork(listed) : listed;
}
function unordered() {
  const ai = state.filters.aiActivity === 'today' ? todayPostIds() : state.filters.aiActivity && aiDonePostIds();
  const posts = ai ? scopedPosts().filter(post => ai.has(post.id)) : scopedPosts(), result = applyFilters(posts, state.filters, { query: state.query, topicScope: name => topicScope(state.topicCatalog, name), meaning: relatedMatches() });
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
  // A group like an account's, so AI activity can sit under it as a child row (renderAiActivityNavigation fills it).
  return `<div class="source-account-group all-saves-group"><button class="nav-item account-nav-item all-saves-nav" data-filter="all" data-nav-label="All saves" aria-label="All saves ${count}" title="Browse all saves">${icon('grid', 'source-icon')}<span class="nav-label-text">All saves</span><span class="nav-count">${count}</span></button><div id="ai-activity-navigation"></div></div>`;
}
function navItem(filter, label, symbol, count) {
  return `<button class="nav-item ${(filter === 'all' ? !state.filters.sources.length : state.filters.sources.length === 1 && state.filters.sources[0] === filter) ? 'active' : ''}" data-filter="${filter}" data-nav-label="${label}" aria-label="${label} ${count}" title="${label}">${sourceIcon(filter)}<span class="nav-label-text">${filter === 'chrome' ? 'Chrome' : label}</span><span class="nav-count">${count}</span></button>`;
}
function navigationAccounts() { return sidebarAccounts(allPosts(), state.sync?.xAccounts?.accounts || [], state.demo ? [] : state.instagramCollections || [], state.demo ? {} : state.instagramSaveLists, { pinterest: !state.demo && !!state.sync?.nativeSocial?.enabled }); }
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
// Only posts still in the library count, so a post unsaved or archived since then doesn't leave a count with nothing to show.
const inLibrary = items => { const present = new Set(allPosts().filter(post => !post.archived).map(post => post.id)); return new Set(items.map(item => Number(item.postId)).filter(id => present.has(id))); };
// Anything still in AI activity isn't processed yet, including entries an earlier version saved before they were ticked.
const aiDonePostIds = () => inLibrary(processedItems());
// Saves with the New tag (today's date or the last 6 hours), for the New saves row under All saves (user's decision, 2026-11-18).
const todayPostIds = () => new Set(allPosts().filter(post => !post.archived && addedTimeGroup(libraryAddedAt(post)).key === 'added-today').map(post => post.id));
// AI activity is a view the app makes by itself, never a filter someone sets up: a child row of All saves
// while AI is working on or has just finished something for a post, gone once those are dismissed.
function renderAiActivityNavigation() {
  const root = $('#ai-activity-navigation'); if (!root) return;
  // The rows under All saves: New saves and Processed today, each there only while it has posts.
  // Inside Processed today, new AI work on a post already listed moves it to the top, so its order counts as a change too.
  const done = aiDonePostIds(), today = todayPostIds(), order = state.filters.aiActivity === 'done' ? byLatestAiWork([...done].map(id => ({ id }))).map(post => post.id) : [];
  const key = `${[...done]}|${[...today]}|${order}`;
  const shown = state.filters.aiActivity === 'today' ? today : done;
  // With nothing left to show, the AI activity view goes back to all saves. Redrawing the grid redraws this
  // row too, so the posts are noted first and the grid is redrawn only once per change.
  const changed = state.filters.aiActivity && aiActivityShown !== key;
  aiActivityShown = key;
  if (changed && !shown.size) state.filters = defaultFilters();
  if (changed) updateCollection();
  const working = aiActivityList.some(item => item.postId && ['running', 'waiting'].includes(item.state));
  const doneRow = done.size ? `<li><button class="nav-item instagram-collection ai-activity-nav ai-done-nav" type="button" data-ai-done-nav aria-pressed="false" aria-label="Processed today ${done.size}" title="Posts AI worked on today"><span class="ai-activity-state" aria-hidden="true">${working ? dotLoader('write', 'tiny') : icon('sparkle')}</span><span class="collection-label">Processed today</span><span class="nav-count">${done.size}</span></button></li>` : '';
  const todayRow = today.size ? `<li><button class="nav-item instagram-collection ai-activity-nav today-nav" type="button" data-today-nav aria-pressed="false" aria-label="New saves ${today.size}" title="Saves with the New tag"><span class="ai-activity-state today-state" aria-hidden="true">${icon('plus')}</span><span class="collection-label">New saves</span><span class="nav-count">${today.size}</span></button></li>` : '';
  const html = todayRow || doneRow ? `<button type="button" class="collection-toggle" data-ai-activity-toggle aria-label="Show or hide the rows under All saves" aria-expanded="${!aiActivityCollapsed}" aria-controls="ai-activity-list" title="${aiActivityCollapsed ? 'Expand' : 'Collapse'}">${icon('chevron')}</button><ul id="ai-activity-list" class="instagram-collections" aria-label="Under All saves" ${aiActivityCollapsed ? 'hidden' : ''}>${todayRow}${doneRow}</ul>` : '';
  root.closest('.all-saves-group')?.classList.toggle('has-collections', !!(done.size || today.size));
  if (root.dataset.html === html) return;
  root.dataset.html = html; root.innerHTML = html;
  updateSidebarSelection();
}
document.addEventListener('click', event => {
  const target = event.target.closest?.('[data-ai-done-nav],[data-today-nav],[data-ai-activity-toggle]');
  if (!target) return;
  event.preventDefault();
  if (target.hasAttribute('data-ai-activity-toggle')) {
    aiActivityCollapsed = !aiActivityCollapsed;
    try { localStorage.setItem('savex-ai-activity-collapsed', String(aiActivityCollapsed)); } catch { /* Keep this session's choice. */ }
    delete $('#ai-activity-navigation').dataset.html; renderAiActivityNavigation(); return;
  }
  state.archive = false; state.filters = { ...defaultFilters(), aiActivity: target.hasAttribute('data-today-nav') ? 'today' : 'done' }; state.query = ''; $('#search').value = '';
  updateCollection(); window.scrollTo({ top: 0, behavior: 'instant' });
});
// Brings the cards' AI tags in line with AI activity.
function refreshAiTags() {
  const cards = document.querySelectorAll('#results .save-card[data-post-id]'); if (!cards.length) return;
  const posts = new Map(allPosts().map(post => [post.id, post]));
  for (const card of cards) { const post = posts.get(Number(card.dataset.postId)); if (post && $('.card-layout', card)) markNew(card, post); }
}
document.addEventListener('click', event => {
  const ack = event.target.closest?.('[data-ai-ack]'); if (!ack) return;
  event.preventDefault(); event.stopPropagation();
  aiActivity.remove(ack.dataset.aiAck);
}, true);
document.addEventListener('click', async event => {
  const open = event.target.closest?.('[data-ai-open-document]'); if (!open) return;
  event.preventDefault(); event.stopPropagation();
  closeModal(); closeSheet(); await dismissPost(); await documentUi?.open(open.dataset.aiOpenDocument);
}, true);
function renderAccountNavigation() {
  renderAiActivityNavigation();
  const accounts = navigationAccounts(), collections = state.demo ? [] : state.instagramCollections || [];
  const counts = new Map();
  for (const post of allPosts().filter(post => !post.archived)) for (const id of new Set((post.collections || []).map(collection => collection.id))) counts.set(id, (counts.get(id) || 0) + 1);
  const signature = JSON.stringify([accounts, collections, [...counts], state.instagramSaveLists]);
  for (const [selector, platform] of [['#account-navigation', 'x'], ['#instagram-navigation', 'instagram'], ['#pinterest-navigation', 'pinterest'], ['#threads-navigation', 'threads']]) {
    const root = $(selector); if (!root || root.dataset.signature === signature) continue;
    const focused = root.contains(document.activeElement) ? { account: document.activeElement.dataset.navAccount, collection: document.activeElement.dataset.instagramCollection, toggle: document.activeElement.dataset.collectionsAccount } : null;
    root.innerHTML = accounts.filter(account => account.platform === platform).map(account => {
      const name = account.label === platformName(account.platform) ? account.label : `${platformName(account.platform)} ${account.label}`;
      const selection = instagramSaveList(account.value, state.instagramSaveLists), selected = selection.collectionIds;
      const folders = ['x', 'threads'].includes(account.platform) ? [] : collections.filter(collection => (collection.platform || 'instagram') === account.platform && account.value === `${account.platform}:${collection.account.toLowerCase()}` && (selected === null || selected.includes(collection.id)));
      const expanded = !collapsedInstagramAccounts.has(account.value), listId = `instagram-collections-${encodeURIComponent(account.value)}`;
      return `<div class="source-account-group ${folders.length ? 'has-collections' : ''}"><button class="nav-item account-nav-item" data-nav-account="${esc(account.value)}" aria-label="${esc(name)} ${account.count}" aria-pressed="false" ${folders.length ? `aria-expanded="${expanded}" aria-controls="${listId}"` : ''} title="${esc(name)}">${sourceIcon(account.platform)}<span class="nav-label-text ${account.label.startsWith('@') ? 'account-handle' : ''}">${esc(account.label)}</span><span class="nav-count">${account.count}</span></button>${folders.length ? `<button type="button" class="collection-toggle" data-action="toggle-collections" data-collections-account="${esc(account.value)}" aria-label="Toggle ${account.platform === 'pinterest' ? 'Pinterest boards' : 'Instagram collections'} for ${esc(account.label)}" aria-expanded="${expanded}" aria-controls="${listId}" title="${expanded ? 'Collapse' : 'Expand'} ${account.platform === 'pinterest' ? 'boards' : 'collections'}">${icon('chevron')}</button><ul id="${listId}" class="instagram-collections" aria-label="${account.platform === 'pinterest' ? 'Pinterest boards' : 'Instagram collections'} for ${esc(account.label)}" ${expanded ? '' : 'hidden'}>${folders.map(collection => `<li><button class="nav-item instagram-collection" data-instagram-collection="${collection.id}" aria-pressed="false" aria-label="${esc(collection.name)} · ${esc(collection.account)} · ${counts.get(collection.id) || 0} saves" title="${esc(collection.name)}"><span class="collection-label">${esc(collection.name)}</span><span class="nav-count">${counts.get(collection.id) || 0}</span></button></li>`).join('')}</ul>` : ''}</div>`;
    }).join('');
    root.dataset.signature = signature;
    if (focused) [...root.querySelectorAll('button')].find(button => focused.account ? button.dataset.navAccount === focused.account : focused.toggle ? button.dataset.collectionsAccount === focused.toggle : button.dataset.instagramCollection === focused.collection)?.focus({ preventScroll: true });
  }
  renderNewSaves();
}
function allSourcesRefreshRequest() {
  return { targets: connectedTargets(['chrome', 'x', 'instagram', 'pinterest', 'threads']), xAccount: 'all' };
}
function accountRefreshRequest(value) {
  const [platform, handle] = value.split(':');
  return { targets: [platform], xAccount: platform === 'x' && handle.startsWith('@') ? handle : 'current', ...(platform === 'instagram' && handle.startsWith('@') ? { instagramAccount: handle } : {}), ...(platform === 'pinterest' && handle.startsWith('@') ? { pinterestAccount: handle } : {}) };
}
function accountMenu(trigger, point) {
  if (trigger.dataset.instagramCollection) return collectionRefreshMenu(trigger,point);
  const all = trigger.dataset.filter === 'all';
  const value = all ? 'all' : trigger.dataset.navAccount || 'chrome:*';
  const refresh = mode => { void startSync(mode, all ? allSourcesRefreshRequest() : accountRefreshRequest(value)).catch(error => toast(error.message, true)); };
  const busy = state.syncChecking || ['queued', 'running'].includes(state.sync?.job?.status);
  const items = [{ label: 'Quick scan and refresh', disabled: busy, run: () => refresh('quick') }, { label: 'Deep scan and refresh', disabled: busy, run: () => refresh('deep') }];
  if (!all && /^(instagram|pinterest):@/.test(value)) items.push({ label: value.startsWith('pinterest:') ? 'Choose boards' : 'Choose collections', run: () => collectionsDialog(value) });
  closeSelect(); closeCollectionPicker(); openAccountMenu(trigger, items, point);
}
function collectionRefreshRequest(id) {
  const collection=state.instagramCollections.find(item=>String(item.id)===String(id));
  if (collection?.platform === 'pinterest') return {targets:['pinterest'],xAccount:'current',pinterestAccount:collection.account,pinterestCollectionId:collection.id};
  return collection ? {targets:['instagram'],xAccount:'current',instagramAccount:collection.account,instagramCollectionId:collection.id} : null;
}
function collectionRefreshMenu(trigger,point) {
  const request=collectionRefreshRequest(trigger.dataset.instagramCollection);if(!request)return;
  const busy=state.syncChecking||['queued','running'].includes(state.sync?.job?.status)||['queued','running'].includes(state.sync?.unsave?.status);
  const refresh=mode=>{void startSync(mode,request).catch(error=>toast(error.message,true));};
  closeSelect();closeCollectionPicker();
  const platform=request.targets[0],value=`${platform}:${(request.pinterestAccount||request.instagramAccount).toLowerCase()}`;
  openAccountMenu(trigger,[{label:'Quick scan and refresh',disabled:busy,run:()=>refresh('quick')},{label:'Deep scan and refresh',disabled:busy,run:()=>refresh('deep')},{label:platform==='pinterest'?'Choose boards':'Choose collections',run:()=>collectionsDialog(value)}],point,'Collection options');
}
// Ticked collections and boards are what a refresh reads and the library shows. Unticking hides
// saves without deleting them, so ticking again brings them straight back.
function collectionsDialog(value, { label = '', fromSettings = false } = {}) {
  const platform = value.slice(0, value.indexOf(':')), handle = value.slice(platform.length + 1), pinterest = platform === 'pinterest';
  const noun = pinterest ? 'boards' : 'collections', source = pinterest ? 'Pinterest' : 'Instagram', allLabel = pinterest ? 'All pins' : 'All saves';
  const folders = state.instagramCollections.filter(item => (item.platform || 'instagram') === platform && value === `${platform}:${item.account.toLowerCase()}`);
  const selection = instagramSaveList(value, state.instagramSaveLists), before = new Set(selection.all ? folders.map(folder => folder.id) : selection.collectionIds);
  const counts = new Map();
  for (const post of state.posts.filter(post => !post.archived)) for (const id of new Set((post.collections || []).map(item => item.id))) counts.set(id, (counts.get(id) || 0) + 1);
  const name = label || navigationAccounts().find(item => item.value === value)?.label || handle;
  // From Settings it stacks on top like the extension page, with Settings still open underneath.
  const content = `<h2${fromSettings ? ' id="sheet-title"' : ''}>Choose ${noun}</h2><p class="save-list-account">${sourceIcon(platform)}${esc(name)}</p><p class="fine-print">Only what’s ticked is fetched and shown. Unticked ${noun} are hidden, not deleted. ${allLabel} also includes anything outside your ${noun}.</p><form id="instagram-save-list-form"><div class="save-list-choices" role="group" aria-label="${source} ${noun}"><label class="filter-choice save-list-all"><input type="checkbox" name="collection" value="all" ${selection.all ? 'checked' : ''}><span><span>${allLabel}</span></span></label>${folders.map(folder => `<label class="filter-choice"><input type="checkbox" name="collection" value="${folder.id}" ${before.has(folder.id) ? 'checked' : ''}><span><span>${esc(folder.name)}</span><span class="sync-account-count">${counts.get(folder.id) || 0}</span></span></label>`).join('')}</div>${!folders.length ? `<p class="fine-print">Refresh ${source} to find its ${noun}.</p>` : ''}<p id="save-list-error" class="form-error" role="alert"></p><div class="save-list-actions"><button class="secondary" type="button" id="cancel-save-list">Cancel</button><button class="primary" id="apply-save-list">Save changes</button></div></form>`;
  if (fromSettings) presentSheet(`<button class="text-button chrome-helper-back" type="button" data-action="close-sheet" aria-label="Back to settings">${icon('chevron')}Settings</button>${content}`);
  else showModal(content);
  const form = $('#instagram-save-list-form'), apply = $('#apply-save-list');
  const inputs = [...form.querySelectorAll('[name="collection"]')], all = inputs.find(input => input.value === 'all'), rows = inputs.filter(input => input !== all);
  form.onchange = event => {
    if (event.target === all) { if (all.checked) rows.forEach(input => { input.checked = true; }); }
    else if (!event.target.checked) all.checked = false;
    apply.disabled = !inputs.some(input => input.checked);
    $('#save-list-error').textContent = '';
  };
  const done = () => { if (fromSettings) closeSheet(); else modal.close(); };
  $('#cancel-save-list').onclick = done;
  form.onsubmit = async event => {
    event.preventDefault(); apply.disabled = true;
    try {
      const kept = new Set(rows.filter(input => input.checked).map(input => Number(input.value)));
      const result = await api('/instagram-save-list', { method: 'POST', body: { platform, account: handle, collectionIds: all.checked ? null : [...kept] } });
      collectionVersion++; state.instagramSaveLists = result.instagramSaveLists;
      const hiddenNow = new Set(all.checked ? [] : folders.filter(folder => !kept.has(folder.id)).map(folder => String(folder.id)));
      if (!fromSettings) { state.archive = false; state.filters = { ...defaultFilters(), sources: [platform], accounts: [value] }; }
      else if ([state.filters.collection, ...(state.filters.collections || [])].some(id => hiddenNow.has(String(id)))) state.filters = defaultFilters();
      if ([...kept].some(id => !before.has(id) && !counts.get(id))) toast(`Saved. Newly ticked ${noun} fill in on the next refresh.`);
      done(); updateCollection();
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
  }).join('') : '<p class="sidebar-empty">No topics yet.</p>';
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
// Topics → All saves opens on the folders. The Topics tab's layout toggle always offers them
// next to Feed and Grid, and returning to them from a filtered view clears the filters.
function showingTopicsHome() {
  return state.sidebarView === 'collections' && !state.archive && !state.query.trim() && !filterChips(state.filters).length;
}
function showingCollectionFolders() { return showingTopicsHome() && state.topicsView === 'folders'; }
function syncViewToggle() {
  const inTopics = state.sidebarView === 'collections' && !state.archive, folders = showingCollectionFolders();
  for (const button of document.querySelectorAll('.view-toggle button')) {
    const view = button.dataset.topicsView ? 'folders' : button.dataset.cardView;
    button.hidden = view === 'folders' && !inTopics;
    button.setAttribute('aria-pressed', String(view === 'folders' ? folders : !folders && view === state.cardView));
  }
}
function renderCollectionFolders() {
  const root = $('#results'), topics = localCollections(), signature = JSON.stringify(topics), tree = topicTree(topics);
  moreResultsObserver?.disconnect(); resultsPosts = [];
  if (!root.querySelector('.collection-folders')) {
    flushActiveNote(); disposeCardLayout(); disposeEmbeds(root);
    root.innerHTML = '<section class="collection-folders" aria-label="Topics"></section>';
  }
  const folders = root.querySelector('.collection-folders');
  if (folders.dataset.signature === signature) return;
  const focused = folders.contains(document.activeElement) ? document.activeElement.dataset.openCollection : null;
  folders.dataset.dropRoot = '';
  folders.innerHTML = tree.length ? tree.map(topic => `<button type="button" class="collection-folder" data-open-collection="${esc(topic.name)}" ${topic.id ? `data-collection-id="${esc(topic.id)}" data-drag-topic="${esc(topic.id)}" data-drop-topic="${esc(topic.id)}"` : ''} aria-label="${esc(topic.name)} · ${savesLabel(topic.count)}${topic.children.length ? ` · ${topic.children.length} ${topic.children.length === 1 ? 'subfolder' : 'subfolders'}` : ''}" title="${esc(topic.description || topic.name)}"><span class="collection-folder-art" aria-hidden="true"><svg viewBox="0 0 160 120" fill="none"><path class="folder-back" d="M12 12h40c5 0 8 2 11 6l6 8h79v76c0 7-5 12-12 12H24c-7 0-12-5-12-12Z"/><path class="folder-front" d="M24 34h112c7 0 12 5 12 12v56c0 7-5 12-12 12H24c-7 0-12-5-12-12V46c0-7 5-12 12-12Z"/></svg><span class="collection-folder-count">${topic.count.toLocaleString()}</span></span><span class="collection-folder-label">${esc(topic.name)}</span>${topic.children.length ? `<span class="collection-folder-sub">${topic.children.length} ${topic.children.length === 1 ? 'subfolder' : 'subfolders'}</span>` : ''}</button>`).join('') : '<p class="sidebar-empty">No topics yet.</p>';
  folders.dataset.signature = signature;
  if (focused) [...folders.querySelectorAll('[data-open-collection]')].find(button => button.dataset.openCollection === focused)?.focus({ preventScroll: true });
}
function localCollectionMenu(trigger, point) {
  const topic = state.topicCatalog.find(topic => topic.id === trigger.dataset.collectionId);
  if (!topic || state.demo) return;
  const hasChildren = state.topicCatalog.some(t => t.parentId === topic.id);
  const parents = state.topicCatalog.filter(t => canNest(state.topicCatalog, topic.id, t.id));
  // Right-clicking one of several shift-clicked topics acts on all of them.
  const selected = state.filters.topics.includes(topic.name) ? state.topicCatalog.filter(t => t.id && state.filters.topics.includes(t.name)) : [];
  openAccountMenu(trigger, [
    { label: 'Rename', run: () => collectionDialog(topic, 'rename') },
    ...(!hasChildren && parents.length ? [{ label: 'Move into…', run: () => moveTopicDialog(topic, parents) }] : []),
    ...(topic.parentId ? [{ label: 'Move to top level', run: () => moveTopic(topic.id, null) }] : []),
    selected.length > 1
      ? { label: `Delete all ${selected.length}`, danger: true, run: () => collectionDialog(selected, 'delete') }
      : { label: 'Delete', danger: true, run: () => collectionDialog(topic, 'delete') }
  ], point, 'Topic options');
}
function moveTopicDialog(topic, parents) {
  showModal(`<h2>Move “${esc(topic.name)}” into…</h2><div class="move-topic-list">${parents.map(parent => `<button type="button" class="nav-item" data-move-parent="${esc(parent.id)}">${icon('folder')}<span class="nav-label-text">${esc(parent.name)}</span></button>`).join('')}</div>`);
  for (const button of modal.querySelectorAll('[data-move-parent]')) button.onclick = () => { modal.close(); void moveTopic(topic.id, button.dataset.moveParent); };
  modal.querySelector('[data-move-parent]')?.focus({ preventScroll: true });
}
function collectionDialog(chosen, action) {
  const deleting = action === 'delete', topics = [chosen].flat(), topic = topics[0], many = topics.length > 1;
  const nested = topics.some(item => state.topicCatalog.some(t => t.parentId === item.id && !topics.includes(t)));
  showModal(`<h2>${deleting ? many ? `Delete ${topics.length} topics?` : 'Delete topic?' : 'Rename topic'}</h2>${deleting ? many ? `<p>Are you sure you want to delete ${topics.map(item => `“${esc(item.name)}”`).join(', ')}? Their saves will stay in your library and be removed from these topics.${nested ? ' Their subfolders move to the top level.' : ''}</p>` : `<p>Are you sure you want to delete “${esc(topic.name)}”? Its saves will stay in your library and be removed from this topic.${nested ? ' Its subfolders move to the top level.' : ''}</p>` : ''}<form id="collection-edit-form">${deleting ? '' : `<label>Topic name<input name="name" value="${esc(topic.name)}" maxlength="80" required autocomplete="off"></label>`}<p class="form-error" role="alert"></p><div class="collection-dialog-actions"><button class="secondary" type="button" id="cancel-collection-edit">Cancel</button><button class="primary ${deleting ? 'collection-delete' : ''}" type="submit">${deleting ? many ? `Delete ${topics.length}` : 'Delete' : 'Rename'}</button></div></form>`);
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
    // Several topics are deleted one by one. If one fails, the ones already gone stay gone and the dialog lists what's left.
    const show = (data, done) => {
      collectionVersion++;
      state.posts = notes.overlay(data.posts); state.topicCatalog = data.topics;
      state.filters.topics = state.filters.topics.flatMap(name => { const item = done.find(t => t.name === name); return !item ? [name] : deleting ? [] : [data.topic.name]; });
      updateCollection();
    };
    const done = []; let data = null;
    try {
      for (const item of topics) {
        data = await api(`/topics/${item.id}`, { method: deleting ? 'DELETE' : 'PATCH', ...(deleting ? {} : { body: { name: $('input', form).value.trim() } }) });
        done.push(item);
      }
      show(data, done);
      if (form.isConnected) modal.close();
      toast(deleting ? many ? `${topics.length} topics deleted` : 'Topic deleted' : 'Topic renamed', false, 'bottom-center');
    } catch (failure) {
      if (done.length) { show(data, done); topics.splice(0, done.length); }
      error.textContent = done.length ? `${failure.message} ${done.length} deleted; ${topics.length} left.` : failure.message;
      controls.forEach(control => control.disabled = false);
    }
  };
}
function setTopicsView(view) {
  state.topicsView = view;
  try { localStorage.setItem('savex-topics-view', view); } catch { /* Keep the session's view. */ }
  if (view === 'folders') { state.filters = defaultFilters(); state.query = ''; const search = $('#search'); if (search) search.value = ''; }
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
let browsingHandles = '';
function updateSidebarSelection() {
  // A post saved by several accounts opens as the one being browsed.
  const handles = state.filters.accounts.map(value => value.split(':')[1]).filter(handle => handle?.startsWith('@'));
  if (window.saveXDesktop?.browsingAccounts && handles.join() !== browsingHandles) { browsingHandles = handles.join(); void window.saveXDesktop.browsingAccounts(handles); }
  document.querySelectorAll('[data-filter]').forEach(button => {
    const active = !state.archive && (button.dataset.filter === 'all' ? !state.filters.aiActivity && !state.filters.sources.length && !state.filters.accounts.length && !state.filters.topics.length && !state.filters.collections?.length && !state.filters.collection : state.filters.accounts.includes(`${button.dataset.filter}:*`) || !state.filters.accounts.length && state.filters.sources.length === 1 && state.filters.sources[0] === button.dataset.filter);
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
  for (const [selector, view] of [['[data-ai-done-nav]', 'done'], ['[data-today-nav]', 'today']]) { const row = $(selector); if (row) { const active = !state.archive && state.filters.aiActivity === view; row.classList.toggle('active', active); row.setAttribute('aria-pressed', String(active)); } }
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
    if (/^(?:instagram|pinterest):/.test(item.dataset.navAccount || '') && state.filters.collection) return false;
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
    const [platform, handle] = collection ? [collection.platform || 'instagram',collection.account] : value.split(':');
    const label = all ? 'all sources' : collection ? `${platformName(platform)} ${collection.account} · ${collection.name}` : ['x', 'pinterest', 'threads'].includes(platform) && handle.startsWith('@') ? `${platformName(platform)} ${handle}` : platformName(platform);
    const rect = item.getBoundingClientRect();
    let button = previous.get(value);
    if (!button) {
      button = document.createElement('button'); button.type = 'button';
      button.className = 'sidebar-account-refresh'; button.dataset.action = all ? 'refresh-all' : collection ? 'refresh-collection' : 'refresh-account'; button.dataset.syncAccount = value;
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
          <div id="pinterest-navigation"></div>
          <div id="threads-navigation"></div>
          </div>
          <div id="sidebar-collections-panel" role="tabpanel" aria-labelledby="sidebar-collections-tab" ${state.sidebarView === 'collections' ? '' : 'hidden'}><div id="topic-navigation"></div></div>
        </div>
      </nav>
      ${SHOW_ARCHIVE ? `<div class="sidebar-footer"><button class="nav-item archive-nav" data-action="archive-view" aria-label="Archived ${posts.length - live.length}" aria-pressed="false" title="Archived">${icon('archive')}<span class="nav-label-text">Archived</span><span class="nav-count">${posts.length - live.length}</span></button></div>` : ''}
      <div class="sidebar-organize"><button class="organize-button" type="button" data-action="organize-topics">${icon('sparkle')}${dotLoader('organize')}<span class="organize-label"></span></button></div>
      <div class="sidebar-selection-marks"></div>
    </aside>
    <main class="main">
      <div class="page-content">
        <h1 class="sr-only">${esc(state.filters.topics.join(', ') || selectedAccountLabel() || ({ all: 'All saves', x: 'X', instagram: 'Instagram', pinterest: 'Pinterest', threads: 'Threads', chrome: 'Chrome bookmarks' }[selectedSource()]))}</h1>
        <div class="search-tools"><div class="search-scrim" aria-hidden="true"></div><div class="search-slot"><label class="search">${icon('search')}<input id="search" type="search" placeholder="Search" value="${esc(state.query)}" aria-label="Search saves" aria-keyshortcuts="${macKeyboard ? 'Meta' : 'Control'}+F"><button class="search-hint" type="button" hidden></button><button class="search-clear" type="button" aria-label="Clear search" title="Clear search">${icon('close')}</button><kbd aria-label="${macKeyboard ? 'Command' : 'Control'} F">${searchKeys}</kbd></label></div>
        <div class="view-toggle" role="group" aria-label="Post layout"><button type="button" data-action="topics-view" data-topics-view="folders" aria-label="Folder view" title="Folder view" hidden>${icon('folder')}</button>${['feed', 'grid'].map(view => `<button type="button" data-action="card-view" data-card-view="${view}" aria-label="${view === 'feed' ? 'Feed' : 'Grid'} view" title="${view === 'feed' ? 'Feed' : 'Grid'} view" aria-pressed="${state.cardView === view}">${icon(view)}</button>`).join('')}</div></div>
        <div class="collection-tools"><div class="toolbar-blur" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
          <div class="browse-controls"><button class="filter-button" id="open-filters" data-action="filters" aria-label="Filters" aria-haspopup="dialog" aria-expanded="false">${icon('filter')}<span>Filters</span><span class="filter-count" hidden></span></button><div id="active-filters" class="active-filters" hidden></div></div>
        </div>
        ${state.demo ? '<div class="demo-banner"><span>Sample saves</span><button data-action="exit-demo">Close</button></div>' : ''}
        <div class="ai-results-loader" role="status" aria-label="Searching" hidden><div class="ai-progress-card">${dotLoader('search', 'large')}<div class="ai-progress-text"><p class="ai-progress"></p><div class="ai-progress-bar" aria-hidden="true"><i></i></div><p class="ai-progress-found"></p><p class="ai-progress-names"></p></div></div></div><div id="document-results" hidden></div><div id="results"></div>
      </div>
    </main>
  </div>`;
  const search = $('#search');
  paintSearchHint();
  search.onpointerdown = () => rememberSearchView();
  search.onfocus = e => { if (!state.query && (!searchReturnView || searchReturnView.scope !== resultsScopeKey())) rememberSearchView(e.relatedTarget); };
  search.onblur = () => { search.scrollLeft = 0; if (!state.query) searchReturnView = null; };
  search.onkeydown = e => {
    if (e.key !== 'Enter' || e.isComposing) return;
    e.preventDefault();
    if (searchFocused) { clearTimeout(searchTimer); if (state.query) renderResults(); leaveSearchFocus(); search.blur(); }
  };
  const bar = search.closest('.search');
  // While it's centred, clicking the bar's padding keeps the cursor in it, and leaving it any other way puts it back.
  bar.onmousedown = e => { if (searchFocused && e.target !== search) e.preventDefault(); };
  bar.addEventListener('focusout', e => { if (searchFocused && document.hasFocus() && !bar.contains(e.relatedTarget)) leaveSearchFocus(); });
  $('.search-clear', bar).onmousedown = e => e.preventDefault();
  const aiButton = $('.search-hint', bar);
  aiButton.onmousedown = e => e.preventDefault();
  aiButton.onclick = e => { e.preventDefault(); clearTimeout(searchTimer); renderResults(); void startAiSearch(); if (searchFocused) { leaveSearchFocus(); search.blur(); } };
  $('.search-clear', bar).onclick = e => { e.preventDefault(); dismissSearch(); };
  $('.search-scrim').onclick = () => { leaveSearchFocus(); search.blur(); };
  search.oninput = e => {
    if (e.target.value && !state.query && !searchReturnView) rememberSearchView();
    state.query = e.target.value;
    fitSearchWidth();
    if (aiLocalActive) meaningSearch.search(state.query);
    if (state.query.trim() !== aiResults.query) stopAiSearch();
    paintSearchHint();
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
  fitSearchWidth();
  syncMeaningSearch();
  renderFilterUI();
  const documentsFound = renderDocumentResults();
  if (showingCollectionFolders()) { renderCollectionFolders(); return; }
  const posts = filteredPosts();
  const pageKey = resultsScopeKey();
  const pageChanged = pageKey !== resultsPageKey;
  if (pageChanged) { resultsPageKey = pageKey; resultsLimits.clear(); }
  const restoring = restoreView?.scope === pageKey;
  if (restoring) { resultsLimits.clear(); for (const [key, limit] of restoreView.limits) resultsLimits.set(key, limit); }
  // Moving to another view, from the sidebar, a topic or the filters, always starts at the top (user's decision). Typing a search
  // doesn't count, since it has its own way back, and Show post scrolls to its post after this.
  const viewKey = JSON.stringify([state.archive, state.filters]);
  if (viewKey !== resultsViewKey) { const first = resultsViewKey === undefined; resultsViewKey = viewKey; if (!first && !restoring) window.scrollTo({ left: scrollX, top: 0, behavior: 'instant' }); }
  resultsPosts = posts;
  $('.ai-results-loader')?.classList.toggle('is-alone', !posts.length);
  if (!posts.length && aiBusy) { moreResultsObserver?.disconnect(); disposeCardLayout(); disposeEmbeds(); $('#results').innerHTML = ''; return; }
  if (!posts.length && showingChromeSetup()) { moreResultsObserver?.disconnect(); disposeCardLayout(); disposeEmbeds(); renderChromeSetup(); return; }
  if (!posts.length && emptySourcePlatform()) { moreResultsObserver?.disconnect(); disposeCardLayout(); disposeEmbeds(); renderSourceConnect(); return; }
  if (!posts.length && documentsFound) { moreResultsObserver?.disconnect(); disposeCardLayout(); disposeEmbeds(); $('#results').innerHTML = ''; return; }
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
// What the Download step says, so it's clear the folder landed, or was brought up to date, and where.
function chromeHelperSavedText() {
  const saved = chromeSetup.saved;
  if (!saved) return 'A folder named <b>saveXtension Chrome helper</b> goes to your Downloads.';
  const where = '<b>Downloads › saveXtension Chrome helper</b>';
  const also = saved.alsoUpdated?.length ? ` Also updated the copy Chrome already uses${saved.alsoUpdated.length > 1 ? ` (${saved.alsoUpdated.length} folders)` : ''}: press reload on saveXtension in Chrome’s extensions page.` : '';
  const version = saved.version ? ` version ${esc(saved.version)}` : '';
  const what = !saved.updated ? `Saved${version} to ${where}.`
    : saved.previousVersion && saved.previousVersion !== saved.version ? `Updated ${where} from ${esc(saved.previousVersion)} to ${esc(saved.version)}.`
    : `Replaced ${where} with a fresh copy of${version || ' this version'}.`;
  return `${what}${also}`;
}
function chromeHelperSteps() {
  const step = (done, content, action = '') => `<li class="${done ? 'is-done' : ''}"><div class="chrome-setup-step"><div>${content}</div>${action}</div></li>`;
  return `<ol class="chrome-setup-steps">
        ${step(chromeSetup.saved, `<strong>Download the extension</strong><p>${chromeHelperSavedText()}</p>`, `<div class="chrome-setup-actions"><button class="secondary ${chromeSetup.justSaved ? 'is-saved' : ''}" type="button" data-action="save-chrome-helper">${chromeSetup.justSaved ? `${icon('check')}Saved` : `${icon('download')}Download`}</button>${chromeSetup.saved ? `<button class="secondary" type="button" data-action="open-downloads">Show in ${/Win/.test(navigator.platform) ? 'Explorer' : 'Finder'}</button>` : ''}</div>`)}
        ${step(false, '<strong>Open Chrome’s extensions page</strong><p>Or type <code>chrome://extensions</code> in Chrome’s address bar.</p>', '<button class="secondary" type="button" data-action="open-chrome-extensions">Open in Chrome</button>')}
        ${step(false, '<strong>Turn on Developer mode</strong><p>It’s the switch in the top-right corner of that page.</p>')}
        ${step(false, '<strong>Click Load unpacked and choose the folder</strong><p>Pick <b>saveXtension Chrome helper</b> from your Downloads.</p>')}
      </ol>`;
}
function refreshSetupPanel() { renderChromeHelperPage(); renderChromeHelperSettings(); if ($('.source-connect')) renderSourceConnect(); else if (showingChromeSetup()) renderChromeSetup(); }
// The Chrome helper shows as one small status line. Connecting it has its own page.
function chromeHelperState(from = '') {
  const helper = state.sync?.chromeBrowser;
  if (!helper?.online) return 'disconnected';
  // Deleting a bookmark needs a helper new enough to do it.
  if (from === 'unsave' && !helper.bookmarkDelete) return 'outdated';
  return ['x', 'instagram', 'pinterest'].every(site => helper.chromeSessionSites?.includes(site)) ? 'connected' : 'outdated';
}
function chromeHelperRow(from) {
  const current = chromeHelperState(), label = { connected: 'Connected', outdated: 'Needs update', disconnected: 'Not connected' }[current];
  const hint = current === 'connected' ? 'Adding an account uses your sign-in in Chrome, with no password.' : 'Connect it to add accounts using your sign-in in Chrome, with no password.';
  return `<div class="chrome-helper-row" title="${hint}"><span class="chrome-helper-status is-${current}"><span class="chrome-setup-dot" aria-hidden="true"></span>Chrome extension<span class="chrome-helper-state">${label}</span></span>${current === 'connected' ? '' : `<button class="text-button" type="button" data-action="chrome-helper-page" data-from="${from}">${current === 'outdated' ? 'Update' : 'Connect'}</button>`}</div>`;
}
const chromeLinkVisual = () => `<span class="chrome-link-visual" aria-hidden="true"><span class="chrome-link-node">${sourceIcon('chrome')}</span><span class="chrome-link-path"><i></i><i></i><i></i></span><span class="chrome-link-node">${icon('bookmark')}</span></span>`;
function renderChromeHelperSettings() {
  const status = $('#chrome-helper-settings'), about = $('#chrome-helper-about'); if (!status || !about) return;
  const current = chromeHelperState(), checking = current !== 'disconnected' && !!state.sync?.chromeBrowser?.checking;
  const label = checking ? 'Checking…' : { connected: 'Connected', outdated: 'Needs update', disconnected: 'Not connected' }[current];
  // The app can't reach Chrome, only hear from it, so Check again waits for the helper's next check-in, a few seconds while it's running.
  const again = current === 'disconnected' ? '' : `<button class="icon-button chrome-helper-refresh ${checking ? 'is-checking' : ''}" type="button" data-action="check-chrome-helper" aria-label="Check again" title="Check again" ${checking ? 'disabled' : ''}>${icon('refresh')}</button>`;
  const statusHtml = `<span class="chrome-helper-status is-${checking ? 'checking' : current}"><span class="chrome-setup-dot" aria-hidden="true"></span><span class="chrome-link-label">${label}</span></span>${again}`;
  const aboutHtml = current === 'connected'
    ? '<p class="settings-panel-text">Adding an account now uses your sign-in in Chrome, with no password. For X, switch to that account in Chrome first.</p>'
    : `<p class="settings-panel-text">${current === 'outdated' ? 'Your extension needs a quick update before it can do this.' : 'Add accounts in one click using your Chrome logins, with no passwords.'}</p><button class="secondary" type="button" data-action="chrome-helper-page" data-from="settings">${current === 'outdated' ? 'Update extension' : 'Connect extension'}</button>`;
  if (status.dataset.html !== statusHtml) { status.innerHTML = statusHtml; status.dataset.html = statusHtml; }
  if (about.dataset.html !== aboutHtml) { about.innerHTML = aboutHtml; about.dataset.html = aboutHtml; }
}
// Adding an account without the extension first offers the frictionless way, or the normal login.
let pendingSignIn = null;
function extensionReadyFor(platform) { const helper = state.sync?.chromeBrowser; return !!helper?.online && !!helper.chromeSessionSites?.includes(platform); }
function connectAccount(options, onStart = () => {}) {
  const start = async () => { onStart(); try { return await window.saveXDesktop.connectSocial(options); } catch (failure) { toast(failure.message, true); } };
  if (extensionReadyFor(options.platform)) return start();
  pendingSignIn = { name: platformName(options.platform), start };
  signInPrompt();
}
function presentSheet(content) {
  sheet.innerHTML = `<button class="icon-button modal-close" type="button" data-action="close-sheet" aria-label="Close dialog">${icon('close')}</button>${content}`;
  if (!sheet.open) sheet.showModal();
  if (modal.open && !modal.classList.contains('is-behind')) sinkModal();
}
function signInPrompt() {
  chromeHelperFrom = '';
  presentSheet(`<span class="chrome-setup-icon" aria-hidden="true">${sourceIcon('chrome')}</span><h2 id="sheet-title" class="sheet-prompt-title">Use your Chrome login <br>for ${esc(pendingSignIn.name)}?</h2><p class="chrome-setup-lead">Connect the Chrome extension to use that login here, with no password.</p><div class="sheet-actions"><button class="primary" type="button" data-action="chrome-helper-page" data-from="signin">Connect extension and use Chrome login</button><button class="secondary" type="button" data-action="continue-sign-in">Sign in manually</button></div>`);
}
let chromeHelperFrom = '';
// A sheet slides up over whatever is open. Settings stays alive underneath, sunk back and dimmed.
const sheet = $('#sheet');
sheet.addEventListener('close', () => aiActivity.flushAnnouncements());
glideSize(sheet);
function chromeHelperPage(from) {
  chromeHelperFrom = from;
  const label = from === 'settings' ? 'Settings' : 'Back';
  presentSheet(`<button class="text-button chrome-helper-back" type="button" data-action="chrome-helper-back" aria-label="${from === 'settings' ? 'Back to settings' : 'Back'}">${icon('chevron')}${label}</button><h2 id="sheet-title">Connect the Chrome extension</h2>${from === 'unsave' ? '<p class="chrome-setup-lead">Deleting a Chrome bookmark goes through the saveXtension extension in Chrome, so it has to be connected.</p>' : ''}<div id="chrome-helper-page"></div>`);
  renderChromeHelperPage();
}
// The dialog below tucks behind the sheet like a stacked card: resized to the sheet's height and
// lined up so only a sliver of its top edge shows above it.
const SHEET_PEEK = 14;
function placeModalBehindSheet() {
  const sheetHeight = sheet.offsetHeight, height = Math.max(40, sheetHeight - 24);
  modal.style.height = `${height}px`;
  modal.style.translate = `0 ${(innerHeight - sheetHeight) / 2 - SHEET_PEEK - (innerHeight - height) / 2}px`;
}
function sinkModal() {
  clearTimeout(modalRiseTimer);
  modal.dataset.stacking = 'true';
  modal.style.height = `${modal.offsetHeight}px`; void modal.offsetHeight;
  modal.classList.add('is-behind');
  placeModalBehindSheet();
}
let modalRiseTimer;
function raiseModal() {
  if (!modal.classList.contains('is-behind')) return;
  const current = modal.offsetHeight;
  modal.style.height = ''; const natural = modal.offsetHeight;
  modal.style.height = `${current}px`; void modal.offsetHeight;
  modal.classList.remove('is-behind');
  modal.style.translate = ''; modal.style.height = `${natural}px`;
  modalRiseTimer = setTimeout(() => { modal.style.height = ''; delete modal.dataset.stacking; }, 400);
}
new ResizeObserver(() => { if (modal.classList.contains('is-behind')) placeModalBehindSheet(); }).observe(sheet);
addEventListener('resize', () => { if (modal.classList.contains('is-behind')) placeModalBehindSheet(); }, { passive: true });
function closeSheet() {
  pendingSignIn = null;
  if (!sheet.open || sheet.dataset.closing) return;
  raiseModal();
  sheet.classList.add('is-closing');
  const finish = () => { sheet.close(); sheet.classList.remove('is-closing'); delete sheet.dataset.closing; };
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { finish(); return; }
  sheet.dataset.closing = 'true';
  const leaving = sheet.animate([{ translate: '0 0' }, { translate: '0 100vh' }], { duration: 280, easing: 'cubic-bezier(.4,0,.8,.6)', fill: 'forwards' });
  leaving.onfinish = () => { finish(); leaving.cancel(); };
}
sheet.addEventListener('cancel', event => { event.preventDefault(); closeSheet(); });
sheet.addEventListener('click', event => { if (event.target !== sheet) return; const box = sheet.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) closeSheet(); });
function renderChromeHelperPage() {
  const root = $('#chrome-helper-page'); if (!root) return;
  const current = chromeHelperState(chromeHelperFrom);
  // Any connected extension can share bookmarks, so that page has done its job: show the import.
  if (chromeHelperFrom === 'bookmarks' && current !== 'disconnected') { closeSheet(); return; }
  const [title, detail] = {
    connected: ['Connected to Chrome', chromeHelperFrom === 'unsave' ? 'Close this and choose Delete from Chrome on the bookmark again.' : 'Adding an account now uses your sign-in there. For X, switch to that account in Chrome first.'],
    outdated: ['Your extension needs updating', 'Download it again and load that folder in place of the old one.'],
    disconnected: ['Waiting for Chrome', 'This connects by itself once the extension is loaded.']
  }[current];
  const link = `<div class="chrome-link is-${current}" role="status" aria-live="polite">${chromeLinkVisual()}<div class="chrome-link-text"><strong>${title}</strong><span>${detail}</span></div></div>`;
  const carryOn = current === 'connected' && pendingSignIn ? `<div class="sheet-actions"><button class="primary" type="button" data-action="continue-sign-in">Continue to ${esc(pendingSignIn.name)}</button></div>` : '';
  const html = current === 'connected' ? `${link}${carryOn}` : `${chromeHelperSteps()}${link}`;
  if (root.dataset.html !== html) { root.innerHTML = html; root.dataset.html = html; }
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
    body = `<p class="chrome-setup-lead">saveXtension couldn’t find Chrome’s bookmarks on this computer. Work computers often keep them somewhere unusual. A small Chrome extension can share them instead.</p>
      ${chromeHelperRow('bookmarks')}
      ${online ? `<p class="chrome-setup-status is-connected" role="status" aria-live="polite"><span class="chrome-setup-dot" aria-hidden="true"></span>${helper.bookmarksReady ? 'Reading your bookmarks…' : 'Allow bookmarks in the saveXtension extension to continue.'}</p>` : ''}`;
  }
  const html = `<section class="chrome-setup" aria-labelledby="chrome-setup-title"><span class="chrome-setup-icon" aria-hidden="true">${sourceIcon('chrome')}</span><h2 id="chrome-setup-title">${chromeSetup.found === false && !received ? 'Connect Chrome to bring in your bookmarks' : 'Import your Chrome bookmarks'}</h2>${body}</section>`;
  if (!root.querySelector(':scope > .chrome-setup') || root.dataset.chromeSetup !== html) { root.innerHTML = html; root.dataset.chromeSetup = html; }
}
// Refreshing everything in the desktop app covers what is connected and skips the rest;
// connecting is offered on each source's own empty page instead.
function connectedTargets(targets) {
  const native = state.sync?.nativeSocial; if (!native?.enabled) return targets.filter(target => !['pinterest', 'threads'].includes(target));
  const connected = new Set(native.accounts.filter(account => account.status === 'connected').map(account => account.platform));
  return targets.filter(target => target === 'chrome' || connected.has(target));
}
// An X or Instagram page with no saves offers to sign in, or to sync once signed in.
const sourceConnect = { awaiting: null };
function emptySourcePlatform() {
  if (!state.sync?.nativeSocial?.enabled || state.demo || state.archive || state.query.trim()) return null;
  const platform = selectedSource(), filters = state.filters;
  if (!['x', 'instagram', 'pinterest', 'threads'].includes(platform) || filters.topics.length || filters.collections?.length || filters.collection || filters.accounts.some(value => value.startsWith(`${platform}:@`))) return null;
  return allPosts().some(post => post.platform === platform && !post.archived) ? null : platform;
}
function sourceSyncRequest(platform) { return { ...selectedSyncRequest(), targets: [platform], xAccount: platform === 'x' ? 'all' : 'current', instagramAccount: 'current', pinterestAccount: 'current' }; }
function renderSourceConnect() {
  const root = $('#results'), platform = emptySourcePlatform(); if (!root || !platform) return;
  const name = platformName(platform), what = platform === 'x' ? 'bookmarks' : platform === 'pinterest' ? 'saved pins' : 'saved posts';
  const accounts = state.sync.nativeSocial.accounts.filter(account => account.platform === platform && account.status === 'connected');
  const job = state.sync.job, syncing = state.syncChecking || ['queued', 'running'].includes(job?.status) && job.targets?.includes(platform);
  // Signing in from this page brings the saves in as soon as the account connects.
  if (accounts.length && sourceConnect.awaiting === platform && !syncing) { sourceConnect.awaiting = null; void startSync('quick', sourceSyncRequest(platform)); }
  const html = accounts.length
    ? `<section class="chrome-setup source-connect" aria-labelledby="source-connect-title"><span class="chrome-setup-icon" aria-hidden="true">${sourceIcon(platform)}</span><h2 id="source-connect-title">No ${name} saves yet</h2><p class="chrome-setup-lead">Connected as ${accounts.map(account => `<b>${esc(account.handle)}</b>`).join(', ')}. Bring in your ${what}; nothing on ${name} changes.</p><div class="chrome-setup-actions"><button class="primary" type="button" data-action="sync-source" data-platform="${platform}" ${syncing ? 'disabled' : ''}>${syncing ? 'Syncing…' : `Sync ${name} now`}</button></div></section>`
    : `<section class="chrome-setup source-connect" aria-labelledby="source-connect-title"><span class="chrome-setup-icon" aria-hidden="true">${sourceIcon(platform)}</span><h2 id="source-connect-title">Connect ${name}</h2><p class="chrome-setup-lead">Sign in once and your ${name} ${what} show up here. You sign in on ${name}’s own page, so saveXtension never sees your password.</p><div class="chrome-setup-actions"><button class="primary" type="button" data-action="connect-source" data-platform="${platform}">Sign in to ${name}</button></div>${chromeHelperRow('')}${sourceConnect.awaiting === platform ? `<p class="chrome-setup-status is-waiting" role="status" aria-live="polite"><span class="chrome-setup-dot" aria-hidden="true"></span>Finish signing in in the ${name} window. Your ${what} start syncing right after.</p>` : ''}</section>`;
  if (!root.querySelector(':scope > .source-connect') || root.dataset.sourceConnect !== html) { root.innerHTML = html; root.dataset.sourceConnect = html; }
}
const CARD_BATCH_SIZE = 24;
const resultsLimits = new Map();
let resultsPageKey, resultsViewKey, resultsPosts = [], resultsTimeKey = '';
function rememberSearchView(focus = document.activeElement) {
  if (state.query || !$('#results')) return;
  const visible = [...document.querySelectorAll('#results .save-card:not([hidden])')].map(card => ({ id: card.dataset.postId, rect: card.getBoundingClientRect() })).filter(({rect}) => rect.height && rect.bottom > 0 && rect.top < innerHeight).sort((a,b) => Math.abs(a.rect.top) - Math.abs(b.rect.top));
  searchReturnView = { scope: resultsScopeKey(), limits: [...resultsLimits], x: scrollX, y: scrollY, anchor: visible[0] ? { id: visible[0].id, top: visible[0].rect.top } : null, focus: focus === $('#search') ? null : focus };
}
// The search bar grows with what's typed: leftward in the toolbar, stopping at a limit or before the filter chips, and
// outward when centred. Only past that does its text scroll.
const SEARCH_WIDTH = 318, SEARCH_WIDTH_LIMIT = 760, SEARCH_CHROME = 188, CENTRED_WIDTH = 620, CENTRED_WIDTH_LIMIT = 900, CENTRED_CHROME = 96;
let searchMeasure = null, searchSettle = 0;
function searchTextWidth(search, size) {
  searchMeasure ??= document.createElement('canvas').getContext('2d');
  const style = getComputedStyle(search), spacing = parseFloat(style.letterSpacing) || 0;
  searchMeasure.font = `${style.fontWeight} ${size}px ${style.fontFamily}`;
  return searchMeasure.measureText(search.value).width + spacing * search.value.length;
}
function fitSearchWidth() {
  const tools = $('.search-tools'), search = $('#search');
  if (!tools || !search) return;
  const bar = search.closest('.search');
  if (!search.value) { tools.style.removeProperty('width'); bar.style.removeProperty('--centred-width'); }
  else {
    bar.style.setProperty('--centred-width', `${Math.round(Math.min(CENTRED_WIDTH_LIMIT, Math.max(CENTRED_WIDTH, searchTextWidth(search, 17) + CENTRED_CHROME)))}px`);
    if (tools.closest('[data-folder-view="true"]')) tools.style.removeProperty('width');
    else {
      const right = tools.getBoundingClientRect().right;
      const filters = [...document.querySelectorAll('.collection-tools :is(.filter-button, .filter-chip, .active-filters > .text-button)')].reduce((edge, item) => Math.max(edge, item.getBoundingClientRect().right), 0);
      const room = Math.max(SEARCH_WIDTH, Math.min(SEARCH_WIDTH_LIMIT, right - filters - 12));
      tools.style.width = `${Math.round(Math.min(room, Math.max(SEARCH_WIDTH, searchTextWidth(search, 13) + SEARCH_CHROME)))}px`;
    }
  }
  // While the bar widens, the browser scrolls the text to keep the cursor in view, and it never scrolls back.
  clearTimeout(searchSettle);
  searchSettle = setTimeout(() => { if (search.isConnected && search.scrollWidth <= search.clientWidth) search.scrollLeft = 0; }, 220);
}
window.addEventListener('resize', fitSearchWidth);
// ⌘F floats the search bar to the centre over a dimmed library, and it glides back to its place in the toolbar afterwards.
// It moves by size and position rather than scale, so its text stays sharp the whole way.
let searchFocused = false, searchMove = null;
function moveSearch(bar, centred) {
  const from = bar.getBoundingClientRect();
  searchMove?.cancel();
  bar.classList.add('is-centred'); bar.classList.toggle('is-leaving', !centred);
  const to = (centred ? bar : bar.parentElement).getBoundingClientRect(), box = rect => ({ left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
  const settle = () => { if (!centred) bar.classList.remove('is-centred', 'is-leaving'); };
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { searchMove = null; settle(); return; }
  const move = searchMove = bar.animate([box(from), box(to)], { duration: centred ? 300 : 260, easing: 'cubic-bezier(.22,.68,.2,1)', fill: 'forwards' });
  move.onfinish = () => { settle(); move.cancel(); if (searchMove === move) searchMove = null; };
}
function enterSearchFocus() {
  const bar = $('.search'); if (!bar || searchFocused) return;
  searchFocused = true; $('.search-scrim').classList.add('is-on'); moveSearch(bar, true);
}
function leaveSearchFocus() {
  if (!searchFocused) return;
  searchFocused = false; const bar = $('.search'); if (!bar) return;
  $('.search-scrim').classList.remove('is-on'); moveSearch(bar, false);
}
function dismissSearch() {
  const previous = searchReturnView, search = $('#search');
  leaveSearchFocus(); stopAiSearch();
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
  const sequence = inOwnOrder();
  const displayed = new Set(preservePlayers ? [...document.querySelectorAll('#results .save-card')].map(card => card.dataset.postId) : []);
  resultsTimeKey = addedTimeKey(resultsPosts, now);
  for (const post of resultsPosts) {
    const group = sequence ? {key:'source-sequence',label:''} : addedTimeGroup(libraryAddedAt(post), now);
    if (!groups.has(group.key)) groups.set(group.key, { ...group, posts: [] });
    const section = groups.get(group.key); section.posts.push(post);
    // New saves and moving time boundaries must not evict mounted players.
    if (displayed.has(String(post.id))) resultsLimits.set(group.key, Math.max(resultsLimits.get(group.key) || CARD_BATCH_SIZE, section.posts.length));
  }
  const sections = [...groups.values()].map(group => ({ ...group, limit: resultsLimits.get(group.key) || CARD_BATCH_SIZE }));
  reconcileCards(sections); renderUnsaving();
  observeMoreResults();
  requestAnimationFrame(alignDocumentResults);
}
function renderFilterUI() {
  if (state.filters.collection) {
    const collection = (state.instagramCollections || []).find(c => String(c.id) === String(state.filters.collection));
    if (collection) state.filters.collectionName = collection.name;
  }
  renderAccountNavigation(); renderTopicNavigation();
  requestAnimationFrame(syncToolbar);
  const folder = id => (state.instagramCollections || []).find(c => String(c.id) === String(id));
  const chips = filterChips(state.filters, { collectionName: id => folder(id)?.name, collectionPlatform: id => folder(id)?.platform || 'instagram', collectionAccount: id => folder(id)?.account }), button = $('#open-filters'), badge = $('.filter-count');
  if (badge) { badge.hidden = !chips.length; badge.textContent = chips.length; }
  button?.classList.toggle('has-filters', !!chips.length);
  const active = $('#active-filters');
  if (active) {
    active.hidden = !chips.length;
    active.innerHTML = chips.map(c => `<button class="filter-chip${c.linked ? ' is-linked' : ''}" data-remove-filter="${c.key}" aria-label="${esc(c.removeLabel || `Remove ${c.key} filter`)}" title="${esc(c.title || c.label)}">${c.platform ? sourceIcon(c.platform) : c.icon ? icon(c.icon, 'filter-chip-icon') : ''}${esc(c.label)} ${icon('close')}</button>`).join('') + '<button class="text-button filter-more" data-action="filters" hidden></button>';
    fitFilterChips();
  }
  updateSidebarSelection();
  const folders = showingCollectionFolders();
  $('.page-content').dataset.folderView = String(folders);
  const tools = $('.collection-tools'); if (tools) tools.hidden = folders;
  if (button) button.hidden = folders;
  syncViewToggle();
  const topicCount = folders ? localCollections().length : 0;
  const heading = $('.page-content h1'); if (heading) { heading.textContent = folders ? `${topicCount} ${topicCount === 1 ? 'topic' : 'topics'}` : state.archive ? 'Archived' : state.filters.aiActivity === 'today' ? 'New saves' : state.filters.aiActivity === 'done' ? 'Processed today' : state.filters.aiActivity ? 'AI activity' : state.filters.collectionName || state.filters.topics.join(', ') || selectedAccountLabel() || ({ all: 'All saves', x: 'X', instagram: 'Instagram', chrome: 'Chrome bookmarks' }[selectedSource()]); heading.className = state.archive ? 'collection-heading' : 'sr-only'; }
  renderSidebarMarkers();
}
function filterDialog() {
  const current = state.filters, posts = allPosts().filter(post => !!post.archived === state.archive);
  const arranged = state.archive || state.demo ? [] : state.topicCatalog.map(t => t.name);
  const topics = [...new Set([...arranged, ...posts.flatMap(p => p.topics).filter(name => !arranged.includes(name)).sort()])];
  const accounts = accountOptions(posts, state.sync?.xAccounts?.accounts || [], { pinterest: !state.demo && !!state.sync?.nativeSocial?.enabled });
  const accountName = value => value.platform === 'chrome' ? 'Chrome bookmarks' : value.label === platformName(value.platform) ? value.label : `${platformName(value.platform)} ${value.label}`;
  const folders = [...new Set(posts.filter(p => p.platform === 'chrome').flatMap(p => p.folders || []))].sort();
  const chosen = value => current.accounts.length ? current.accounts.includes(value.value) || current.accounts.includes(`${value.platform}:*`) : current.sources.includes(value.platform);
  showModal(`<div class="filter-heading"><h2>Filters</h2></div><form id="filters-form"><div class="filter-fields">
    <fieldset class="filter-section" hidden><legend title="When each post first entered saveXtension">Date added</legend><div id="date-range"></div></fieldset>
    <fieldset class="filter-section"><legend>Accounts</legend><div class="filter-choices"><label class="filter-choice"><input type="checkbox" id="all-filter-sources" ${!current.sources.length && !current.accounts.length ? 'checked' : ''}><span>All</span></label>${accounts.map(value => `<label class="filter-choice account-choice" title="${esc(accountName(value))}"><input type="checkbox" name="accounts" value="${esc(value.value)}" aria-label="${esc(accountName(value))}" ${chosen(value) ? 'checked' : ''}><span>${sourceIcon(value.platform)}<span class="${value.label.startsWith('@') ? 'account-handle' : ''}">${esc(value.label)}</span></span></label>`).join('')}</div></fieldset>
    ${topics.length ? `<fieldset class="filter-section" aria-label="Topics"><legend class="filter-topics-heading"><span>Topics</span><label class="filter-topics-search">${icon('search')}<input id="filter-topics-search" type="search" placeholder="Find a topic" aria-label="Search topics" autocomplete="off"></label></legend><div class="filter-choices" id="filter-topic-choices">${topics.map(t => `<label class="filter-choice"><input type="checkbox" name="topics" value="${esc(t)}" ${current.topics.includes(t) ? 'checked' : ''}><span>${icon('folder')}${esc(t)}</span></label>`).join('')}</div><p class="filter-topics-empty" id="filter-topics-empty" role="status" hidden>No matching topics</p></fieldset>` : ''}
    <label id="filter-folder-group" hidden>Chrome folder<select id="bookmark-folder" name="folder" aria-label="Bookmark folder"><option value="">All bookmark folders</option>${folders.map(f => `<option value="${esc(f)}" ${current.folder === f ? 'selected' : ''}>${esc(f)}</option>`).join('')}</select></label>
    </div><footer class="filter-footer"><p id="filter-error" class="form-error" role="alert"></p><button class="secondary" type="button" id="clear-filter-draft">Clear all</button><button class="primary" type="submit" id="show-filtered-saves">Show saves</button></footer></form>`);
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
  let preserveCollection = true, cleared = false;
  function draft() {
    const data = new FormData(form), accounts = data.getAll('accounts');
    const keepCollection = preserveCollection && (!accounts.length || accounts.some(a => a.startsWith('instagram:')));
    return { ...defaultFilters(), ...(cleared ? {} : timeline.value()), collection: keepCollection ? current.collection : '', collectionName: keepCollection ? current.collectionName : '', sources: [...new Set(accounts.map(value => value.split(':')[0]))], accounts, topics: data.getAll('topics'), folder: data.get('folder') || '' };
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
  // Back to All with no topic chosen. It stays open, so Show applies it and the close button still leaves things as they were.
  $('#clear-filter-draft').onclick = () => {
    form.querySelectorAll('[name="accounts"], [name="topics"]').forEach(input => { input.checked = false; });
    if (topicSearch) { topicSearch.value = ''; searchTopics(); }
    $('#bookmark-folder').value = '';
    preserveCollection = false; cleared = true;
    preview();
  };
  form.onsubmit = e => { e.preventDefault(); const selected = draft(); if (dateBounds(selected).error) return; state.filters = selected; modal.close(); renderResults(); $('#open-filters')?.focus(); };
  preview();
}
function bookmarkPreview(p) {
  const u = new URL(p.url);
  const folders = (p.folders || []).filter(f => !/^(Other bookmarks|Bookmarks bar|Mobile bookmarks)$/i.test(f));
  return `<div class="bookmark-preview" data-website-url="${esc(p.url)}"><span class="bookmark-host"><span class="bookmark-browser" role="img" aria-label="Chrome bookmark">${sourceIcon('chrome')}</span><span>${esc(u.hostname.replace(/^www\./, ''))}</span></span><a class="bookmark-title" href="${esc(p.url)}" title="${esc(p.bookmarkTitle || p.title || p.url)}" target="_blank" rel="noopener noreferrer">${esc(p.bookmarkTitle || u.hostname)}</a><a class="bookmark-media" href="${esc(p.url)}" aria-label="Open ${esc(p.bookmarkTitle || u.hostname)}" target="_blank" rel="noopener noreferrer" hidden><img alt="" decoding="async"></a><p class="bookmark-description" hidden></p></div><div class="bookmark-folders">${folders.map(f => `<span title="${esc(f)}">${esc(f)}</span>`).join('')}</div>`;
}
// Instagram and Pinterest cards leave out the block of hashtags that ends a caption, to keep them tidy. X and Threads cards keep all their text. Only the display changes: the saved
// text, search, MCP and the opened post all keep them. A single tag ending a sentence stays, as it's part of the sentence.
function previewCaption(caption) {
  const tags = caption.match(/#[^\s#]+(?:\s*#[^\s#]+)*\s*$/u);
  if (!tags) return caption;
  const before = caption.slice(0, tags.index);
  if (!/(?:^|\n)[ \t]*$/.test(before) && !tags[0].trim().slice(1).includes('#')) return caption;
  return before.replace(/(?:\s*\n[ \t.·•_\-–—]*)+$/, '').trimEnd() || caption;
}
const clearDescriptionButton = '<button class="ai-seen-clear" type="button" data-ask-clear-description>Clear</button>';
function aiSeenMarkup(p, open = false) {
  return `<details class="ai-seen" data-description-post="${p.id}" ${open ? 'open' : ''}><summary aria-label="What AI saw in this image" title="What AI saw in this image">${icon('sparkle')}</summary><div class="ai-seen-panel"><div class="ai-seen-head"><strong>${p.imageDescriptionModel ? `Generated using ${esc(p.imageDescriptionModel)}` : 'Generated using AI'}</strong>${clearDescriptionButton}</div><p>${esc(p.imageDescription)}</p></div></details>`;
}
// Scanning one post by hand. Only Claude Code or Codex can see images, so the button only shows when one is installed.
const scanningImages = new Set();
let aiScanModel = '';
const scanLabel = () => `Scan using ${aiScanModel || 'AI'}`;
function scanButtonMarkup(id) {
  const busy = scanningImages.has(id);
  return `<button class="ai-scan-button" type="button" data-scan-post="${id}" ${busy ? 'disabled data-busy="true"' : ''} aria-label="${busy ? 'Scanning this image' : scanLabel()}">${busy ? dotLoader('scan') : icon('sparkle')}<span class="ai-scan-label">${busy ? 'Scanning…' : scanLabel()}</span></button>`;
}
async function scanImage(id) {
  if (scanningImages.has(id)) return;
  const runId = Date.now(), activityKey = `scan:${id}:${runId}`;
  const place = () => document.querySelector(`.save-card[data-post-id="${id}"] [data-scan-post]`);
  scanningImages.add(id);
  place()?.replaceWith(Object.assign(document.createElement('template'), { innerHTML: scanButtonMarkup(id) }).content);
  aiActivity.upsert({ key: activityKey, serverRef: activityKey, kind: 'scan', loaderKind: 'search', state: 'running', title: 'Scanning image', detail: 'Looking closely at the saved image…', postId: id });
  try {
    const { description, model } = await api('/ai-search/scan', { method: 'POST', body: { post: id } });
    scanningImages.delete(id);
    const post = state.posts.find(item => item.id === id);
    if (post) { post.imageDescription = description; post.imageDescriptionModel = model; }
    place()?.replaceWith(Object.assign(document.createElement('template'), { innerHTML: aiSeenMarkup({ id, imageDescription: description, imageDescriptionModel: model }, true) }).content);
    aiActivity.upsert({ key: activityKey, serverRef: activityKey, kind: 'scan', loaderKind: 'search', state: 'done', title: 'Image described', detail: description || 'Ready for search.', postId: id });
    syncMeaningSearch();
  } catch (error) {
    scanningImages.delete(id);
    place()?.replaceWith(Object.assign(document.createElement('template'), { innerHTML: scanButtonMarkup(id) }).content);
    aiActivity.upsert({ key: activityKey, serverRef: activityKey, kind: 'scan', loaderKind: 'search', state: 'failed', title: 'Couldn’t scan image', detail: error.message, postId: id });
    toast(error.message, true, 'bottom-center');
  }
}
document.addEventListener('click', event => { const button = event.target.closest?.('[data-scan-post]'); if (button) { event.preventDefault(); void scanImage(Number(button.dataset.scanPost)); } });
// Clears one post's description, so the next scan or AI search reads its image again.
async function clearImageDescription(id, button) {
  button.disabled = true;
  try {
    await api('/ai-search/scan', { method: 'DELETE', body: { post: id } });
    const post = state.posts.find(item => item.id === id);
    if (post) { post.imageDescription = ''; post.imageDescriptionModel = ''; }
    document.querySelectorAll(`[data-description-post="${id}"]`).forEach(seen => seen.replaceWith(Object.assign(document.createElement('template'), { innerHTML: scanButtonMarkup(id) }).content));
    syncMeaningSearch();
  } catch (error) { button.disabled = false; toast(error.message, true, 'bottom-center'); }
}
// A click anywhere outside closes an open description. A click on the picture behind it only
// closes it, so dismissing doesn't also open the post.
document.addEventListener('click', event => {
  const path = event.composedPath();
  document.querySelectorAll('.ai-seen[open]').forEach(seen => {
    if (path.includes(seen)) return;
    seen.open = false;
    // In the grid a click anywhere on a card opens its post, so that counts as well.
    const onCard = path.includes(seen.closest('.save-card')) && !event.target.closest?.('a,button,input,textarea,select,label,.card-note');
    if (path.includes(seen.closest('.embed-capture-image-wrap')) || onCard) { event.preventDefault(); event.stopPropagation(); }
  });
}, true);
// Clear asks first, in place: a tick goes ahead and a cross puts Clear back.
const swapInto = (element, markup) => { const content = Object.assign(document.createElement('template'), { innerHTML: markup }).content, first = content.firstElementChild; element.replaceWith(content); return first; };
document.addEventListener('click', event => {
  const ask = event.target.closest?.('[data-ask-clear-description]'), keep = event.target.closest?.('[data-keep-description]'), yes = event.target.closest?.('[data-clear-description]');
  if (!ask && !keep && !yes) return;
  event.preventDefault();
  if (ask) swapInto(ask, `<span class="ai-seen-confirm"><span>Are you sure?</span><button type="button" data-clear-description aria-label="Yes, clear this description" title="Yes, clear it">${icon('check')}</button><button type="button" data-keep-description aria-label="No, keep this description" title="No, keep it">${icon('close')}</button></span>`).querySelector('[data-keep-description]').focus({ focusVisible: false });
  else if (keep) swapInto(keep.closest('.ai-seen-confirm'), clearDescriptionButton).focus({ focusVisible: false });
  else void clearImageDescription(Number(yes.closest('[data-description-post]').dataset.descriptionPost), yes);
});
document.addEventListener('toggle', event => { const confirm = !event.target.open && event.target.matches?.('.ai-seen') && event.target.querySelector('.ai-seen-confirm'); if (confirm) swapInto(confirm, clearDescriptionButton); }, true);
function embedMetadata(p, savedCard = false, preview = false) {
  const handle = p.author ? `@${String(p.author).replace(/^@+/, '')}` : '';
  const name = p.authorName || handle || platformName(p.platform);
  const fullCaption = p.text || (p.title !== p.authorName ? p.title : '') || '', caption = preview && !['x', 'threads'].includes(p.platform) ? previewCaption(fullCaption) : fullCaption;
  const image = p.localImage || p.thumbnail || p.media?.[0];
  const published = Number.isFinite(Date.parse(p.publishedAt));
  const date = published ? p.publishedAt : libraryAddedAt(p);
  const dated = Number.isFinite(Date.parse(date));
  const added = libraryAddedAt(p), addedTime = Date.parse(added);
  const addedLabel = savedCard && Number.isFinite(addedTime) ? `<time class="embed-capture-added" datetime="${esc(added)}" title="Added to saveXtension on ${esc(new Date(addedTime).toLocaleString())}">${esc(addedWhen(added))}</time>` : '';
  return `<div class="embed-placeholder"><div class="embed-capture-header">${sourceIcon(p.platform)}<div class="embed-capture-author"><span class="embed-capture-name"><strong>${esc(name)}</strong>${addedLabel}</span>${handle && p.authorName && p.authorName.toLowerCase() !== handle.slice(1).toLowerCase() ? `<span>${esc(handle)}</span>` : ''}</div><a class="icon-button embed-open-original" href="${esc(p.url)}" aria-label="Open original post" target="_blank" rel="noopener noreferrer">${icon('arrow')}</a></div>${image ? `${savedCard ? `<div class="embed-capture-image-wrap"><a class="embed-capture-image-link" href="${esc(p.url)}" aria-label="${p.kind === 'video' ? 'Play this video' : 'Open this post'}" target="_blank" rel="noopener noreferrer">` : ''}<img class="embed-capture-image" src="${esc(image)}" alt="" loading="${p.localImage ? 'eager' : 'lazy'}" decoding="async" referrerpolicy="no-referrer">${savedCard && p.kind === 'video' ? '<span class="embed-play" aria-hidden="true"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l11-6.5a1 1 0 0 0 0-1.72l-11-6.5A1 1 0 0 0 8 5.5Z"/></svg></span>' : ''}${savedCard ? `</a>${p.localImage ? `<span class="image-saved" tabindex="0" aria-label="Downloaded locally">${icon('double-tick')}<span class="image-saved-label">Downloaded locally</span></span>` : ''}${p.imageDescription ? aiSeenMarkup(p) : p.localImage ? scanButtonMarkup(p.id) : ''}</div>` : ''}` : ''}${caption ? `<p class="embed-capture-text">${esc(caption)}</p>` : `<a class="embed-capture-link" href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">${esc(p.url)}</a>`}${dated && !savedCard ? `<time class="embed-capture-date" datetime="${esc(date)}" title="${esc(new Date(date).toLocaleString())}">${published ? '' : 'Added '}${esc(relative(date))}</time>` : ''}<div class="embed-loading" role="status"><span class="embed-loading-spinner" aria-hidden="true"></span><span>Loading preview…</span></div></div>`;
}
// An image link can expire before a copy is saved, so drop the picture instead of showing it broken.
function watchSavedImages(cards) {
  if (cards.dataset.watchingImages) return;
  cards.dataset.watchingImages = 'true';
  cards.addEventListener('error', event => { if (event.target.matches?.('.embed-capture-image')) (event.target.closest('a') || event.target).hidden = true; }, true);
}
function nativePreview(p) {
  if (p.platform === 'chrome') return bookmarkPreview(p);
  const supported = !!embedTarget(p.url);
  // Cards show only what was saved. The live post loads when someone opens it.
  if (!LIVE_CARD_PREVIEWS) return `<section class="saved-preview">${embedMetadata(p, true, true)}</section>`;
  return `<section class="native-embed" data-post-url="${esc(p.url)}" data-embed-state="${supported ? 'pending' : 'failed'}" aria-busy="${supported}"><div class="embed-stage">${embedMetadata(p)}</div><div class="embed-error" ${supported ? 'hidden' : ''}><p>This post can’t be loaded right now.</p><div><button type="button" class="text-button" data-embed-retry>Retry</button><a href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">Open original</a></div></div></section>`;
}
function noteOpen(post) {
  const status = noteStates.get(noteKey(post));
  return state.cardView === 'feed' || openNoteIds.has(post.id) || noteAiOpen.has(post.id) || noteAiRunning(post.id) || !!notes.value(post).trim() || status === 'error' || status === 'saving' || status === 'pending';
}
function instagramCollectionLabel(post) {
  if (!['instagram', 'pinterest'].includes(post.platform) || state.archive || state.filters.collection || state.filters.topics.length) return '';
  const accounts = state.filters.accounts.filter(value => value.startsWith(`${post.platform}:`));
  const names = (post.collections || []).map(item => ({ ...state.instagramCollections.find(collection => String(collection.id) === String(item.id)), ...item }))
    .filter(collection => typeof collection.name === 'string' && collection.name.trim() && (!accounts.length || accounts.includes(`${post.platform}:*`) || accounts.includes(`${post.platform}:${collection.account?.toLowerCase()}`)))
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
    const collections = ['instagram', 'pinterest'].includes(post.platform) ? [...new Set(memberships.filter(collection => collection.account?.toLowerCase() === account.toLowerCase() && (!state.filters.collection || String(collection.id) === String(state.filters.collection))).map(collection => collection.name).filter(Boolean))].sort((a,b) => a.localeCompare(b)) : [];
    return [account, ...collections].join(' · ');
  }).join(' · ') || platformName(post.platform);
}
function feedCardSource(post) {
  const label = feedSourceLabel(post);
  return `<span class="feed-source-pill" data-label="${esc(label)}" title="${esc(`${platformName(post.platform)} · ${label}`)}"><span class="card-platform" role="img" aria-label="${esc(platformName(post.platform))}">${sourceIcon(post.platform)}</span><span class="feed-source-label">${esc(label)}</span></span>`;
}

function card(p) {
  const native = p.platform !== 'chrome' && !!embedTarget(p.url), showNote = noteOpen(p), canUnsave = state.localMode && !state.demo && (p.platform === 'chrome' || native && p.platform !== 'threads' && (p.platform !== 'pinterest' || (p.collections || []).some(item => item.platform === 'pinterest')) && (p.accounts || []).some(account => /^@[\w.]+$/.test(account))), unsaveLabel = p.platform === 'chrome' ? 'Delete from Chrome' : `Unsave on ${platformName(p.platform)}`, canDoc = state.localMode && !state.demo, docBusy = docAiRunning(p.id), docLabel = docBusy ? `${docAiJob?.step || 'Sending to document'}…` : 'Send to document';
  return `<article class="save-card ${p.platform} ${native ? 'has-native-embed' : ''}" data-post-id="${p.id}"><div class="card-content">
    <div class="card-body">
    <header class="card-header"><div class="card-actions"><button class="icon-button" data-action="copy-post" aria-label="Copy post reference" title="Copy post reference">${icon('copy')}</button><button class="icon-button" data-action="copy-post-link" aria-label="Copy post link" title="Copy post link">${icon('link')}</button>${canDoc ? `<button class="icon-button" data-action="send-to-document" ${docBusy ? 'data-busy="true"' : ''} aria-label="${esc(docLabel)}" title="${esc(docLabel)}">${docBusy ? dotLoader('write') : icon('file')}</button>` : ''}${native && LIVE_CARD_PREVIEWS ? `<button class="icon-button" data-action="retry-preview" aria-label="Retry post preview" title="Retry preview">${icon('refresh')}</button>` : ''}<button class="icon-button" data-archive="${p.id}" ${SHOW_ARCHIVE ? '' : 'hidden'} aria-label="${p.archived ? 'Restore save' : 'Archive save'}" title="${p.archived ? 'Restore to saves' : 'Archive'}">${icon(p.archived ? 'restore' : 'archive')}</button>${canUnsave ? `<button class="icon-button unsave-button" data-action="unsave" aria-label="${unsaveLabel}" title="${unsaveLabel}">${icon('unsave')}</button>` : ''}<button class="icon-button note-button" data-open="${p.id}" aria-label="Edit note" title="Edit note" aria-expanded="${showNote}" aria-controls="note-section-${p.id}">${icon('pencil')}</button></div>${cardPlatform(p)}</header>
    <div class="card-layout">${feedCardSource(p)}<section class="card-note" id="note-section-${p.id}" ${showNote ? '' : 'hidden'}><label class="sr-only" for="note-${p.id}">Note</label><div class="note-editor"><textarea class="note-input" id="note-${p.id}" name="notes" rows="3" maxlength="10000" placeholder="${state.cardView === 'feed' ? 'No notes added yet.' : 'Add a note…'}" ${state.demo || noteAiRunning(p.id) ? 'readonly' : ''}>${esc(notes.value(p))}</textarea><div class="note-link-preview" hidden></div></div><button type="button" class="note-more" data-action="toggle-note-preview" hidden>Read more</button>${noteFoot(p)}</section>
    <div class="card-preview">${nativePreview(p)}</div>
    <footer class="card-footer"><button type="button" class="collection-add" data-action="add-collection" aria-label="Add to topic" title="Add to topic" aria-haspopup="dialog" aria-controls="collection-picker" aria-expanded="false" ${state.demo ? 'disabled' : ''}>${icon('plus')}</button><div class="card-tags">${[...new Set(p.topics)].map(t => `<span class="tag-pill"><button type="button" class="tag-icon" data-action="remove-topic" data-topic-name="${esc(t)}" aria-label="Remove from “${esc(t)}”" title="Remove from this topic"${state.demo ? ' disabled' : ''}>${icon('folder', 'tag-folder')}${icon('close', 'tag-close')}</button><button class="tag" data-topic="${esc(t)}">${esc(t)}</button></span>`).join('')}</div></footer></div>
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
// A notice can't show over the post panel, because the post is a native view on top of the page, so the panel's buttons answer for themselves.
// "link" copies only the post's address; otherwise it's the reference for an AI client.
async function copyPostReference(button, quiet = false, kind = 'reference') {
  const id = Number(button.closest('[data-post-id]')?.dataset.postId), post = allPosts().find(post => post.id === id);
  if (!post) return false;
  const reference = kind === 'link' ? post.url : postReference(post);
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
    if (!quiet) toast(kind === 'link' ? 'Link copied' : 'Reference copied', false, 'bottom-center');
    return true;
  } catch { if (!quiet) toast(`Couldn’t copy ${kind}. Try again.`, true, 'bottom-center'); return false; }
}
function sizeNote(field) {
  if (CSS.supports('field-sizing','content') || !field.getClientRects().length) return;
  field.style.height = '0px'; field.style.height = `${Math.max(document.activeElement === field ? 66 : 22,field.scrollHeight)}px`;
}
// In the one-column view a long note grows in place, up to a height where it scrolls. The grid has no room, so there it opens in the note view.
const expandedNotes = new Set();
function syncNotePreview(field) {
  if (!field.isConnected) return;
  const button = field.closest('.card-note').querySelector('.note-more'), id = Number(field.closest('.save-card')?.dataset.postId);
  let expanded = state.cardView === 'feed' && expandedNotes.has(id);
  if (expanded) field.dataset.expanded = 'true'; else delete field.dataset.expanded;
  syncNoteLinks(field);
  sizeNote(field);
  const focused = document.activeElement === field, long = field.scrollHeight > parseFloat(getComputedStyle(field).lineHeight) * 6 + 1;
  // A note edited down to a few lines has nothing left to expand.
  if (expanded && !long) { expandedNotes.delete(id); expanded = false; delete field.dataset.expanded; }
  if (!focused && !expanded) field.scrollTop = 0;
  button.hidden = focused || !long;
  button.textContent = expanded ? 'Show less' : 'Read more';
  button.setAttribute('aria-expanded', String(expanded));
}
function setNoteExpanded(field, expanded) {
  const id = Number(field.closest('.save-card').dataset.postId);
  if (expanded) expandedNotes.add(id); else expandedNotes.delete(id);
  syncNotePreview(field);
  glideNote(field);
}
const observedNotes = new Set();
const notePreviewObserver = new ResizeObserver(entries => { for (const {target} of entries) { noteHeightSeen(target); syncNotePreview(target); } });
function observeNotePreviews(root) {
  for (const field of observedNotes) if (!field.isConnected) { notePreviewObserver.unobserve(field); observedNotes.delete(field); }
  for (const field of root.querySelectorAll('.note-input')) {
    if (!observedNotes.has(field)) { observedNotes.add(field); noteHeightSeen(field); notePreviewObserver.observe(field); }
    syncNotePreview(field);
  }
}
// Filling a note with AI, one post at a time, only when someone asks. The server does the work and adds to the note.
// A note asked for while another runs waits its turn, and starts by itself. Each post's latest job is kept here.
const noteAiJobs = new Map();
let noteAiFollowing = false;
const noteAiBusyState = job => job?.state === 'running' || job?.state === 'waiting';
// The usual question. Tab in an empty prompt box fills it in, ready to run with Enter.
const NOTE_AI_PRESET = 'What is the post about?';
const noteAiOpen = new Set(), noteAiDrafts = new Map(), noteAiErrors = new Map(), noteAiUndo = new Map(), noteAiChoice = new Map();
let noteAiModels = [];
// Running or waiting: either way the note is spoken for.
const noteAiRunning = id => noteAiBusyState(noteAiJobs.get(id));
const noteAiWaitLabel = job => job.position > 1 ? `Waiting · ${job.position} notes ahead` : job.waitingFor === 'document' ? 'Waiting for a document to finish' : 'Waiting for the other note';
function noteAiBoxInner(id) {
  const job = noteAiJobs.get(id);
  if (job?.state === 'running') return `<div class="note-ai-working" role="status">${dotLoader('write', 'tiny')}<span class="note-ai-step">${esc(job.step || 'Starting')}…</span><button type="button" class="note-ai-cancel" data-note-ai-cancel>Cancel</button></div><p class="note-ai-asked">${esc(job.request)}</p>`;
  if (job?.state === 'waiting') return `<div class="note-ai-working is-waiting" role="status">${icon('clock')}<span class="note-ai-step">${esc(noteAiWaitLabel(job))}…</span><button type="button" class="note-ai-cancel" data-note-ai-cancel>Cancel</button></div><p class="note-ai-asked">${esc(job.request)}</p>`;
  if (!aiTool) return `<div class="note-ai-off"><span>Turn on Claude Code, Codex or DeepSeek to use this.</span><button type="button" class="note-ai-cancel" data-action="settings">Open Settings</button></div>`;
  const error = noteAiErrors.get(id);
  return `<label class="sr-only" for="note-ai-input-${id}">What should go in this note?</label><textarea class="note-ai-input" id="note-ai-input-${id}" rows="1" maxlength="2000" placeholder="${NOTE_AI_PRESET} · Tab to use it">${esc(noteAiDrafts.get(id) || '')}</textarea>${error ? `<p class="note-ai-error">${esc(error)}</p>` : ''}<p class="note-ai-hint">Enter to run with ${noteAiModels.length ? `<select class="note-ai-model" aria-label="Model for this note">${noteAiModels.map(model => `<option value="${esc(model.id)}" ${model.id === noteAiChoice.get(id) ? 'selected' : ''}>${esc(model.name)}</option>`).join('')}</select>` : esc(aiToolModel)}</p>`;
}
function noteFoot(p) {
  const undo = noteAiUndo.get(p.id), canAsk = state.localMode && !state.demo, open = noteAiOpen.has(p.id) || noteAiRunning(p.id);
  return `<div class="note-foot"><span class="note-status" role="status" aria-live="polite"></span>${undo && undo.after === notes.value(p) ? `<button type="button" class="note-ai-undo" data-note-ai-undo="${p.id}">Undo</button>` : ''}${canAsk ? `<button type="button" class="note-ai-button" data-note-ai="${p.id}" aria-expanded="${open}" aria-label="Fill this note with AI" title="Fill this note with AI">${icon('sparkle')}</button>` : ''}</div>${canAsk ? `<div class="note-ai-box ${open ? 'is-open' : ''}" data-note-ai-box="${p.id}"><div class="note-ai-inner">${open ? noteAiBoxInner(p.id) : ''}</div></div>` : ''}`;
}
// The AI button itself grows into the box and the box shrinks back into it, as one shape.
const NOTE_AI_MOTION = { duration: 340, easing: 'cubic-bezier(.22,.68,.2,1)' };
function morphNoteAi(box, button, opening) {
  const inner = $('.note-ai-inner', box), shown = [...inner.children];
  const midway = box.dataset.moving ? inner.getBoundingClientRect() : null;
  for (const item of [box, inner, button, ...shown]) item.getAnimations().forEach(animation => animation.cancel());
  box.classList.add('is-open');
  const pill = button.getBoundingClientRect(), full = inner.getBoundingClientRect();
  const shape = rect => [{ height: `${rect.height}px` }, { marginLeft: `${rect.left - full.left}px`, marginRight: `${full.right - rect.right}px` }];
  const [fromBox, fromInner] = shape(midway || (opening ? pill : full)), [toBox, toInner] = shape(opening ? full : pill);
  // The contents keep their final width, so the text doesn't rewrap as the shape changes.
  inner.style.setProperty('--note-ai-width', `${full.width - 24}px`);
  box.dataset.moving = opening ? 'opening' : 'closing';
  const motion = opening ? NOTE_AI_MOTION : { ...NOTE_AI_MOTION, duration: 300 };
  const main = box.animate([fromBox, toBox], motion);
  inner.animate([fromInner, toInner], motion);
  if (opening) shown.forEach(item => item.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 190, delay: 150, easing: 'ease-out', fill: 'backwards' }));
  else {
    shown.forEach(item => item.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 90, easing: 'ease-in', fill: 'forwards' }));
    inner.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, delay: 180, fill: 'forwards' });
    button.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 140, delay: 160, easing: 'ease-out', fill: 'both' });
  }
  main.finished.then(() => {
    delete box.dataset.moving;
    if (!opening) box.classList.remove('is-open');
    for (const item of [inner, button, ...shown]) item.getAnimations().forEach(animation => animation.cancel());
  }).catch(() => { /* Turned around partway, and the new motion took over. */ });
}
function paintNoteAi(id) {
  const open = noteAiOpen.has(id) || noteAiRunning(id), still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.querySelectorAll(`[data-note-ai-box="${id}"]`).forEach(box => {
    const section = box.closest('.card-note'), field = $('.note-input', section), button = $('.note-ai-button', section);
    const wasOpen = box.classList.contains('is-open') && box.dataset.moving !== 'closing';
    if (open) { $('.note-ai-inner', box).innerHTML = noteAiBoxInner(id); styleSelects(box); }
    if (wasOpen !== open && button && box.offsetParent && !still) morphNoteAi(box, button, open);
    else if (wasOpen !== open) box.classList.toggle('is-open', open);
    button?.setAttribute('aria-expanded', String(open));
    if (field) field.readOnly = !!state.demo || noteAiRunning(id);
  });
}
function focusNoteAi(id) { const input = document.querySelector(`[data-note-ai-box="${id}"] .note-ai-input`); input?.focus({ preventScroll: true }); }
// "/ai" typed at the end of what's written in a note works as a send key (user's decision). It's highlighted with a hint
// beside it: Enter sends the text before it on that line (or the line above, if "/ai" is alone) to AI and takes both out of
// the note, and anything else, like a space, leaves it as ordinary text. The highlight is drawn on a copy of the note's text
// laid behind it, because a text box can't colour part of its own text.
const AI_SEND = /(^|\s)\/ai$/i;
function aiSendAt(field) {
  const at = field.selectionStart;
  if (document.activeElement !== field || at !== field.selectionEnd || field.readOnly || state.demo) return -1;
  if (field.value.slice(at).split('\n')[0].trim() || !AI_SEND.test(field.value.slice(Math.max(0, at - 5), at))) return -1;
  const id = Number(field.closest('.card-note')?.querySelector('[data-note-ai-box]')?.dataset.noteAiBox);
  return id && !noteAiRunning(id) ? at - 3 : -1;
}
function paintAiSend(field) {
  const editor = field.parentElement, start = aiSendAt(field);
  let layer = editor.querySelector('.note-ai-send-layer');
  if (start < 0) { layer?.remove(); return; }
  if (!layer) { layer = document.createElement('div'); layer.className = 'note-ai-send-layer'; layer.setAttribute('aria-hidden', 'true'); editor.prepend(layer); }
  const look = getComputedStyle(field);
  for (const key of ['font', 'letterSpacing', 'wordSpacing', 'tabSize', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'overflowWrap', 'wordBreak', 'textIndent']) layer.style[key] = look[key];
  // 8px of room either side, so the highlight around "/ai" at the start or end of a line isn't cut off. The text inside still
  // wraps at exactly the note's width.
  const room = 8;
  Object.assign(layer.style, { left: `${field.offsetLeft - room}px`, top: `${field.offsetTop}px`, width: `${field.clientWidth + room * 2}px`, height: `${field.clientHeight}px`, paddingLeft: `calc(${look.paddingLeft} + ${room}px)`, paddingRight: `calc(${look.paddingRight} + ${room}px)` });
  const mark = document.createElement('span'), hint = document.createElement('span');
  mark.className = 'note-ai-send-mark'; mark.textContent = field.value.slice(start, start + 3);
  hint.className = 'note-ai-send-hint'; hint.textContent = '↵ Enter to send to AI';
  // The space lets the hint go to the next line on its own when it doesn't fit, so "/ai" stays where it's typed.
  layer.replaceChildren(document.createTextNode(field.value.slice(0, start)), mark, document.createTextNode(' '), hint);
  layer.scrollTop = field.scrollTop;
}
for (const type of ['input', 'keyup', 'click', 'focusin', 'focusout']) document.addEventListener(type, event => { if (event.target.matches?.('.note-input')) queueMicrotask(() => paintAiSend(event.target)); });
document.addEventListener('scroll', event => { if (event.target.matches?.('.note-input')) { const layer = event.target.parentElement.querySelector('.note-ai-send-layer'); if (layer) layer.scrollTop = event.target.scrollTop; } }, true);
document.addEventListener('keydown', event => {
  const field = event.target;
  if (event.key !== 'Enter' || event.shiftKey || event.isComposing || !field.matches?.('.note-input')) return;
  const mark = aiSendAt(field); if (mark < 0) return;
  event.preventDefault();
  const id = Number(field.closest('.card-note').querySelector('[data-note-ai-box]').dataset.noteAiBox), value = field.value, at = field.selectionStart;
  let from = value.lastIndexOf('\n', mark - 1) + 1, request = value.slice(from, mark).trim();
  if (!request && from > 0) { from = value.lastIndexOf('\n', from - 2) + 1; request = value.slice(from, mark).trim(); }
  // Take the prompt and "/ai" out, with the line they leave empty.
  let to = at;
  if (value[to] === '\n') to++; else if (from > 0) from--;
  field.setRangeText('', from, to, 'end');
  field.dispatchEvent(new Event('input', { bubbles: true }));
  paintAiSend(field);
  if (!request) { noteAiOpen.add(id); paintNoteAi(id); focusNoteAi(id); return; }
  void startNoteAi(id, request).then(() => { if (noteAiErrors.has(id)) { noteAiOpen.add(id); paintNoteAi(id); focusNoteAi(id); } });
});
async function followNoteAi() {
  if (noteAiFollowing) return;
  noteAiFollowing = true;
  try {
    while ([...noteAiJobs.values()].some(noteAiBusyState)) {
      await new Promise(resolve => setTimeout(resolve, 700));
      let jobs;
      try { ({ jobs = [] } = await api('/note-ai')); } catch { continue; }
      for (const [id, known] of noteAiJobs) {
        if (!noteAiBusyState(known)) continue;
        const job = jobs.find(item => item.post === id && item.id === known.id) || { ...known, state: 'cancelled' };
        noteAiJobs.set(id, job);
        // A waiting note that starts, or moves up the line, is redrawn. A running one only updates its step.
        if (job.state !== known.state || job.position !== known.position || job.waitingFor !== known.waitingFor) { if (noteAiBusyState(job)) { paintNoteAi(id); syncNoteAiActivity(job); } else finishNoteAi(job); }
        else if (job.state === 'running' && job.step !== known.step) { document.querySelectorAll(`[data-note-ai-box="${id}"] .note-ai-step`).forEach(step => { step.textContent = `${job.step}…`; }); syncNoteAiActivity(job); }
      }
    }
  } finally { noteAiFollowing = false; }
}
function finishNoteAi(job) {
  const { post: id, state: outcome, notes: text, before, updatedAt, error } = job;
  if (outcome === 'failed') noteAiErrors.set(id, error);
  if (outcome === 'done') {
    noteAiOpen.delete(id); noteAiDrafts.delete(id); noteAiErrors.delete(id); noteAiChoice.delete(id); noteAiUndo.set(id, { before, after: text, jobId: job.id });
    state.posts = notes.overlay(state.posts.map(item => item.id === id ? { ...item, notes: text, updatedAt } : item));
    updateCollection();
    const post = allPosts().find(item => item.id === id), card = document.querySelector(`.save-card[data-post-id="${id}"]`);
    // A note with the cursor in it is normally left alone, so typing is never overwritten. Here it was read-only while
    // the AI worked, so it holds nothing unsaved, and without this the result wouldn't show until the note lost focus.
    const cardField = post && card && $('.note-input', card);
    if (cardField && cardField.value !== notes.value(post)) cardField.value = notes.value(post);
    if (post && card) { syncCardNote(card, post); showNoteAiUndo(card, post); shineNote($('.card-note', card)); }
    const panelField = $('#post-note-input', postPanel);
    if (panelField && noteViewPost?.id === id) { panelField.value = text; syncNoteLinks(panelField); showNoteAiUndo(postPanel, post); shineNote(panelField.closest('.card-note')); }
    syncMeaningSearch();
  }
  syncNoteAiActivity(job);
  paintNoteAi(id);
  if (outcome === 'failed') focusNoteAi(id);
}
function showNoteAiUndo(within, post) {
  const foot = $('.note-foot', within); if (!foot || $('.note-ai-undo', foot)) return;
  const undo = `<button type="button" class="note-ai-undo" data-note-ai-undo="${post.id}">Undo</button>`, ask = foot.querySelector('.note-ai-button');
  if (ask) ask.insertAdjacentHTML('beforebegin', undo); else foot.insertAdjacentHTML('beforeend', undo);
}
async function startNoteAi(id, request) {
  const post = allPosts().find(item => item.id === id); if (!post || !request.trim()) return;
  noteAiErrors.delete(id); noteAiDrafts.set(id, request);
  try {
    await notes.flush(post);
    const { job } = await api('/note-ai', { method: 'POST', body: { post: id, request, model: noteAiChoice.get(id) } });
    noteAiJobs.set(id, job);
    noteAiUndo.delete(id); document.querySelectorAll(`[data-note-ai-undo="${id}"]`).forEach(button => button.remove());
    syncNoteAiActivity(job); paintNoteAi(id); void followNoteAi();
  } catch (error) { noteAiErrors.set(id, error.message); paintNoteAi(id); focusNoteAi(id); }
}
async function undoNoteAi(id, button) {
  const post = allPosts().find(item => item.id === id), undo = noteAiUndo.get(id);
  noteAiUndo.delete(id); document.querySelectorAll(`[data-note-ai-undo="${id}"]`).forEach(control => control.remove());
  if (undo?.jobId) aiActivity.upsert({ key: `note:${undo.jobId}`, canUndo: false, undone: true, detail: 'Undone — restored previous note' });
  if (!post || !undo || notes.value(post) !== undo.after) return;
  notes.edit(post, undo.before); state.posts = notes.overlay(state.posts);
  const card = document.querySelector(`.save-card[data-post-id="${id}"]`), current = allPosts().find(item => item.id === id);
  if (card && current) syncCardNote(card, current);
  const panelField = $('#post-note-input', postPanel);
  if (panelField && noteViewPost?.id === id) { panelField.value = undo.before; syncNoteLinks(panelField); }
  await notes.flush(post);
}
document.addEventListener('click', event => {
  const toggle = event.target.closest?.('[data-note-ai]'), cancel = event.target.closest?.('[data-note-ai-cancel]'), undo = event.target.closest?.('[data-note-ai-undo]');
  if (toggle) {
    event.preventDefault();
    const id = Number(toggle.dataset.noteAi);
    if (noteAiRunning(id)) return;
    if (noteAiOpen.has(id)) noteAiOpen.delete(id); else noteAiOpen.add(id);
    paintNoteAi(id); if (noteAiOpen.has(id)) focusNoteAi(id);
  } else if (cancel) {
    event.preventDefault();
    const id = Number(cancel.closest('[data-note-ai-box]')?.dataset.noteAiBox); cancel.disabled = true;
    void api('/note-ai', { method: 'DELETE', body: { post: id } }).then(({ job }) => { if (job?.post === id) noteAiJobs.set(id, job); syncNoteAiActivity(job || { id: noteAiJobs.get(id)?.id, post: id, state: 'cancelled' }); paintNoteAi(id); focusNoteAi(id); }).catch(error => { cancel.disabled = false; toast(error.message, true, 'bottom-center'); });
  } else if (undo) { event.preventDefault(); void undoNoteAi(Number(undo.dataset.noteAiUndo), undo); }
  // The button has become the box, so clicking away is what closes it. What was typed is kept for next time.
  if (toggle || !event.target.isConnected || event.target.closest?.('.select-menu')) return;
  for (const id of [...noteAiOpen]) {
    if (noteAiRunning(id) || event.target.closest?.(`[data-note-ai-box="${id}"]`)) continue;
    noteAiOpen.delete(id); paintNoteAi(id);
  }
});
document.addEventListener('change', event => { if (event.target.matches?.('.note-ai-model')) noteAiChoice.set(Number(event.target.closest('[data-note-ai-box]').dataset.noteAiBox), event.target.value); });
document.addEventListener('input', event => { if (event.target.matches?.('.note-ai-input')) noteAiDrafts.set(Number(event.target.closest('[data-note-ai-box]').dataset.noteAiBox), event.target.value); });
document.addEventListener('keydown', event => {
  if (!event.target.matches?.('.note-ai-input')) return;
  const id = Number(event.target.closest('[data-note-ai-box]').dataset.noteAiBox);
  if (event.key === 'Tab' && !event.shiftKey && !event.target.value.trim()) { event.preventDefault(); event.target.value = NOTE_AI_PRESET; noteAiDrafts.set(id, NOTE_AI_PRESET); event.target.setSelectionRange(NOTE_AI_PRESET.length, NOTE_AI_PRESET.length); return; }
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); void startNoteAi(id, event.target.value); }
  else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); noteAiOpen.delete(id); paintNoteAi(id); document.querySelector(`[data-note-ai="${id}"]`)?.focus({ preventScroll: true }); }
});
// Condensing a saved post into one of the user's documents, respecting that document's description.
let docAiJob = null, docAiFollowing = false, docAiLastDocument = '', docAiChoice = '', docAiError = '';
const docAiDrafts = new Map();
const docAiRunning = id => docAiJob?.state === 'running' && (id === undefined || docAiJob.post === id);
function paintDocAiButtons() {
  document.querySelectorAll('.save-card [data-action="send-to-document"]').forEach(button => {
    const id = Number(button.closest('.save-card')?.dataset.postId), busy = docAiRunning(id), wasBusy = button.hasAttribute('data-busy');
    button.toggleAttribute('data-busy', busy);
    if (busy !== wasBusy) button.innerHTML = busy ? dotLoader('write', 'tiny') : icon('file');
    const label = busy ? `${docAiJob?.step || 'Sending to document'}…` : 'Send to document';
    button.setAttribute('aria-label', label); button.title = label;
  });
  document.querySelectorAll('.post-panel-document').forEach(button => {
    const id = Number(button.dataset.postId), busy = docAiRunning(id), wasBusy = button.hasAttribute('data-busy');
    button.toggleAttribute('data-busy', busy);
    if (busy !== wasBusy) button.innerHTML = `${busy ? dotLoader('write') : icon('file')}<span>${busy ? 'Sending…' : 'Document'}</span>`;
    else $('span', button).textContent = busy ? 'Sending…' : 'Document';
    const label = busy ? `${docAiJob?.step || 'Sending to document'}…` : 'Send to document';
    button.title = label;
  });
  renderNewSaves();
}
function paintSendDocumentRunning() {
  if (!docAiJob || docAiJob.state !== 'running') return;
  showModal(`<div class="send-document-dialog is-running"><h2>Sending to “${esc(docAiJob.documentTitle || 'Document')}”</h2>${docAiJob.request ? `<p class="send-document-asked">${esc(docAiJob.request)}</p>` : '<p class="muted">Adding what fits this document’s description.</p>'}<div class="send-document-working" role="status">${dotLoader('write')}<span class="send-document-step">${esc(docAiJob.step || 'Reading this save')}…</span></div><div class="button-row"><button type="button" class="secondary" id="cancel-send-document">Cancel</button></div></div>`);
  modal.dataset.sendDocument = String(docAiJob.post);
  $('#cancel-send-document', modal).onclick = async event => {
    event.currentTarget.disabled = true;
    const postId = docAiJob?.post;
    try {
      ({ job: docAiJob } = await api('/document-ai', { method: 'DELETE', body: {} }));
      paintDocAiButtons();
      syncDocAiActivity(docAiJob);
      if (postId) await openSendToDocument(postId); else modal.close();
    } catch (error) { event.currentTarget.disabled = false; toast(error.message, true, 'bottom-center'); }
  };
}
async function openSendToDocument(postId) {
  const id = Number(postId), post = allPosts().find(item => item.id === id);
  if (!post || state.demo) return;
  if (!aiTool) {
    showModal(`<div class="send-document-dialog"><h2>Send to document</h2><p class="muted">Turn on Claude Code, Codex or DeepSeek in Settings to condense saved posts into your documents.</p><div class="button-row"><button type="button" class="secondary" data-action="close-modal">Cancel</button><button type="button" class="primary" data-action="settings">Open Settings</button></div></div>`);
    return;
  }
  try {
    const [{ documents }, { job }] = await Promise.all([api('/documents'), api('/document-ai')]);
    if (job?.state === 'running') {
      docAiJob = job; paintDocAiButtons(); syncDocAiActivity(job); paintSendDocumentRunning(); void followDocAi();
      return;
    }
    if (!documents.length) {
      showModal(`<div class="send-document-dialog"><h2>Send to document</h2><p class="muted">You don’t have any documents yet. Create a document first and describe what belongs in it — like a font list, colour notes or prompts.</p><div class="button-row"><button type="button" class="secondary" data-action="close-modal">Cancel</button><button type="button" class="primary" id="open-documents-drawer">${icon('plus')}<span>New document</span></button></div></div>`);
      $('#open-documents-drawer', modal).onclick = () => { modal.close(); documentUi?.openNew(doc => { docAiLastDocument = doc.id; void openSendToDocument(id); }); };
      return;
    }
    const chosenDoc = documents.find(doc => doc.id === docAiLastDocument) || documents[0];
    docAiLastDocument = chosenDoc.id;
    const chosenModel = noteAiModels.find(model => model.id === docAiChoice)?.id || noteAiModels[0]?.id || '';
    const draft = docAiDrafts.get(id) || '';
    const pick = doc => `<label class="send-document-pick"><input type="radio" name="documentId" value="${doc.id}" ${doc.id === chosenDoc.id ? 'checked' : ''}>${doc.icon ? `<span class="send-document-emoji" aria-hidden="true">${esc(doc.icon)}</span>` : icon('file')}<span>${esc(doc.title)}</span></label>`;
    const model = noteAiModels.length > 1 ? `<select name="model" class="send-document-model" aria-label="Model for this run">${noteAiModels.map(item => `<option value="${esc(item.id)}" ${item.id === chosenModel ? 'selected' : ''}>${esc(item.name)}</option>`).join('')}</select>` : `<span class="send-document-model-name">${esc(noteAiModels[0]?.name || aiToolModel)}</span>`;
    // Documents as chips to tap, and the directions in the same colourful box as the notes AI, with its send button inside.
    showModal(`<form class="send-document-dialog" id="send-document-form"><h2>Send to document</h2><fieldset class="send-document-picks"><legend class="sr-only">Document</legend>${documents.length > 8 ? `<input type="search" class="send-document-filter" placeholder="Find a document" aria-label="Find a document" autocomplete="off">` : ''}<div class="send-document-list">${documents.map(pick).join('')}</div></fieldset><div class="send-document-prompt"><textarea name="request" id="send-document-request" rows="2" maxlength="2000" aria-label="Directions, optional" placeholder="What to pull out and how to write it. Leave blank to add whatever fits.">${esc(draft)}</textarea>${docAiError ? `<p class="send-document-error" role="alert">${esc(docAiError)}</p>` : ''}<div class="send-document-prompt-foot">${model}<button class="send-document-send" type="submit" aria-label="Send to document" title="Send to document">${icon('up')}</button></div></div></form>`);
    modal.dataset.sendDocument = String(id);
    styleSelects(modal);
    const requestField = $('#send-document-request', modal), modelSelect = $('.send-document-model', modal), form = $('#send-document-form', modal);
    const pickedDocument = () => form.elements.documentId.value;
    form.onchange = event => { if (event.target.name === 'documentId') docAiLastDocument = pickedDocument(); };
    // Documents come most recently updated first, so the one last sent to leads. The list fades at an edge with more beyond it.
    const list = $('.send-document-list', modal), filter = $('.send-document-filter', modal);
    const edges = () => { list.toggleAttribute('data-more-above', list.scrollTop > 2); list.toggleAttribute('data-more-below', list.scrollTop + list.clientHeight < list.scrollHeight - 2); };
    list.onscroll = edges;
    // Measured again whenever the list or a chip changes size, since chips wrap differently once the font has loaded.
    const measure = new ResizeObserver(edges); for (const element of [list, ...list.children]) measure.observe(element);
    $('input:checked', list)?.closest('label').scrollIntoView({ block: 'nearest' });
    if (filter) {
      const shown = () => [...list.children].filter(chip => !chip.hidden);
      filter.oninput = () => {
        const words = filter.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
        for (const chip of list.children) chip.hidden = !words.every(word => chip.textContent.toLowerCase().includes(word));
        list.scrollTop = 0; edges();
      };
      // Enter picks the first match and moves on to the directions.
      filter.onkeydown = event => {
        if (event.key !== 'Enter' || event.isComposing) return;
        event.preventDefault();
        const first = shown()[0]?.querySelector('input');
        if (!first) return;
        first.checked = true; docAiLastDocument = first.value; requestField.focus({ preventScroll: true });
      };
    }
    if (modelSelect) modelSelect.onchange = () => { docAiChoice = modelSelect.value; };
    requestField.oninput = () => { docAiDrafts.set(id, requestField.value); };
    requestField.onkeydown = event => {
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); form.requestSubmit(); }
    };
    form.onsubmit = async event => {
      event.preventDefault();
      const submit = $('button[type="submit"]', form); submit.disabled = true;
      docAiError = '';
      docAiLastDocument = pickedDocument();
      docAiDrafts.set(id, requestField.value);
      try {
        await notes.flush(post);
        ({ job: docAiJob } = await api('/document-ai', { method: 'POST', body: { post: id, documentId: docAiLastDocument, request: requestField.value, model: modelSelect?.value || chosenModel } }));
        paintDocAiButtons(); syncDocAiActivity(docAiJob); paintSendDocumentRunning(); void followDocAi();
      } catch (error) {
        docAiError = error.message;
        await openSendToDocument(id);
      }
    };
    requestField.focus({ preventScroll: true });
  } catch (error) { toast(error.message, true, 'bottom-center'); }
}
async function followDocAi() {
  if (docAiFollowing) return;
  docAiFollowing = true;
  try {
    while (docAiJob?.state === 'running') {
      await new Promise(resolve => setTimeout(resolve, 700));
      let job;
      try { ({ job } = await api('/document-ai')); } catch { continue; }
      const stepChanged = job?.step !== docAiJob?.step;
      docAiJob = job;
      if (job?.state === 'running') {
        if (stepChanged) {
          paintDocAiButtons();
          syncDocAiActivity(job);
          if (modal.open && modal.dataset.sendDocument) {
            const step = $('.send-document-step', modal);
            if (step) step.textContent = `${job.step}…`;
          }
        }
        continue;
      }
      paintDocAiButtons();
      if (job) finishDocAi(job);
    }
  } finally { docAiFollowing = false; }
}
function finishDocAi(job) {
  if (job.state === 'cancelled') { syncDocAiActivity(job); return; }
  if (job.state === 'failed') {
    docAiError = job.error || 'Couldn’t update that document.';
    syncDocAiActivity(job);
    if (modal.open && modal.dataset.sendDocument) void openSendToDocument(job.post);
    return;
  }
  if (job.state !== 'done') return;
  docAiError = ''; docAiDrafts.delete(job.post);
  documentUi?.refresh(); documentUi?.reloadIfOpen(job.documentId);
  if (modal.open && modal.dataset.sendDocument) modal.close();
  syncDocAiActivity(job);
}
function syncCardNote(card, post, immediate = false, preview = true) {
  const section = $('.card-note',card), field = $('.note-input',card), label = $('.note-status',card);
  if (!field) return;
  const status = noteStates.get(noteKey(post)), focused = document.activeElement === field;
  if (!focused && !section.contains(document.activeElement) && !notes.value(post).trim() && status !== 'pending' && status !== 'saving' && status !== 'error') openNoteIds.delete(post.id);
  if (!focused && field.value !== notes.value(post)) field.value = notes.value(post);
  const shown = noteOpen(post);
  field.placeholder = state.cardView === 'feed' ? 'No notes added yet.' : 'Add a note…';
  field.readOnly = !!state.demo || noteAiRunning(post.id);
  // Undo only ever puts back what the AI changed, so editing the note by hand ends it.
  if (noteAiUndo.has(post.id) && noteAiUndo.get(post.id).after !== notes.value(post)) { noteAiUndo.delete(post.id); $('.note-ai-undo', section)?.remove(); }
  if (immediate) { finishNoteAnimation(section); section.hidden = !shown; section.dataset.noteOpen = String(shown); }
  else setNoteVisibility(section, shown);
  markNew(card, post);
  $('.note-button',card)?.setAttribute('aria-expanded',String(shown));
  label.textContent = status === 'error' ? 'Not saved yet · retrying' : status === 'pending' || status === 'saving' ? 'Saving…' : '';
  label.dataset.state = status || '';
  // A view switch resizes every note, so the preview observer measures it then.
  if (preview) syncNotePreview(field);
  field.onfocus = () => { openNoteIds.add(post.id); activeNote = post; activeNoteScope = resultsScopeKey(); syncNotePreview(field); glideNote(field); };
  // A note cut off by "Read more" opens in full when clicked anywhere. Links in it still work, and a short note edits in place.
  // Once it has grown in place, clicking it edits it.
  const opensInView = event => !event.button && !$('.note-more', section).hidden && field.dataset.expanded !== 'true' && !event.target.closest('a,.note-more,.note-ai-button,.note-ai-box,.note-ai-undo');
  section.onmousedown = event => { if (opensInView(event)) event.preventDefault(); };
  // One handler: a cut-off note opens in full, and otherwise a click anywhere on a one-column note puts the cursor in it.
  section.onclick = event => {
    if (opensInView(event)) { if (state.cardView === 'feed') setNoteExpanded(field, true); else showNoteView(allPosts().find(item => item.id === post.id) || post); return; }
    if (state.cardView === 'feed' && event.target !== field && !event.target.closest('button,a,.note-ai-box')) field.focus({ preventScroll: true });
  };
  // The layer that makes links in the note clickable has to scroll with it.
  field.onscroll = () => { const links = field.parentElement.querySelector('.note-link-preview'); if (links) links.scrollTop = field.scrollTop; };
  field.oninput = () => {
    if (state.demo) return;
    finishNoteAnimation(section);
    notes.edit(post,field.value); state.posts = notes.overlay(state.posts); syncNotePreview(field);
  };
  field.onblur = () => { if (activeNote?.id === post.id) flushActiveNote(); };
}
// Only leaving the whole note can close an empty one, or its AI button would vanish as it's pressed.
document.addEventListener('focusout', event => {
  const section = event.target.closest?.('.card-note'), card = section?.closest('.save-card');
  if (!card || section.contains(event.relatedTarget) || event.relatedTarget === $('.note-button',card)) return;
  const current = allPosts().find(post => post.id === Number(card.dataset.postId)), field = $('.note-input',card);
  if (current) syncCardNote(card,current);
  if (field) glideNote(field);
});
function editNote(id) {
  const post = allPosts().find(p => p.id === Number(id)), card = document.querySelector(`.save-card[data-post-id="${id}"]`);
  if (!post || !card) return;
  const field = $('.note-input',card), section = $('.card-note',card), button = $('.note-button',card);
  const shown = section.dataset.noteOpen === 'true';
  if (shown && !field.value.trim() && !noteAiRunning(post.id)) {
    openNoteIds.delete(post.id);
    if (noteAiOpen.delete(post.id)) paintNoteAi(post.id);
    if (activeNote?.id === post.id) flushActiveNote();
    button.setAttribute('aria-expanded','false'); setNoteVisibility(section,false); markNew(card, post);
    button.focus({preventScroll:true}); return;
  }
  openNoteIds.add(post.id); button.setAttribute('aria-expanded','true');
  setNoteVisibility(section,true,() => { sizeNote(field); field.focus({preventScroll:true}); });
  markNew(card, post);
}
window.addEventListener('resize', () => { if (!CSS.supports('field-sizing','content')) document.querySelectorAll('.note-input').forEach(sizeNote); }, {passive:true});
// Preserve the iframe itself while background sync refreshes metadata around it.
const cardVersions = new WeakMap();
// The latest AI job on a post, while it's in AI activity.
function aiPostItem(id) { let latest = null; for (const item of state.filters.aiActivity === 'done' ? processedItems() : aiActivityList) if (Number(item.postId) === id && (!latest || (item.createdAt || item.doneAt || 0) >= (latest.createdAt || latest.doneAt || 0))) latest = item; return latest; }
function aiInlineVisible(card, post, ai) {
  if (ai.state !== 'running') return false;
  if (ai.kind === 'note') {
    const section = $('.card-note', card);
    return noteAiRunning(post.id) && !section?.hidden && section?.dataset.noteOpen !== 'false';
  }
  if (ai.kind === 'document') return docAiRunning(post.id) && !!$('[data-action="send-to-document"]', card);
  if (ai.kind === 'scan') return scanningImages.has(post.id) && !!$('[data-scan-post]', card);
  return false;
}
function aiTagMarkup(item) {
  const active = item.state === 'running' || item.state === 'waiting';
  const mark = item.state === 'running' ? dotLoader(item.loaderKind || 'write', 'tiny') : icon(item.state === 'waiting' ? 'clock' : item.state === 'failed' ? 'warning' : state.filters.aiActivity === 'done' ? 'check' : 'sparkle');
  // Under Processed today the pill only says what was done, so there's nothing to tick. A finished document gets its own way in.
  const history = state.filters.aiActivity === 'done', open = item.state === 'done' && item.documentId ? `<button type="button" class="ai-tag-open" data-ai-open-document="${esc(item.documentId)}" aria-label="Open ${esc(item.documentTitle || 'document')}" title="Open ${esc(item.documentTitle || 'document')}">Open</button>` : '';
  return `<span class="ai-tag-icon" aria-hidden="true">${mark}</span><span class="ai-tag-text">${esc(item.title)}</span>${open}${active || history ? '' : `<button type="button" class="ai-tag-ack" data-ai-ack="${esc(item.key)}" aria-label="Got it: ${esc(item.title)}" title="Got it">${icon('check')}</button>`}`;
}
// Posts first added today carry a small "New" tag on the post's top edge. While AI works on a post, or has
// just finished, that spot says what it's doing or did instead, and its tick dismisses it (user's decision).
function markNew(card, post) {
  const fresh = addedTimeGroup(libraryAddedAt(post)).key === 'added-today', layout = $('.card-layout', card), ai = aiPostItem(post.id);
  let tag = $(':scope > .new-tag', layout);
  if (ai && !aiInlineVisible(card, post, ai)) {
    if (!tag?.classList.contains('ai-tag')) { tag?.remove(); tag = document.createElement('span'); tag.className = 'new-tag ai-tag'; layout.prepend(tag); }
    const html = aiTagMarkup(ai);
    if (tag.dataset.html !== html) { tag.innerHTML = html; tag.dataset.html = html; }
    tag.dataset.state = ai.state; tag.title = [ai.title, ai.detail].filter(Boolean).join(' · ');
    return;
  }
  if (tag?.classList.contains('ai-tag')) { tag.remove(); tag = null; }
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
  layoutCards(cards); observeNotePreviews(cards); if (LIVE_CARD_PREVIEWS) mountEmbeds(cards); else watchSavedImages(cards); mountWebsitePreviews(cards);
}
function updateCollection() {
  if (!$('#results')) return render();
  const posts = allPosts(), live = posts.filter(p => !p.archived);
  const counts = { all: live.length, x: live.filter(p => p.platform === 'x').length, instagram: live.filter(p => p.platform === 'instagram').length, threads: live.filter(p => p.platform === 'threads').length, chrome: live.filter(p => p.platform === 'chrome').length };
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
          notes.forget(post || {id:job.post_id,url:job.url});openNoteIds.delete(job.post_id);
          if(activeNote?.id===job.post_id)activeNote=null;
          state.posts=state.posts.filter(post=>post.id!==job.post_id);
        }else state.posts=state.posts.map(post=>post.id===job.post_id?{...post,accounts:post.accounts.filter(account=>account.toLowerCase()!==job.account.toLowerCase()),collections:(post.collections||[]).filter(collection=>collection.account?.toLowerCase()!==job.account.toLowerCase())}:post);
        collectionVersion++;updateCollection();await refresh(true);
        const message = job.verify_only || job.platform === 'chrome' ? job.message : job.phase === 'checking' ? job.deleted ? 'Removed from saveXtension.' : `Removed from ${job.account}’s saves.` : `Unsaved on ${platformName(job.platform)}.`;
        toast(message,false,'bottom-center');
      }else if(!job.verify_only)toast(job.message||'Couldn’t verify the unsave. Check the original post.',true,'bottom-center');
    }
    await api(`/unsave/${job.id}/ack`,{method:'POST',body:{}});
    if(state.sync?.unsave?.id===job.id)state.sync.unsave=null;
  }catch{ /* Retry acknowledging the result on the next heartbeat. */ }
  finally{handlingUnsave=false;void nextUnsave();}
}
// The post being unsaved keeps a quiet red overlay until the job finishes.
// Cancelled or failed jobs clear it; a success removes the card itself.
function renderUnsaving() {
  const job = state.sync?.unsave, id = ['queued', 'running'].includes(job?.status) ? job.post_id : null;
  for (const card of document.querySelectorAll('#results .save-card')) {
    const active = Number(card.dataset.postId) === id, target = $('.card-preview', card) || card;
    let overlay = $('.unsave-overlay', target);
    card.toggleAttribute('data-unsaving', active); card.setAttribute('aria-busy', String(active));
    const queued = unsaveLine.some(item => item.postId === Number(card.dataset.postId));
    let waiting = $('.unsave-queued', target);
    card.toggleAttribute('data-unsave-queued', queued);
    if (!queued) waiting?.remove();
    else if (!waiting) {
      waiting = document.createElement('div'); waiting.className = 'unsave-queued'; waiting.setAttribute('role', 'status');
      waiting.innerHTML = `<span class="unsave-label">Queued to unsave<button type="button" data-action="cancel-unsave" aria-label="Remove from the unsave queue" title="Remove from the queue">${icon('close')}</button></span>`;
      target.append(waiting);
    }
    if (!active) { overlay?.remove(); continue; }
    if (!overlay) { overlay = document.createElement('div'); overlay.className = 'unsave-overlay'; overlay.setAttribute('role', 'status'); target.append(overlay); }
    const text = job.platform === 'chrome' ? 'Deleting from Chrome…' : job.verify_only ? `Checking on ${platformName(job.platform)}…` : `Unsaving on ${platformName(job.platform)}…`;
    if (overlay.textContent !== text) overlay.innerHTML = `<span class="unsave-label"><span class="embed-loading-spinner" aria-hidden="true"></span>${esc(text)}</span>`;
  }
}
// Empty space in a grid card's own frame opens the post larger over a dark backdrop.
// A post opens in a panel that slides in from the right, and is dismissed before anything else can be used.
// The post itself is a view the desktop app lays over the panel's body, so that view follows the body as it slides.
const postPanel = $('#post-panel'), POST_OFFSCREEN = 'calc(100% + 12px) 0';
let postClosing = false, pendingNotePost = null, noteViewPost = null;
function placePost() { const view = $('.post-panel-view', postPanel); if (!view) return; const { x, y, width, height } = view.getBoundingClientRect(); return window.saveXDesktop.postBounds({ x, y, width, height }); }
function slidePost(entering) {
  const timing = { duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 280, easing: 'cubic-bezier(.22,.68,.2,1)', fill: 'forwards' };
  // The note view rises into the center; a post on its own slides in from the side.
  const away = postPanel.dataset.view === 'note' ? '0 24px' : POST_OFFSCREEN;
  const slide = postPanel.animate({ translate: entering ? [away, '0 0'] : ['0 0', away], ...(postPanel.dataset.view === 'note' ? { opacity: entering ? [0, 1] : [1, 0] } : {}) }, timing);
  postPanel.animate({ opacity: entering ? [0, 1] : [1, 0] }, { ...timing, pseudoElement: '::backdrop' });
  // The note box sits outside the panel, so it would still be on screen with the panel gone. It fades as it travels.
  if (postPanel.dataset.view !== 'note') $('.post-note', postPanel)?.animate({ opacity: entering ? [0, 1] : [1, 0] }, { ...timing, duration: entering ? timing.duration : timing.duration / 2, delay: entering ? timing.duration / 3 : 0, fill: entering ? 'backwards' : 'forwards' });
  const follow = () => { void placePost(); if (slide.playState === 'running') requestAnimationFrame(follow); };
  follow();
  return slide.finished.then(placePost);
}
// Sites lay posts out differently at each width, so each layout remembers the width chosen for it.
function postWidths() { try { return JSON.parse(localStorage.getItem('savex-post-widths')) || {}; } catch { return {}; } }
function savePostWidth(width) {
  const widths = postWidths();
  if (width) widths[postPanel.dataset.layout] = width; else delete widths[postPanel.dataset.layout];
  try { localStorage.setItem('savex-post-widths', JSON.stringify(widths)); } catch { /* It just won't be remembered. */ }
}
// "Read more" on a note: the post in the center and the whole note beside it, where it can be edited.
function showNoteView(post) {
  flushActiveNote();
  if (window.saveXDesktop?.onPost && (post.platform === 'chrome' || embedTarget(post.url))) {
    pendingNotePost = post; setTimeout(() => { if (pendingNotePost === post) pendingNotePost = null; }, 3000);
    window.open(post.url, '_blank', 'noopener,noreferrer');
  } else showPost({ layout: 'saved', notePost: post }); // No live page here, so it shows what was saved.
}
function syncNoteViewStatus(post, status) {
  if (noteViewPost?.id !== post.id) return;
  const label = $('.note-status', postPanel); if (!label) return;
  label.textContent = status === 'error' ? 'Not saved yet · retrying' : status === 'pending' || status === 'saving' ? 'Saving…' : '';
  label.dataset.state = status || '';
}
function mountNoteView(post) {
  const field = $('.note-input', postPanel);
  field.onfocus = () => { activeNote = post; activeNoteScope = resultsScopeKey(); syncNoteLinks(field); };
  field.oninput = () => { if (state.demo) return; notes.edit(post, field.value); state.posts = notes.overlay(state.posts); syncNoteLinks(field); };
  field.onblur = () => { if (activeNote?.id === post.id) flushActiveNote(); syncNoteLinks(field); };
  $('.post-note', postPanel).onclick = event => { if (!event.target.closest('a,button,.note-ai-box') && event.target !== field) field.focus(); };
  syncNoteLinks(field);
}
const POST_VIEW = '<div class="post-panel-view"><div class="post-panel-loader" role="status" aria-label="Loading post"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 4.5h10a1 1 0 0 1 1 1V20l-6-3.6L6 20V5.5a1 1 0 0 1 1-1Z"/></svg></div></div>';
const postAddress = url => String(url || '').split(/[?#]/)[0].replace(/\/$/, '');
// One post, however it's addressed: /p/ and /reel/ are the same post, and a site can add to a link as it loads.
function postIdentity(url) { const target = embedTarget(url); return target ? `${target.platform}:${target.path.split('/').pop()}` : postAddress(url); }
const panelNoteMarkup = post => post ? `<section class="card-note post-note"><label class="sr-only" for="post-note-input">Note</label><div class="note-editor"><textarea class="note-input" id="post-note-input" name="notes" data-expanded="true" maxlength="10000" placeholder="Add a note…" ${state.demo || noteAiRunning(post.id) ? 'readonly' : ''}>${esc(notes.value(post))}</textarea><div class="note-link-preview" hidden></div></div>${noteFoot(post)}</section>` : '<section class="card-note post-note post-note-none"><p>This post isn\'t in your library, so it has no note.</p></section>';
// The note is a box of its own, outside the panel on its left, so the panel stays a plain side panel and a native view can never cover the note.
// The panel can't grow past the room that box needs.
const postPanelMax = () => innerWidth - (innerWidth <= 860 ? 232 : 372);
function showPost({ layout, url, notePost = pendingNotePost }) {
  pendingNotePost = null;
  // A link to something that isn't in the library has no reference to copy, and no note.
  const identity = postIdentity(url), saved = notePost || allPosts().find(post => postIdentity(post.url) === identity);
  noteViewPost = saved || null;
  postPanel.dataset.layout = layout; postPanel.dataset.view = notePost ? 'note' : 'post';
  const width = notePost ? 0 : postWidths()[layout];
  postPanel.style.width = width ? `${width}px` : '';
  const browser = layout === 'saved' ? '' : `<button class="primary post-panel-browser" type="button" aria-label="Open in browser" title="Open in browser">${icon('globe')}</button>`;
  const canDoc = state.localMode && !state.demo, docBusy = saved && docAiRunning(saved.id), docLabel = docBusy ? `${docAiJob?.step || 'Sending to document'}…` : 'Send to document';
  const copy = saved ? `<button class="secondary post-panel-copy" type="button" data-post-id="${saved.id}" title="Copy post reference">${icon('copy')}<span>Reference</span></button><button class="secondary post-panel-copy" type="button" data-post-id="${saved.id}" data-copy="link" title="Copy post link">${icon('link')}<span>Link</span></button>${canDoc ? `<button class="secondary post-panel-copy post-panel-document" type="button" data-post-id="${saved.id}" ${docBusy ? 'data-busy="true"' : ''} title="${esc(docLabel)}">${docBusy ? dotLoader('write') : icon('file')}<span>${docBusy ? 'Sending…' : 'Document'}</span></button>` : ''}` : '';
  const header = `<header class="post-panel-header"><div class="post-panel-actions">${browser}${copy}</div><button class="icon-button post-panel-close" type="button" aria-label="Close post">${icon('close')}</button></header>`;
  const view = layout === 'saved' ? `<div class="post-panel-saved"><section class="saved-preview">${embedMetadata(saved, true)}</section></div>` : POST_VIEW;
  postPanel.innerHTML = notePost
    ? `${header}<div class="post-note-body">${view}${panelNoteMarkup(saved)}</div>`
    : `<div class="post-panel-edge" data-edge="left"></div><div class="post-panel-edge" data-edge="right"></div>${header}${view}${panelNoteMarkup(saved)}`;
  if (saved) mountNoteView(saved);
  if (!postPanel.open) { flushActiveNote(); closeSelect(); postPanel.showModal(); void slidePost(true); } else void placePost();
}
// Swiping to the next reel moves the page under the panel, so the note follows. A note is never left showing beside a different post.
function postMoved(url) {
  if (!postPanel.open || postPanel.dataset.layout === 'saved') return;
  if (noteViewPost?.platform === 'chrome') return;
  const identity = postIdentity(url); if (noteViewPost && postIdentity(noteViewPost.url) === identity) return;
  const next = allPosts().find(post => post.platform !== 'chrome' && postIdentity(post.url) === identity) || null, section = $('.post-note', postPanel); if (!section) return;
  flushActiveNote();
  const previous = noteViewPost && allPosts().find(item => item.id === noteViewPost.id), card = previous && document.querySelector(`.save-card[data-post-id="${previous.id}"]`);
  if (previous && card) syncCardNote(card, previous);
  noteViewPost = next;
  section.outerHTML = panelNoteMarkup(next);
  if (next) mountNoteView(next);
  for (const copy of postPanel.querySelectorAll('.post-panel-copy')) { copy.hidden = !next; if (next) copy.dataset.postId = next.id; }
  paintDocAiButtons();
}
// The post is a native view, which can't fade and would stay solid until the end. A picture of it goes in its place first, so it all leaves as one.
async function freezePost() {
  const view = $('.post-panel-view', postPanel); if (!view || !window.saveXDesktop?.capturePost) return;
  try {
    const bytes = await Promise.race([window.saveXDesktop.capturePost(), new Promise(resolve => setTimeout(resolve, 400))]);
    if (bytes) {
      const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/jpeg' })), canvas = document.createElement('canvas');
      canvas.width = bitmap.width; canvas.height = bitmap.height; canvas.className = 'post-panel-frozen';
      canvas.getContext('2d').drawImage(bitmap, 0, 0); view.append(canvas);
    }
  } catch { /* It closes without the picture. */ }
  await window.saveXDesktop.hidePost().catch(() => {});
}
async function dismissPost() {
  if (!postPanel.open || postClosing) return;
  postClosing = true;
  postPanel.classList.add('is-closing');
  await freezePost();
  await slidePost(false);
  postPanel.close();
  postPanel.classList.remove('is-closing');
  postClosing = false;
}
window.saveXDesktop?.onPost?.(showPost, dismissPost, postMoved);
postPanel.addEventListener('cancel', event => { event.preventDefault(); void dismissPost(); });
postPanel.addEventListener('click', event => {
  const sendDoc = event.target.closest('.post-panel-document');
  if (sendDoc) {
    const id = Number(sendDoc.dataset.postId);
    void dismissPost().then(() => { if (id) void openSendToDocument(id); });
    return;
  }
  const copy = event.target.closest('.post-panel-copy');
  if (copy) void copyPostReference(copy, true, copy.dataset.copy || 'reference').then(copied => {
    const label = $('span', copy), idle = copy.dataset.copy === 'link' ? 'Link' : 'Reference'; label.textContent = copied ? 'Copied' : 'Couldn’t copy';
    clearTimeout(copy.resetLabel); copy.resetLabel = setTimeout(() => { label.textContent = idle; }, 1500);
  });
  if (event.target.closest('.post-panel-browser')) void window.saveXDesktop.openPostInBrowser().catch(error => toast(error.message, true)).finally(dismissPost);
  if (event.target === postPanel || event.target.closest('.post-panel-close')) void dismissPost();
});
postPanel.addEventListener('close', () => { for (const animation of postPanel.getAnimations({ subtree: true })) animation.cancel(); void window.saveXDesktop?.closePost?.();
  if (noteViewPost) {
    flushActiveNote();
    const post = allPosts().find(item => item.id === noteViewPost.id), card = document.querySelector(`.save-card[data-post-id="${noteViewPost.id}"]`);
    noteViewPost = null;
    if (post && card) syncCardNote(card, post);
  }
  aiActivity.flushAnnouncements();
});
// Dragging either side edge resizes the panel, which stays against the right of the window. A double-click restores the default.
postPanel.addEventListener('pointerdown', event => {
  const edge = event.target.closest('.post-panel-edge'); if (!edge) return;
  event.preventDefault(); edge.setPointerCapture(event.pointerId);
  const direction = edge.dataset.edge === 'left' ? -1 : 1, startX = event.clientX, startWidth = postPanel.getBoundingClientRect().width;
  let width = startWidth;
  postPanel.classList.add('is-resizing');
  edge.onpointermove = move => {
    width = Math.round(Math.max(378, Math.min(postPanelMax(), startWidth + direction * (move.clientX - startX))));
    postPanel.style.width = `${width}px`; void placePost();
  };
  edge.onlostpointercapture = () => { edge.onpointermove = edge.onlostpointercapture = null; postPanel.classList.remove('is-resizing'); if (width !== startWidth) savePostWidth(width); };
});
postPanel.addEventListener('dblclick', event => { if (event.target.closest('.post-panel-edge')) { savePostWidth(null); postPanel.style.width = ''; void placePost(); } });
addEventListener('resize', () => { if (postPanel.open) void placePost(); });
// Unsaves wait in line here and run one at a time, so closing the app simply forgets the rest.
const unsaveLine = [];
let startingUnsave = false;
async function openUnsave(button) {
  const post=allPosts().find(post=>post.id===Number(button.closest('[data-post-id]').dataset.postId));if(!post||state.demo)return;
  // A bookmark is deleted by the extension in Chrome, so without it this only explains how to connect it.
  const helper=state.sync?.chromeBrowser;
  if(post.platform==='chrome'&&window.saveXDesktop&&state.sync?.nativeSocial&&(!helper?.online||!helper.bookmarkDelete)){chromeHelperPage('unsave');return;}
  await unsaveDialog(post,{api,showModal,modal,esc,icon,sourceIcon,onConfirm:account=>{
    if(!unsaveLine.some(item=>item.postId===post.id))unsaveLine.push({postId:post.id,account});
    renderSync();void nextUnsave();
  }});
}
async function nextUnsave() {
  const running=['queued','running'];
  // A finished unsave still being acknowledged, or a scan, has to end first. A quiet check gives way on its own.
  if(startingUnsave||!unsaveLine.length||handlingUnsave||state.sync?.unsave||running.includes(state.sync?.job?.status))return;
  startingUnsave=true;
  const next=unsaveLine[0];
  try{
    const {nonce}=await api(`/posts/${next.postId}/unsave/prepare`,{method:'POST',body:{}});
    const job=await api(`/posts/${next.postId}/unsave`,{method:'POST',body:{nonce,confirmed:true,account:next.account}});
    unsaveLine.shift();state.sync={...state.sync,unsave:job};wakeExtension();
  }catch(failure){
    // Something else just started, so it waits. Anything else about this post won't fix itself.
    if(![BUSY.unsave.title,BUSY.unsaveAgain.title].includes(failure.message)){unsaveLine.shift();toast(failure.message,true,'bottom-center');}
  }finally{startingUnsave=false;renderSync();}
}
function cancelQueuedUnsave(postId) {
  const index=unsaveLine.findIndex(item=>item.postId===postId);
  if(index>=0){unsaveLine.splice(index,1);renderSync();}
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
    filters.sources = [...new Set([...accounts.map(value => value.split(':')[0]), ...filters.collections.map(id => state.instagramCollections.find(item => String(item.id) === id)?.platform || 'instagram')])];
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
      const selection = platform === 'x' ? request.xAccount : platform === 'pinterest' ? request.pinterestAccount : request.instagramAccount;
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
    mountSocialAccounts($('#native-connect-panel'), { esc, icon, sourceIcon, connect: options => connectAccount(options), platforms, expected: { x: handles(request.xAccount), instagram: handles(request.instagramAccount), pinterest: handles(request.pinterestAccount), threads: [] }, onChange: () => void syncStatus() });
    return;
  }
  const missing = mode === 'missing', offline = mode === 'offline', chromeBookmarks = targets.includes('chrome');
  const title = missing ? 'Install once. Then just Sync.' : offline ? 'Open Chrome to sync.' : chromeBookmarks ? 'Allow Chrome bookmarks once.' : 'Allow background access once.';
  const intro = missing ? window.saveXDesktop ? 'The included Chrome helper imports your browser bookmarks. Load or reload it once in Chrome or Edge.' : 'The extension wasn’t detected. Your download contains the browser helper that brings your saves here.' : offline ? 'Your Chrome helper was connected before, but it isn’t responding right now. Open Chrome with the profile where you installed saveXtension.' : chromeBookmarks ? 'Chrome needs your permission to read bookmark titles, links and folders from this profile and save them in your local library.' : 'Your extension is installed. Chrome needs your permission to read saved posts in background tabs.';
  showModal(`<div class="sync-setup"><span class="dialog-kicker">${missing ? 'One-time setup' : 'Almost ready'}</span><h2>${title}</h2><p>${intro}</p>${missing ? `<ol class="setup-steps"><li><strong>Unzip the download</strong><p>Keep the extracted folder somewhere permanent.</p></li><li><strong>Open Chrome’s extensions page</strong><p>Enter <code>chrome://extensions</code> in Chrome’s address bar. For Edge, use <code>edge://extensions</code>.</p><button class="text-button" id="copy-extensions">Copy Chrome address</button></li><li><strong>Load the extension folder</strong><p>Turn on <b>Developer mode</b>, click <b>Load unpacked</b>, and choose the extracted <code>extension</code> folder.</p></li><li><strong>Allow your selected sources</strong><p>Open saveXtension once and click <b>${chromeBookmarks ? 'Settings → Allow Chrome bookmarks' : 'Enable background sync'}</b>. Approve Chrome’s permission request.</p></li></ol><div class="button-row"><a class="secondary" href="/extension.zip" download="savextension.zip">${icon('download')} Download again</a><button class="primary" id="check-extension">Check installation</button></div>` : offline ? `<p>Leave Chrome open. We’ll start your sync as soon as it reconnects.</p><div class="button-row"><button class="primary" id="check-extension">Check connection</button><button class="text-button" id="reinstall-extension">Reinstall extension</button></div><p class="fine-print">If the extension is disabled, enable it at <code>chrome://extensions</code>. If you recently reloaded it, refresh the library in Chrome.</p>` : `<p>Click below to open setup in Chrome, then click <b>${chromeBookmarks ? 'Allow Chrome bookmarks' : 'Enable background sync'}</b>${targets.length > 1 && chromeBookmarks ? ' and enable background sync for your social saves' : ''}. Your sync starts automatically after you approve access.</p><button class="primary" id="open-extension-setup">Open setup in Chrome</button><p class="fine-print">If setup doesn’t open, click the saveXtension extension icon in Chrome and choose ${chromeBookmarks ? 'Settings → Allow Chrome bookmarks' : 'Enable background sync'}.</p>`}<p class="setup-status" id="setup-status" role="status">${missing ? 'Waiting for installation. Your sync will start automatically when ready.' : offline ? 'Waiting for Chrome…' : 'Waiting for permission…'}</p></div>`);
  modal.dataset.syncSetup = mode; state.pendingTargets = targets; state.pendingSyncRequest = request; state.pendingMode = syncMode;
  if (missing && window.saveXDesktop) {
    $('.setup-steps', modal).innerHTML = `<li><strong>Open Chrome or Edge extensions</strong><p>Reload saveXtension if it is already installed. For a new install, turn on <b>Developer mode</b>.</p><button class="text-button" id="desktop-open-extensions">Open extensions</button></li><li><strong>Load the included helper</strong><p>Download the helper, click <b>Load unpacked</b> and choose the folder shown below. The desktop app keeps this folder updated.</p><div class="button-row"><button class="secondary" id="desktop-show-helper">Download helper</button><button class="text-button" id="desktop-copy-helper">Copy folder path</button></div><p class="fine-print" id="desktop-helper-path"></p></li><li><strong>Allow Chrome bookmarks</strong><p>Open the helper’s settings and approve bookmark access. X and Instagram connect directly inside saveXtension.</p></li>`;
    const zip = $('a[download="savextension.zip"]', modal); if (zip) zip.remove();
    $('#desktop-open-extensions').onclick = () => window.saveXDesktop.openExtensions().catch(error => toast(error.message, true));
    let downloaded = '';
    $('#desktop-show-helper').onclick = async event => {
      try { downloaded = (await window.saveXDesktop.saveHelper()).path; $('#desktop-helper-path').textContent = downloaded; event.target.textContent = 'Downloaded'; }
      catch (error) { toast(error.message, true); }
    };
    $('#desktop-copy-helper').onclick = async () => { if (downloaded) await window.saveXDesktop.copyText(downloaded); else await window.saveXDesktop.copyHelperPath(); $('#desktop-copy-helper').textContent = 'Copied'; };
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
  document.querySelectorAll('[data-action="unsave"]').forEach(button=>{const id=Number(button.closest('[data-post-id]').dataset.postId),current=unsaveBusy&&id===state.sync.unsave.post_id;button.disabled=current||unsaveLine.some(item=>item.postId===id);button.setAttribute('aria-busy',String(current));});
  void nextUnsave();
  styleSelects(app); if (modal.dataset.syncOptions) styleSelects(modal);
  const options = $('[data-action="sync-options"]'); if (options) options.disabled = !!busy || state.syncChecking;
  const allRefresh = $('[data-action="refresh-all"]'); if (allRefresh) { allRefresh.disabled = !!busy || unsaveBusy || state.syncChecking; allRefresh.setAttribute('aria-busy', String(!!busy || unsaveBusy || state.syncChecking)); }
  const timestamp = lastSyncTime(state.sync, state.runs), age = syncAge(timestamp);
  document.querySelectorAll('[data-action="sync"],[data-action="deep-sync"]').forEach(button => {
    button.disabled = !!busy || state.syncChecking || !sourceTargets().length;
    button.setAttribute('aria-busy', String(!!busy || state.syncChecking));
    if (button.dataset.action === 'deep-sync') { button.hidden = !sourceTargets().some(target => target !== 'chrome'); $('#deep-scan-control').hidden = button.hidden; return; }
    button.title = timestamp ? `Last synced ${new Date(timestamp).toLocaleString()} · Click to sync` : 'Sync your saves';
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
  slideOutSyncNotice();
}
// The sync toast slides off to the right before it goes, keeping its content until then.
let syncLeaving = null;
function slideOutSyncNotice() {
  const el = $('#sync-status');
  if (el.hidden || syncLeaving) return;
  const finish = () => { el.hidden = true; el.replaceChildren(); delete el.dataset.content; };
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { finish(); return; }
  const leaving = syncLeaving = el.animate([{ transform: 'none', opacity: 1 }, { transform: 'translateX(calc(100% + 32px))', opacity: 0 }], { duration: 240, easing: 'cubic-bezier(.4,0,.8,.6)', fill: 'forwards' });
  leaving.onfinish = () => { syncLeaving = null; finish(); leaving.cancel(); };
}
function cancelSyncSlideOut() { if (syncLeaving) { syncLeaving.onfinish = null; syncLeaving.cancel(); syncLeaving = null; } }
function updateSyncCountdown() {
  if (syncReportTicking) return;
  syncReportTicking = true; clearTimeout(syncToastTimer);
  try {
    const now = performance.now(), expired = [];
    for (const [platform, timer] of syncReportTimers) {
      const card = syncNotice.querySelector(`.sync-platform-card[data-platform="${platform}"]`);
      if (!card || syncNotice.hidden) { syncReportTimers.delete(platform); continue; }
      const paused = document.hidden || card.matches(':hover') || card.contains(document.activeElement);
      if (!paused) timer.remaining = Math.max(0, timer.remaining - (now - timer.at));
      timer.at = now;
      card.dataset.paused = String(paused);
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
    const problem = report.warning ? `<div class="sync-report-problem"><ul class="sync-report-issues">${report.notes.map(note => `<li>${esc(note)}</li>`).join('')}</ul><button class="sync-report-retry secondary" data-action="retry-sync-platform" data-platform="${report.platform}" aria-label="Retry ${platformName(report.platform)} sync">${icon('refresh')}Retry</button></div>` : '';
    return `<article class="sync-platform-card" data-platform="${report.platform}" data-tone="${report.warning ? 'warning' : 'success'}" aria-label="${platformName(report.platform)} sync report"><div class="sync-report-header">${sourceIcon(report.platform)}<strong>${platformName(report.platform)}</strong>${report.warning ? `<span class="sync-report-alert" role="img" aria-label="Needs attention" title="Needs attention">${icon('warning')}</span>` : ''}<button class="icon-button" data-action="dismiss-sync-platform" data-platform="${report.platform}" aria-label="Dismiss ${platformName(report.platform)} sync report">${icon('close')}</button></div>${stats}${problem}${!report.warning ? '<div class="sync-dismiss-progress" aria-hidden="true"><span></span></div>' : ''}</article>`;
  }).join('');
}
const syncNotice = $('#sync-status'), syncNoticeGlide = glideSize(syncNotice);
function expandSyncNotice(expanded) {
  syncNoticeGlide.change(() => { syncNotice.dataset.expanded = String(expanded); });
  syncNotice.querySelector('.sync-toast-summary')?.setAttribute('aria-expanded', String(expanded));
}
// Like the AI notification: a short wait to open and a longer one to close, so quick passes don't flicker it.
let syncNoticeTimer = 0;
syncNotice.addEventListener('pointerenter', event => { if (event.pointerType !== 'mouse') return; clearTimeout(syncNoticeTimer); syncNoticeTimer = setTimeout(() => expandSyncNotice(true), 80); });
syncNotice.addEventListener('pointerleave', () => { clearTimeout(syncNoticeTimer); syncNoticeTimer = setTimeout(() => { if (!syncNotice.matches(':hover') && !syncNotice.contains(document.activeElement)) expandSyncNotice(false); }, 100); });
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
  const visible = checking || job && (busy || !dismissedSyncJobs.has(job.id) && (['failed', 'partial'].includes(job.status) || job.status === 'completed' && (completedToastJob === job.id || job.quiet)));
  if (!visible) { clearTimeout(syncToastTimer); syncReportTimers.clear(); slideOutSyncNotice(); return; }
  cancelSyncSlideOut(); el.hidden = false;
  el.classList.toggle('sync-report-stack', finished && !checking);
  if (finished && !checking) {
    el.dataset.tone = job.status === 'completed' ? 'success' : 'warning';
    const contentKey = JSON.stringify([job.id, job.status, job.targets, job.results, job.message, [...dismissedSyncJobs]]);
    if (el.dataset.content !== contentKey) {
      el.innerHTML = syncReportCards(job); el.dataset.content = contentKey;
    }
    mountSyncCountdown(job);
    return;
  }
  clearTimeout(syncToastTimer); syncReportTimers.clear();
  const targets = checking ? ['chrome'] : job?.targets || [];
  const active = /threads/i.test(message) ? 'threads' : /instagram/i.test(message) ? 'instagram' : /pinterest/i.test(message) ? 'pinterest' : /\bX\b|twitter/i.test(message) ? 'x' : /chrome/i.test(message) ? 'chrome' : targets.length === 1 ? targets[0] : '';
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
  const { job } = await api('/sync', { method: 'POST', body: { targets, xAccount: request.xAccount, instagramAccount: request.instagramAccount, instagramCollectionId: request.instagramCollectionId, pinterestAccount: request.pinterestAccount, pinterestCollectionId: request.pinterestCollectionId, mode } });
  state.sync = { ...state.sync, job }; renderSync(); wakeExtension();
}
let statusLoading = false;
async function syncStatus() {
  if (!state.localMode || statusLoading) return;
  statusLoading = true;
  try {
    state.sync = await api('/sync'); renderSync(); void handleUnsaveStatus(state.sync.unsave);
    renderChromeHelperSettings(); renderChromeHelperPage();
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
  const section = $('.app-updates'), button = $('#app-update-button'), progress = $('#app-update-progress');
  let latest, reading = false;
  function render(status) {
    if (!section.isConnected || !modal.open) return;
    latest = status;
    $('#app-update-current', section).hidden = status.phase !== 'current';
    $('#app-update-version', section).textContent = status.currentVersion ? ` · ${status.currentVersion}` : '';
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
// Settings sections are containers that open and close; which ones are open is remembered.
const openSettingsPanels = (() => { try { const saved = JSON.parse(localStorage.getItem('savex-settings-open')); if (Array.isArray(saved)) return new Set(saved); } catch { /* First visit. */ } return new Set(['accounts']); })();
const SETTINGS_ICONS = { extension: 'puzzle', accounts: 'users', meaning: 'sparkle', mcp: 'plug', updates: 'package', backup: 'database' };
function settingsPanel(key, title, { className = '', detail = '', aside = '', headingId = '', collapsible = true }, body) {
  const open = collapsible && openSettingsPanels.has(key), bodyId = `settings-panel-${key}`;
  const headingControl = collapsible
    ? `<button class="settings-panel-toggle" type="button" data-action="toggle-settings-panel" aria-expanded="${open}" aria-controls="${bodyId}"><span class="settings-panel-icon">${icon(SETTINGS_ICONS[key])}</span><span>${esc(title)}${detail}</span></button>`
    : `<div class="settings-panel-toggle is-static"><span class="settings-panel-icon">${icon(SETTINGS_ICONS[key])}</span><span>${esc(title)}${detail}</span></div>`;
  return `<section class="settings-panel ${className} ${open ? 'is-open' : ''} ${collapsible ? '' : 'is-static'}" data-panel="${key}"><header class="settings-panel-header"><h3 ${headingId ? `id="${headingId}"` : ''}>${headingControl}</h3><div class="settings-panel-aside">${aside}</div>${collapsible ? icon('chevron', 'settings-panel-chevron') : ''}</header><div class="settings-panel-body" id="${bodyId}"><div class="settings-panel-inner">${body}</div></div></section>`;
}
// Eases a panel into view as it opens, until all of it shows. A panel taller than the
// dialog stops with its top just under the title. Scrolling by hand takes over, and
// only the panel opened last is followed.
let stopFollowingPanel = () => {};
function followSettingsPanel(panel) {
  stopFollowingPanel();
  const started = performance.now(), title = $('h2', modal), instant = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let last = started, height = 0, stopped = false;
  const stop = stopFollowingPanel = () => { stopped = true; modal.removeEventListener('wheel', stop); modal.removeEventListener('touchmove', stop); };
  modal.addEventListener('wheel', stop, { passive: true });
  modal.addEventListener('touchmove', stop, { passive: true });
  const follow = now => {
    if (stopped || !panel.isConnected || !panel.classList.contains('is-open')) return stop();
    const box = panel.getBoundingClientRect(), room = box.top - title.getBoundingClientRect().bottom;
    const by = room < 0 ? room : Math.min(box.bottom + 16 - modal.getBoundingClientRect().bottom, room);
    const behind = by > 1 || by < -1 && room < 0, growing = box.height !== height;
    if (behind) modal.scrollTop += instant ? by : by * (1 - Math.exp((last - now) / 70));
    last = now; height = box.height;
    if (now - started < 350 || (behind || growing) && now - started < 1500) requestAnimationFrame(follow); else stop();
  };
  requestAnimationFrame(follow);
}
function toggleSettingsPanel(button) {
  const panel = button.closest('.settings-panel'), open = panel.classList.toggle('is-open');
  button.setAttribute('aria-expanded', String(open));
  if (open) { openSettingsPanels.add(panel.dataset.panel); followSettingsPanel(panel); } else openSettingsPanels.delete(panel.dataset.panel);
  try { localStorage.setItem('savex-settings-open', JSON.stringify([...openSettingsPanels])); } catch { /* Keep this session's choice. */ }
  // The panel animates its own height and the dialog follows along, so the dialog needn't glide too.
  modal.dataset.settling = 'true'; clearTimeout(settingsSettleTimer);
  settingsSettleTimer = setTimeout(() => { delete modal.dataset.settling; }, 340);
}
let settingsSettleTimer;
const AI_TOOL_ICONS = {
  minilm: '<svg class="ai-tool-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="3.5" fill="#46613a"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3" stroke="#46613a" stroke-width="1.8" stroke-linecap="round"/><rect x="9.5" y="9.5" width="5" height="5" rx="1.2" fill="#fff"/></svg>',
  claude: '<svg class="ai-tool-icon" viewBox="0 0 24 24" aria-hidden="true"><g stroke="#d97757" stroke-width="2.6" stroke-linecap="round"><path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6 5.6 18.4M7.5 3.9l9 16.2M16.5 3.9l-9 16.2M3.9 7.5l16.2 9M20.1 7.5l-16.2 9"/></g></svg>',
  deepseek: '<svg class="ai-tool-icon" viewBox="0 0 24 24" aria-hidden="true"><rect width="24" height="24" rx="6" fill="#4d6bfe"/><path d="M5 13.5c2.5 3.5 7.5 4.5 11 1.5 1.5-1.3 2.5-3 3-5-1 .8-2 1.200-3 1.200-2.500 0-3.500-2.200-6-2.200-2.200 0-4 1.800-5 4.500Z" fill="#fff"/></svg>',
  codex: '<svg class="ai-tool-icon" viewBox="0 0 24 24" aria-hidden="true"><rect width="24" height="24" rx="6" fill="#111"/><path d="m7 8 4 4-4 4M13 16.5h4.5" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};
// The local model is always on. Claude Code and Codex install and sign in here, and one can be chosen for AI search.
async function mountAiSearchSettings() {
  const box = $('.ai-search-settings'); if (!box) return;
  let timer = 0;
  const toggle = (id, name, selected) => `<label class="mcp-switch"><input type="checkbox" role="switch" data-ai-tool="${esc(id)}" aria-label="Search with ${esc(name)}" ${selected === id ? 'checked' : ''}><span></span></label>`;
  const button = (label, kind, tool = '') => `<button class="secondary" type="button" data-ai-action="${kind}" data-tool="${esc(tool)}">${label}</button>`;
  const toolControl = (tool, selected) => {
    if (tool.busy) return `<span class="ai-tool-busy" role="status" aria-label="${tool.busy === 'install' ? 'Installing' : 'Waiting for sign-in'}">${dotLoader('busy')}</span>`;
    if (tool.usesKey && !tool.installed) return addingKey === tool.id ? '' : button('Add key', 'add-key', tool.id);
    if (tool.usesKey) return `<button class="ai-key-remove" type="button" data-ai-action="remove-key" data-tool="${esc(tool.id)}">Remove key</button>${toggle(tool.id, tool.name, selected)}`;
    if (!tool.installed) return button('Install', 'install', tool.id);
    if (tool.signedIn === false) return button('Sign in', 'login', tool.id);
    return toggle(tool.id, tool.name, selected);
  };
  let addingKey = '';
  const keyForm = tool => `<form class="ai-key-form" data-ai-key="${esc(tool.id)}"><input type="password" autocomplete="off" spellcheck="false" aria-label="${esc(tool.name)} API key" placeholder="Paste your ${esc(tool.name)} API key" required><div class="ai-key-actions"><button class="primary ai-key-save" type="submit">Save API Key<span class="ai-key-tag">will be encrypted</span></button><button class="secondary" type="button" data-ai-key-cancel>Cancel</button></div></form><p class="fine-print ai-key-help">You pay ${esc(tool.name)} for what you use. <a href="${esc(tool.getKey)}" target="_blank" rel="noreferrer">Get a key</a></p>`;
  const row = (id, name, note, controls) => `<div class="ai-tool-row">${AI_TOOL_ICONS[id] || ''}<span class="ai-tool-name"><strong>${esc(name)}</strong>${note ? `<span class="fine-print ${note.failed ? 'meaning-error' : ''}">${esc(note.text)}</span>` : ''}</span><span class="ai-tool-controls">${controls}</span></div>`;
  async function refresh(options) {
    try {
      const listing = await api('/ai-search/tools', options);
      if (options) await loadAiSearch();
      paint(listing);
    } catch (error) { toast(error.message, true, 'bottom-center'); }
  }
  function paint({ tools, selected }) {
    if (!box.isConnected) return;
    clearTimeout(timer);
    {
      // LEAF is always on, so it's named beside the panel's title instead of having a row. Only the AIs you can switch on are listed.
      box.innerHTML = tools.map(tool => row(tool.id, tool.name, tool.failed ? { text: tool.failed === 'install' ? 'Install failed' : 'Sign-in failed', failed: true } : { text: tool.model }, toolControl(tool, selected)) + (tool.usesKey && addingKey === tool.id ? keyForm(tool) : '')).join('');
      box.querySelectorAll('[data-ai-tool]').forEach(input => { input.onchange = () => { box.querySelectorAll('[data-ai-tool]').forEach(item => { item.disabled = true; }); stopAiSearch(); void refresh({ method: 'POST', body: { tool: input.checked ? input.dataset.aiTool : '' } }); }; });
      box.querySelectorAll('[data-ai-action]').forEach(control => { control.onclick = () => { control.disabled = true; void runAction(control.dataset.aiAction, control.dataset.tool); }; });
      box.querySelectorAll('[data-ai-key]').forEach(form => {
        $('input', form).focus();
        $('[data-ai-key-cancel]', form).onclick = async () => { addingKey = ''; paint(await api('/ai-search/tools')); };
        form.onsubmit = async event => {
          event.preventDefault();
          const save = $('.ai-key-save', form), input = $('input', form), tool = form.dataset.aiKey; save.disabled = true;
          try { const listing = await api('/ai-search/key', { method: 'POST', body: { tool, key: input.value } }); addingKey = ''; input.value = ''; paint(listing); }
          catch (error) { save.disabled = false; toast(error.message, true, 'bottom-center'); input.focus(); }
        };
      });
    }
    if (tools.some(tool => tool.busy)) timer = setTimeout(() => { if (box.isConnected) void refresh(); }, 1500);
  }
  async function runAction(kind, tool) {
    try {
      if (kind === 'add-key') { addingKey = addingKey === tool ? '' : tool; return paint(await api('/ai-search/tools')); }
      if (kind === 'remove-key') { stopAiSearch(); paint(await api('/ai-search/key', { method: 'DELETE', body: { tool } })); return await loadAiSearch(); }
      await refresh({ method: 'POST', body: { tool, action: kind } });
    } catch (error) { toast(error.message, true, 'bottom-center'); void refresh(); }
  }
  await refresh();
}
async function settingsDialog() {
  if (state.localMode) {
    const desktop = !!window.saveXDesktop;
    showModal(`<h2>Settings</h2><div class="settings-panels">
      ${window.saveXDesktop?.socialAccounts ? settingsPanel('extension', 'Chrome extension', { aside: '<div id="chrome-helper-settings"></div>' }, '<div id="chrome-helper-about"></div>') : ''}
      ${window.saveXDesktop?.socialAccounts ? settingsPanel('accounts', 'Accounts', { className: 'native-account-settings', detail: '<span class="settings-heading-detail" id="settings-account-count"></span>' }, '<div id="native-account-settings-list"></div>') : ''}
      ${settingsPanel('meaning', 'Use AI', { detail: '<span class="settings-heading-detail"> · LEAF on this computer</span>' }, '<div class="ai-search-settings"></div>')}
      ${settingsPanel('mcp', 'MCP', { collapsible: false }, '<div class="mcp-settings"></div>')}
      ${desktop && window.saveXDesktop.updateStatus ? settingsPanel('updates', 'App version', { className: 'app-updates', headingId: 'app-update-heading', collapsible: false, detail: '<span class="settings-heading-detail" id="app-update-version"></span>', aside: '<span class="settings-panel-note" id="app-update-current" role="status" aria-live="polite" hidden>· Up to date</span><button class="secondary app-update-action" type="button" id="app-update-button">Check for updates</button>' }, '<p id="app-update-status" role="status" aria-live="polite" hidden></p><progress id="app-update-progress" aria-label="Update download" max="100" value="0" hidden></progress>') : ''}
      ${settingsPanel('backup', 'Backup', { collapsible: false, aside: `<div class="button-row backup-actions"><a class="secondary" href="/api/backup" download title="One file with everything but your sign-ins">${icon('download')} Export library</a><button class="secondary" data-action="import">${icon('plus')} Import a file</button></div>` }, '')}
    </div>`);
    modal.classList.add('settings-dialog');
    const mcpSection = $('.mcp-settings', modal);
    void mountMcpSettings(mcpSection, { api, toast, esc, icon, header: $('[data-panel="mcp"] .settings-panel-aside', modal) }).then(() => { if (mcpSection.hidden) mcpSection.closest('.settings-panel').hidden = true; });
    if (window.saveXDesktop?.socialAccounts) {
      const section = $('.native-account-settings', modal);
      mountSocialAccounts($('#native-account-settings-list'), { esc, icon, sourceIcon, browse: true, chooseCollections: ({ platform, handle }) => collectionsDialog(`${platform}:${handle.toLowerCase()}`, { label: handle, fromSettings: true }), connect: options => connectAccount(options), onChange: accounts => { $('#settings-account-count', section).textContent = ` · ${accounts.filter(account => account.status === 'connected').length} connected`; void syncStatus(); } });
      renderChromeHelperSettings();
    }
    void mountAiSearchSettings();
    mountUpdateSettings(); renderSync(); return;
  }
  showModal('<h2>Settings</h2><p>Loading settings…</p>');
  try {
    const { devices } = await api('/devices');
    if (!modal.open) return;
    showModal(`<span class="dialog-kicker">Make it yours</span><h2>Settings</h2><h3>Connected browsers</h3><div class="device-list">${devices.length ? devices.map(d => `<div class="device"><span>${icon('shield')}</span><div><strong>${esc(d.name)}</strong><small>${d.lastSeen ? `Last used ${relative(d.lastSeen).toLowerCase()}` : 'Paired, ready to sync'}</small></div><button class="text-button danger" data-revoke="${d.id}">Disconnect</button></div>`).join('') : '<p class="muted">No browsers paired yet.</p>'}</div><button class="secondary" data-action="connect">${icon('plus')} Pair a browser</button><h3 class="section-gap">Your data, always yours.</h3><p>Back up your saves, notes and tags as JSON. Import that file to restore a new library.</p><div class="button-row"><a class="secondary" href="/api/backup" download title="One file with everything but your sign-ins">${icon('download')} Export library</a><button class="secondary" data-action="import">${icon('plus')} Import a file</button></div><div class="notice">Topic suggestions use simple local keyword matching. No posts are sent to an AI service. Thumbnails load from the original platform and may expire; your captured text and notes stay saved.</div><button class="text-button" data-action="logout">${icon('logout')} Sign out of this browser</button>`);
  } catch (e) { toast(e.message, true); modal.close(); }
}
async function importLibraryBackup(file) {
  $('#import-progress').textContent = 'Importing your library…';
  const response = await fetch('/api/backup', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: file });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'That backup couldn’t be imported.');
  state.demo = false; modal.close(); await refresh();
  const accounts = result.accounts?.length;
  const parts = [`${result.added} new saves`, result.merged ? `${result.merged} joined with ones here` : '', result.documents ? `${result.documents} ${result.documents === 1 ? 'document' : 'documents'}` : ''].filter(Boolean);
  // Saves from accounts that came with the backup show straight away; signing in to the same handle connects them.
  if (accounts) toastWithActions(`Library imported: ${parts.join(' · ')}`, [{ label: 'Sign in to accounts', onClick: () => void settingsDialog() }], { detail: `${accounts} ${accounts === 1 ? 'account needs' : 'accounts need'} signing in. Sign in to the same ${accounts === 1 ? 'handle' : 'handles'} and they connect to these saves.`, duration: 15000 });
  else toast(`Library imported: ${parts.join(' · ')}`);
}
function importDialog() {
  showModal(`<h2>Import saves</h2><p>Import a saveXtension backup (.savex), an extracted Instagram/X export file, or a plain list of post URLs.</p><form id="import-form"><label class="file-drop">${icon('file')}<strong>Choose a backup, or a JSON, HTML, JS, or TXT file</strong><span>Extract downloaded ZIP archives first. Other files up to 20 MB.</span><input type="file" id="import-file" accept=".savex,.sqlite,.json,.html,.htm,.txt,.js" required></label><label>Source account <span class="optional">optional</span><input name="sourceAccount" placeholder="e.g. @my-personal-account" maxlength="100"></label><p class="form-error" id="import-error" role="alert"></p><button class="primary full">Import supported post links ${icon('arrow')}</button><p id="import-progress" role="status"></p></form><p class="fine-print">Exports vary: some include only links, and some omit saves entirely. We’ll tell you how many supported posts we find. JavaScript export files are read as data, never executed.</p>`);
  $('#import-form').onsubmit = async e => {
    e.preventDefault(); const button = $('button', e.target); button.disabled = true;
    try {
      const file = $('#import-file').files[0];
      // A whole-library backup goes to the server as it is, pictures and all.
      if (/\.(savex|sqlite)$/i.test(file.name)) { await importLibraryBackup(file); return; }
      if (file.size > 20 * 1024 * 1024) throw new Error('Choose a file smaller than 20 MB.');
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
    if (!/^https?:\/\/(?:www\.|mobile\.)?(?:(?:x|twitter)\.com\/(?:\w+|i\/web)\/status\/\d+|instagram\.com\/(?:p|reels?|tv)\/[\w-]+|threads\.(?:com|net)\/@[\w.]+\/post\/[\w-]+)/i.test(normalized) && !isPinterestPin(normalized)) return;
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
  return target.closest('[data-instagram-collection]') || target.closest('.source-account-group')?.querySelector('[data-nav-account]') || target.closest('[data-filter="all"],[data-filter="chrome"]');
}
document.addEventListener('contextmenu', event => {
  const collection = event.target.closest('[data-collection-id]');
  if (collection) { event.preventDefault(); localCollectionMenu(collection, { x: event.clientX, y: event.clientY }); return; }
  const trigger = accountMenuTrigger(event.target); if (!trigger) return;
  event.preventDefault(); accountMenu(trigger, { x: event.clientX, y: event.clientY });
});
// Delete or Backspace with topics selected in the Topics list asks to delete them, the same as the right-click menu (user's
// decision). It never deletes by itself, and does nothing while typing, with a dialog or panel open, or with the list hidden.
document.addEventListener('keydown', event => {
  if (!['Delete', 'Backspace'].includes(event.key) || event.metaKey || event.ctrlKey || event.altKey || event.repeat || state.demo) return;
  if (event.target.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"])') || $('#sidebar-collections-panel')?.hidden) return;
  if (modal.open || $('#sheet')?.open || $('#post-panel')?.open || documentUi?.isOpen?.() || state.archive) return;
  const selected = state.topicCatalog.filter(topic => topic.id && state.filters.topics.includes(topic.name));
  if (!selected.length) return;
  event.preventDefault();
  collectionDialog(selected.length > 1 ? selected : selected[0], 'delete');
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
    if (card && !e.target.closest('a,button,input,textarea,select,label,.card-note,.ai-seen') && !getSelection()?.toString()) { const post = allPosts().find(post => post.id === Number(card.dataset.postId)); if (post) window.open(post.url, '_blank', 'noopener,noreferrer'); }
    return;
  }
  try {
    if (e.shiftKey && (button.dataset.navAccount || button.dataset.instagramCollection || button.dataset.navTopic || button.dataset.filter === 'chrome')) { toggleSidebarPick(button); return; }
    if (button.dataset.filter) { if (state.archive) { state.archive = false; state.filters = defaultFilters(); state.query = ''; $('#search').value = ''; } state.filters.aiActivity = false; state.filters.sources = button.dataset.filter === 'all' ? [] : [button.dataset.filter]; state.filters.folder = ''; state.filters.collection = ''; state.filters.collectionName = ''; state.filters.accounts = []; state.filters.topics = []; updateCollection(); renderSync(); }
    else if (button.dataset.navAccount) {
      if (state.archive) { state.archive = false; state.filters = defaultFilters(); state.query = ''; $('#search').value = ''; }
      const value = button.dataset.navAccount;
      if (/^(?:instagram|pinterest):/.test(value)) toggleInstagramCollections(value);
      state.filters.aiActivity = false; state.filters.sources = [value.split(':')[0]]; state.filters.accounts = [value]; state.filters.folder = ''; state.filters.collection = ''; state.filters.collectionName = ''; state.filters.topics = [];
      updateCollection();
    }
    else if (button.dataset.instagramCollection) {
      const collection = (state.instagramCollections || []).find(c => String(c.id) === button.dataset.instagramCollection);
      if (!collection) return;
      state.archive = false; state.filters = { ...defaultFilters(), sources: [collection.platform || 'instagram'], accounts: [`${collection.platform || 'instagram'}:${collection.account.toLowerCase()}`], collection: String(collection.id), collectionName: collection.name };
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
      case 'cancel-unsave': cancelQueuedUnsave(Number(button.closest('[data-post-id]').dataset.postId)); break;
      case 'sidebar-view': selectSidebarView(button.dataset.sidebarView); break;
      case 'topics-view': setTopicsView('folders'); break;
      case 'card-view': {
        const view = button.dataset.cardView;
        // Leaving the folders picks this layout too; cards built for another layout rebuild.
        if (showingCollectionFolders()) { state.cardView = view; localStorage.setItem('savex-card-view', view); setTopicsView('cards'); break; }
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
      case 'connect-source': { const platform = button.dataset.platform; await connectAccount({ platform }, () => { sourceConnect.awaiting = platform; renderSourceConnect(); }); break; }
      case 'sync-source': await startSync('quick', sourceSyncRequest(button.dataset.platform)); renderSourceConnect(); break;
      case 'import-chrome': await startSync('quick', { ...selectedSyncRequest(), targets: ['chrome'] }); renderChromeSetup(); break;
      case 'toggle-settings-panel': toggleSettingsPanel(button); break;
      case 'organize-topics': void openOrganize(); break;
      case 'chrome-helper-page': chromeHelperPage(button.dataset.from || ''); break;
      case 'check-chrome-helper': button.disabled = true; await api('/sync/chrome-check', { method: 'POST', body: {} }); await syncStatus(); break;
      case 'chrome-helper-back': if (chromeHelperFrom === 'signin' && pendingSignIn) signInPrompt(); else closeSheet(); break;
      case 'close-sheet': closeSheet(); break;
      case 'continue-sign-in': { const pending = pendingSignIn; closeSheet(); await pending?.start(); break; }
      case 'save-chrome-helper': try { const saved = await window.saveXDesktop.saveHelper(); chromeSetup.saved = typeof saved === 'object' ? saved : { path: saved }; chromeSetup.justSaved = true; refreshSetupPanel(); clearTimeout(chromeSetup.savedTimer); chromeSetup.savedTimer = setTimeout(() => { chromeSetup.justSaved = false; refreshSetupPanel(); }, 2500); toast(chromeSetup.saved.updated ? 'Extension folder replaced in Downloads' : 'Extension folder saved to Downloads'); } catch (failure) { toast(failure.message, true); } break;
      case 'open-downloads': try { await window.saveXDesktop.revealHelper(); } catch (failure) { toast(failure.message, true); } break;
      case 'open-chrome-extensions': try { await window.saveXDesktop.openExtensions(); } catch (failure) { toast(failure.message, true); } break;
      case 'install-update': try { await window.saveXDesktop?.installUpdate(); } catch (failure) { toast(failure.message, true); } finally { void refreshUpdate(); } break;
      case 'copy-post': await copyPostReference(button); break;
      case 'copy-post-link': await copyPostReference(button, false, 'link'); break;
      case 'send-to-document': await openSendToDocument(button.closest('[data-post-id]')?.dataset.postId); break;
      case 'close-modal': closeModal(); break;
      case 'remove-topic': removeTopicDialog(Number(button.closest('[data-post-id]').dataset.postId), button.dataset.topicName); break;
      case 'retry-preview': retryEmbed(button.closest('.save-card')?.querySelector('.native-embed')); break;
      case 'toggle-note-preview': {
        const post = allPosts().find(post => post.id === Number(button.closest('.save-card').dataset.postId));
        if (state.cardView === 'feed') { const field = button.closest('.card-note').querySelector('.note-input'); setNoteExpanded(field, field.dataset.expanded !== 'true'); }
        else if (post) showNoteView(post);
        break;
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
      case 'refresh-all': await startSync('quick', allSourcesRefreshRequest()); break;
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
      case 'stop-sync': hideToast(); await api('/sync/stop', { method: 'POST', body: {} }); wakeExtension(); await syncStatus(); break;
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
    if (searchFocused && !state.query && !e.defaultPrevented && !e.isComposing) { e.preventDefault(); leaveSearchFocus(); search?.blur(); return; }
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
  enterSearchFocus();
  search.focus(); search.select();
});
document.addEventListener('visibilitychange', () => { if (document.hidden) void notes.flushAll(); else if ($('#results')) refresh(true); });
window.addEventListener('online', () => { void notes.flushAll(); });
window.addEventListener('pagehide', () => { void notes.flushAll(); });
setInterval(() => { if ($('#results') && state.localMode) syncStatus(); }, 2000);
setInterval(() => { if (!document.hidden && !modal.open && $('#results')) refresh(true); }, 5000);
let libraryChangeTimer;
window.saveXDesktop?.onLibraryChanged?.(() => { clearTimeout(libraryChangeTimer); libraryChangeTimer = setTimeout(() => { if (!modal.open && $('#results')) refresh(true); }, 300); });
const demoPosts = [
  { id: -1, platform: 'x', title: '', text: 'The best AI workflow isn’t the one with the most tools.\n\nIt’s the one that removes the step you keep putting off. Start there.', author: 'example_creator', authorName: 'An example creator', topics: ['Tech'], favorite: true },
  { id: -2, platform: 'instagram', title: 'A small collection of useful interfaces.', text: 'Save the details that make something feel effortless: clear labels, generous spacing, and one obvious next step.', author: 'design_example', authorName: 'Design example', topics: ['Design'], favorite: false },
  { id: -3, platform: 'x', title: 'A learning list for the weekend', text: 'One paper. One working prototype. One thing you can explain to a friend.\n\nA little practice goes a long way.', author: 'learning_example', authorName: 'Learning example', topics: ['Tech'], favorite: false },
  { id: -4, platform: 'instagram', title: 'Your next side project starts here.', text: 'The idea you scribbled down. The tutorial you saved. The tiny problem you know how to fix. Put them in the same place.', author: 'build_example', authorName: 'Build example', topics: ['Tech', 'Business'], favorite: false },
  { id: -5, platform: 'x', title: '', text: 'A note to future me:\n\nBookmark fewer things you feel you should read. Keep more things you actually want to try.', author: 'notes_example', authorName: 'Notes example', topics: ['Tech'], favorite: true },
  { id: -6, platform: 'instagram', title: 'Make room for curiosity.', text: 'A useful idea can come from anywhere. Finding it again should be the easy part.', author: 'curious_example', authorName: 'Curiosity example', topics: ['Design'], favorite: false }
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
enablePostDrag({ post: id => allPosts().find(item => item.id === id), topic: id => state.topicCatalog.find(item => item.id === id), add: tagPost, enabled: () => !state.demo });
boot();
