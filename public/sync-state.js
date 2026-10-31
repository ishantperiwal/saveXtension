// A missing response in this browser does not mean the helper is absent in Chrome.
export function syncAvailability(browser, bridge, targets = ['x']) {
  const social = !targets.some(t => t !== 'chrome') || bridge?.ready || (browser?.online && browser.ready);
  const bookmarks = !targets.includes('chrome') || bridge?.bookmarksReady || (browser?.online && browser.bookmarksReady);
  if (social && bookmarks) return 'ready';
  if (bridge || browser?.online) return 'permissions';
  if (browser) return 'offline';
  return 'missing';
}

export function lastSyncTime(sync, runs = []) {
  const finished = new Set(['completed', 'partial']);
  const dates = [sync?.lastSyncedAt, ...runs.filter(run => finished.has(run.status)).map(run => run.finishedAt)];
  if (finished.has(sync?.job?.status)) dates.push(sync.job.updated_at || sync.job.updatedAt);
  const timestamps = dates.map(value => Date.parse(value)).filter(Number.isFinite);
  return timestamps.length ? new Date(Math.max(...timestamps)).toISOString() : null;
}

export function syncAge(timestamp, now = Date.now(), { long = false } = {}) {
  const time = Date.parse(timestamp);
  if (!Number.isFinite(time)) return null;
  const minutes = Math.max(0, (Number(now) - time) / 60000);
  if (minutes < 1) return 'just now';
  const age = (amount, unit, short) => long ? `${Math.floor(amount)} ${unit}${Math.floor(amount) === 1 ? '' : 's'} ago` : `${Math.floor(amount)}${short} ago`;
  if (minutes < 60) return age(minutes, 'minute', 'm');
  const hours = minutes / 60;
  if (hours < 24) return age(hours, 'hour', 'h');
  const days = hours / 24;
  if (days < 7) return age(days, 'day', 'd');
  if (days < 30) return age(days / 7, 'week', 'w');
  if (days < 365) return age(days / 30, 'month', 'mo');
  return age(days / 365, 'year', 'y');
}
