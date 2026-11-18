const dateNumber = date => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
const today = { key: 'added-today', label: 'Added today', description: 'First added to saveXtension today, or in the last 6 hours' };
const earlier = { key: 'added-earlier', label: 'Added earlier', description: 'Added before today' };

export function libraryAddedAt(post) {
  // Legacy clients may omit the new field. Explicit null means the historical
  // app import date is unknown; never substitute a bookmark creation date.
  return post.addedAt === undefined ? post.savedAt : post.addedAt;
}
// Today means today's date or the last 6 hours, so something saved just before midnight still counts as new after it
// (user's decision, 2026-11-18). The New tag, the Added today group and row, and "Added today" beside a name all use this.
export const RECENT_HOURS = 6;
export function addedToday(addedAt, now = Date.now()) {
  const timestamp = Date.parse(addedAt);
  if (!Number.isFinite(timestamp)) return false;
  return dateNumber(new Date(timestamp)) === dateNumber(new Date(now)) || (now - timestamp >= 0 && now - timestamp < RECENT_HOURS * 3600000);
}
export function addedTimeGroup(addedAt, now = Date.now()) {
  return addedToday(addedAt, now) ? today : earlier;
}
export function addedTimeKey(posts, now = Date.now()) {
  return `${dateNumber(new Date(now))}:${posts.map(post => addedTimeGroup(libraryAddedAt(post), now).key).join(',')}`;
}
