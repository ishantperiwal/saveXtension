const dateNumber = date => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
const today = { key: 'added-today', label: 'Added today', description: 'First added to saveXtension today in your local time' };
const earlier = { key: 'added-earlier', label: 'Added earlier', description: 'Added before today' };

export function libraryAddedAt(post) {
  // Legacy clients may omit the new field. Explicit null means the historical
  // app import date is unknown; never substitute a bookmark creation date.
  return post.addedAt === undefined ? post.savedAt : post.addedAt;
}
export function addedTimeGroup(addedAt, now = Date.now()) {
  const timestamp = Date.parse(addedAt);
  return Number.isFinite(timestamp) && dateNumber(new Date(timestamp)) === dateNumber(new Date(now)) ? today : earlier;
}
export function addedTimeKey(posts, now = Date.now()) {
  return `${dateNumber(new Date(now))}:${posts.map(post => addedTimeGroup(libraryAddedAt(post), now).key).join(',')}`;
}
