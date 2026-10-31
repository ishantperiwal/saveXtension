import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultFilters, dateBounds, applyFilters, filterChips, accountOptions, dateStops, dateRangeSummary } from '../public/filters.js';

const now = new Date(2026, 10, 1, 12); // Sunday, at a month boundary.
const iso = (y, m, d, h = 12) => new Date(y, m - 1, d, h).toISOString();
const posts = [
  { id: 1, platform: 'x', kind: 'video', savedAt: iso(2026, 11, 1), publishedAt: iso(2026, 10, 2), topics: ['Design'], accounts: ['@one'], notes: 'Keep this', url: 'https://x.com/i/status/1' },
  { id: 2, platform: 'instagram', kind: 'image', savedAt: iso(2026, 10, 31, 23), publishedAt: null, topics: ['Design'], accounts: ['@ig'], notes: '', url: 'https://instagram.com/p/abc/' },
  { id: 3, platform: 'chrome', kind: 'text', savedAt: iso(2026, 10, 25), topics: ['Coding'], accounts: [], folders: ['Bookmarks bar / Reading'], notes: 'Read on Sunday', url: 'https://example.com/reference' },
  { id: 4, platform: 'x', kind: 'text', savedAt: iso(2026, 10, 1), topics: ['Coding'], accounts: ['@two'], notes: '', url: 'https://x.com/i/status/4' }
];
const ids = filters => applyFilters(posts, { ...defaultFilters(), ...filters }, { now }).map(p => p.id);

test('calendar week/month presets differ from rolling days and include full local days', () => {
  assert.deepEqual(ids({ date: 'today' }), [1]);
  assert.deepEqual(ids({ date: 'yesterday' }), [2]);
  assert.deepEqual(ids({ date: 'last7' }), [1, 2]);
  assert.deepEqual(ids({ date: 'lastWeek' }), [3]);
  assert.deepEqual(ids({ date: 'lastMonth' }), [2, 3, 4]);
  assert.deepEqual(ids({ date: 'last30' }), [1, 2, 3]);
  const january = dateBounds({ date: 'lastMonth' }, new Date(2026, 0, 5));
  assert.equal(january.from.getFullYear(), 2025); assert.equal(january.from.getMonth(), 11); assert.equal(january.to.getMonth(), 0);
});

test('custom ranges include the end date, support open endpoints and reject invalid dates', () => {
  assert.deepEqual(ids({ date: 'custom', from: '2026-10-31', to: '2026-10-31' }), [2]);
  assert.deepEqual(ids({ date: 'custom', from: '2026-10-31', to: '' }), [1, 2]);
  assert.deepEqual(ids({ date: 'custom', from: '', to: '2026-10-01' }), [4]);
  assert.match(dateBounds({ date: 'custom', from: '2026-10-31', to: '2026-10-01' }).error, /End date/);
  assert.match(dateBounds({ date: 'custom', from: '2026-02-31' }).error, /valid date/);
});

test('dates always use when a post was saved, regardless of publication time', () => {
  assert.deepEqual(ids({ date: 'lastMonth', dateField: 'publishedAt' }), [2, 3, 4]);
  assert.deepEqual(ids({ date: 'yesterday' }), [2]);
});

test('source/topic unions combine with multiple source accounts, folders and search', () => {
  assert.deepEqual(ids({ sources: ['x', 'instagram'], topics: ['Design', 'Coding'] }), [1, 2, 4]);
  assert.deepEqual(ids({ accounts: ['x:@two'] }), [4]);
  assert.deepEqual(ids({ accounts: ['x:@one', 'x:@two'] }), [1, 4]);
  assert.deepEqual(ids({ accounts: ['x:@one', 'instagram:@ig'] }), [1, 2]);
  assert.deepEqual(ids({ accounts: ['chrome:*'], folder: 'Bookmarks bar / Reading' }), [3]);
  assert.deepEqual(applyFilters(posts, { ...defaultFilters(), topics: ['Coding'] }, { query: 'Sunday', now }).map(p => p.id), [3]);
  assert.equal(filterChips({ ...defaultFilters(), date: 'lastWeek', sources: ['x'] }).length, 2);
});

test('account filters are platform-specific, case-insensitive and do not duplicate shared saves', () => {
  const saved = posts.map(p => p.id === 1 ? { ...p, accounts: ['@One', '@two'] } : p.id === 2 ? { ...p, accounts: ['@one'] } : p);
  const match = accounts => applyFilters(saved, { ...defaultFilters(), accounts }, { now }).map(p => p.id);
  assert.deepEqual(match(['x:@one']), [1]);
  assert.deepEqual(match(['x:@one', 'x:@two']), [1, 4]);
  assert.deepEqual(match(['x:@one', 'instagram:@one']), [1, 2]);
  const chips = filterChips({ ...defaultFilters(), sources: ['x'], accounts: ['x:@one', 'x:@two'] });
  assert.deepEqual(chips.map(c => c.label), ['@one', '@two']);
});

test('account choices include discovered X handles, retain source platforms and distinguish unassigned saves', () => {
  const options = accountOptions([...posts, { platform: 'x', accounts: [] }], [{ handle: '@THREE' }]);
  assert(options.some(o => o.value === 'x:@three' && o.label === '@THREE'));
  assert(options.some(o => o.value === 'x:' && o.label === 'Unassigned'));
  assert(options.some(o => o.value === 'instagram:@ig'));
  assert(!options.some(o => o.value === 'x:*'));
  assert(accountOptions([]).some(o => o.value === 'instagram:*'));
});


test('timeline endpoints use ordered calendar boundaries and a movable latest date', () => {
  assert.deepEqual(ids({ date: 'timeline', start: 'today', end: 'now' }), [1]);
  assert.deepEqual(ids({ date: 'timeline', start: 'yesterday', end: 'today' }), [2]);
  assert.deepEqual(ids({ date: 'timeline', start: 'week', end: 'now' }), [1, 2, 3]);
  assert.deepEqual(ids({ date: 'timeline', start: 'month', end: 'today' }), [2, 3, 4]);
  const openStart = dateBounds({ date: 'timeline', start: 'all', end: 'week' }, now);
  assert.equal(openStart.from, null); assert.equal(+openStart.to, +new Date(2026, 9, 25));
  assert.match(dateBounds({ date: 'timeline', start: 'today', end: 'week' }, now).error, /start before/);
  assert.match(dateBounds({ date: 'timeline', start: 'all', end: 'all' }, now).error, /start before/);
  assert.equal(dateRangeSummary({ date: 'timeline', start: 'yesterday', end: 'today' }, now), 'Yesterday');
});

test('month and 30-day slider stops stay chronological across short months and year boundaries', () => {
  const march = dateStops(new Date(2026, 2, 1, 12));
  assert(march.findIndex(s => s.key === 'days30') < march.findIndex(s => s.key === 'month'));
  const lastDay = dateStops(new Date(2026, 2, 31, 12)).find(s => s.key === 'month').date;
  assert.equal(lastDay.getMonth(), 1); assert.equal(lastDay.getDate(), 28);
  const january = dateStops(new Date(2026, 0, 5, 12)).find(s => s.key === 'month').date;
  assert.equal(january.getFullYear(), 2025); assert.equal(january.getMonth(), 11);
  for (let month = 0; month < 12; month++) {
    const dates = dateStops(new Date(2026, month, 1, 12)).slice(1).map(s => +s.date);
    assert.deepEqual(dates, [...dates].sort((a, b) => a - b));
  }
});
