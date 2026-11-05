import { orderLibraryPosts } from './source-order.js';
import { libraryAddedAt } from './saved-time.js';
export const datePresets = [
  ['any', 'Any time'], ['today', 'Today'], ['yesterday', 'Yesterday'], ['last7', 'Last 7 days'],
  ['thisWeek', 'This week'], ['lastWeek', 'Last week'], ['last30', 'Last 30 days'],
  ['thisMonth', 'This month'], ['lastMonth', 'Last month'], ['custom', 'Custom range']
];

export function defaultFilters() {
  return { sources: [], accounts: [], collections: [], topics: [], folder: '', collection: '', collectionName: '', date: 'any', start: 'all', end: 'now', from: '', to: '' };
}

export function dateStops(now = new Date()) {
  const today = day(now), previousMonth = new Date(today.getFullYear(), today.getMonth(), 0);
  const month = new Date(previousMonth.getFullYear(), previousMonth.getMonth(), Math.min(today.getDate(), previousMonth.getDate()));
  const past = [
    { key: 'month', label: '1 month ago', short: '1mo', date: month },
    { key: 'days30', label: '30 days ago', short: '30d', date: shift(today, -30) },
    { key: 'week', label: '1 week ago', short: '7d', date: shift(today, -7) },
    { key: 'yesterday', label: 'Yesterday', short: '1d', date: shift(today, -1) },
    { key: 'today', label: 'Today', short: 'Today', date: today }
  ].sort((a, b) => a.date - b.date);
  return [{ key: 'all', label: 'All Time', short: '−∞', date: null }, ...past, { key: 'now', label: 'Now', short: 'Now', date: new Date(now) }];
}

export function dateRangeSummary(filters, now = new Date()) {
  if (filters.date === 'any') return 'All time → Now';
  const stops = dateStops(now), start = stops.find(s => s.key === filters.start), end = stops.find(s => s.key === filters.end);
  if (start?.key === 'today' && end?.key === 'now') return 'Today';
  if (start?.key === 'yesterday' && end?.key === 'today') return 'Yesterday';
  return `${start?.label || 'All time'} → ${end?.label || 'Now'}`;
}

export function accountOptions(posts, catalog = [], { pinterest = false } = {}) {
  const result = [];
  // Pinterest syncs from the desktop app, so elsewhere it appears only if a library already has pins.
  for (const platform of ['instagram', 'x', ...(pinterest || posts.some(post => post.platform === 'pinterest') ? ['pinterest'] : [])]) {
    const saved = posts.filter(p => p.platform === platform), handles = new Map();
    for (const handle of [...saved.flatMap(p => p.accounts || []), ...(platform === 'x' ? catalog.map(a => a.handle) : [])]) {
      if (handle) handles.set(handle.toLowerCase(), handle);
    }
    for (const [key, label] of [...handles].sort(([a], [b]) => a.localeCompare(b))) result.push({ value: `${platform}:${key}`, platform, label });
    if (!handles.size) result.push({ value: `${platform}:*`, platform, label: platform === 'x' ? 'X' : platform === 'pinterest' ? 'Pinterest' : 'Instagram' });
    else if (saved.some(p => !(p.accounts || []).length)) result.push({ value: `${platform}:`, platform, label: 'Unassigned' });
  }
  result.push({ value: 'chrome:*', platform: 'chrome', label: 'Chrome' });
  return result;
}

function matchesAccount(post, value) {
  const colon = value.indexOf(':'), platform = value.slice(0, colon), handle = value.slice(colon + 1);
  return post.platform === platform && (handle === '*' || (handle ? (post.accounts || []).some(a => a.toLowerCase() === handle) : !(post.accounts || []).length));
}
function day(date) { return new Date(date.getFullYear(), date.getMonth(), date.getDate()); }
function shift(date, days) { const result = new Date(date); result.setDate(result.getDate() + days); return result; }
function localDate(value) {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
  if (!parts) return null;
  const [, y, m, d] = parts.map(Number), date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d ? date : null;
}
export function dateBounds(filters, now = new Date()) {
  const today = day(now), tomorrow = shift(today, 1);
  const monday = shift(today, -((today.getDay() + 6) % 7));
  switch (filters.date) {
    case 'timeline': {
      const stops = dateStops(now), start = stops.findIndex(s => s.key === filters.start), end = stops.findIndex(s => s.key === filters.end);
      if (start < 0 || end <= start) return { error: 'Choose the start before the end' };
      return { from: stops[start].date, to: end === stops.length - 1 ? new Date(+now + 1) : stops[end].date };
    }
    case 'today': return { from: today, to: tomorrow };
    case 'yesterday': return { from: shift(today, -1), to: today };
    case 'last7': return { from: shift(today, -6), to: tomorrow };
    case 'thisWeek': return { from: monday, to: shift(monday, 7) };
    case 'lastWeek': return { from: shift(monday, -7), to: monday };
    case 'last30': return { from: shift(today, -29), to: tomorrow };
    case 'thisMonth': return { from: new Date(today.getFullYear(), today.getMonth(), 1), to: new Date(today.getFullYear(), today.getMonth() + 1, 1) };
    case 'lastMonth': return { from: new Date(today.getFullYear(), today.getMonth() - 1, 1), to: new Date(today.getFullYear(), today.getMonth(), 1) };
    case 'custom': {
      if (!filters.from && !filters.to) return { error: 'Choose a start or end date' };
      const from = localDate(filters.from), end = localDate(filters.to);
      if ((filters.from && !from) || (filters.to && !end)) return { error: 'Choose a valid date' };
      if (from && end && from > end) return { error: 'End date must be on or after start date' };
      return { from, to: end ? shift(end, 1) : null };
    }
    default: return { from: null, to: null };
  }
}

export function applyFilters(posts, filters = defaultFilters(), { query = '', now = new Date(), topicScope = name => [name] } = {}) {
  const bounds = dateBounds(filters, now);
  if (bounds.error) return [];
  const term = query.trim().toLowerCase();
  const result = posts.filter(p => {
    if (filters.sources.length && !filters.sources.includes(p.platform)) return false;
    if (filters.topics.length && !filters.topics.flatMap(topicScope).some(t => (p.topics || []).includes(t))) return false;
    // Shift-selected accounts and Instagram collections combine: a post in any of them matches.
    const collections = filters.collections || [];
    if ((filters.accounts.length || collections.length) && !filters.accounts.some(value => matchesAccount(p, value)) && !(p.collections || []).some(c => collections.includes(String(c.id)))) return false;
    if (filters.folder && !(p.folders || []).includes(filters.folder)) return false;
    if (filters.collection && !(p.collections || []).some(c => String(c.id) === String(filters.collection))) return false;
    if (bounds.from || bounds.to) {
      const timestamp = Date.parse(libraryAddedAt(p));
      if (!Number.isFinite(timestamp) || (bounds.from && timestamp < +bounds.from) || (bounds.to && timestamp >= +bounds.to)) return false;
    }
    if (term && ![p.text, p.title, p.bookmarkTitle, p.author, p.authorName, p.notes, p.url, ...(p.tags || []), ...(p.topics || []), ...(p.accounts || []), ...(p.folders || [])].join(' ').toLowerCase().includes(term)) return false;
    return true;
  });
  return orderLibraryPosts(result, filters, +now);
}

const SOURCE_NAMES = { x: 'X', instagram: 'Instagram', pinterest: 'Pinterest', chrome: 'Chrome' };
export function filterChips(filters, { collectionName = () => '', collectionPlatform = () => 'instagram' } = {}) {
  const chips = [], folderKind = platform => platform === 'pinterest' ? 'Pinterest board' : 'Instagram collection';
  if (filters.date !== 'any') chips.push({ key: 'date', label: filters.date === 'timeline' ? dateRangeSummary(filters) : datePresets.find(([key]) => key === filters.date)?.[1] || 'Date', title: 'Date added' });
  if (filters.sources.length && !filters.accounts.length) chips.push({ key: 'sources', label: filters.sources.map(s => SOURCE_NAMES[s]).join(' + ') });
  for (const value of filters.accounts) {
    const colon = value.indexOf(':'), platform = value.slice(0, colon), handle = value.slice(colon + 1);
    const source = SOURCE_NAMES[platform];
    const label = handle === '*' ? source : handle || 'Unassigned';
    chips.push({ key: `account:${value}`, label, platform, title: `${source} ${label}`, removeLabel: `Remove ${source} ${label} filter` });
  }
  for (const id of filters.collections || []) { const kind = folderKind(collectionPlatform(id)); chips.push({ key: `collection:${id}`, label: collectionName(id) || kind, platform: collectionPlatform(id), title: kind, removeLabel: `Remove ${collectionName(id) || kind} filter` }); }
  for (const topic of filters.topics) chips.push({ key: `topic:${topic}`, label: topic, icon: 'folder', title: 'Topic', removeLabel: `Remove ${topic} filter` });
  if (filters.folder) chips.push({ key: 'folder', label: filters.folder });
  if (filters.collection) { const kind = folderKind(collectionPlatform(filters.collection)); chips.push({ key: 'collection', label: filters.collectionName || kind, title: kind }); }
  return chips;
}
