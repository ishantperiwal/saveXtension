import { hiddenInstagramSaveIds, saveListSelections } from './instagram-save-lists.mjs';
import { canonicalPost } from './domain.mjs';

// MEMORY is also what the app shows Instagram and Pinterest in their site's order from, so it covers a whole library.
const QUICK_LIMIT = 5, DEEP_LIMIT = 25, MEMORY = 5000, DAY = 86400000;
const orderKey = (platform, account, collectionId) => `list-order:${platform}:${account.toLowerCase()}:${collectionId || 'all'}`;
const readingKey = (platform, account, collectionId) => `list-reading:${platform}:${account.toLowerCase()}:${collectionId || 'all'}`;
const unfinishedKey = (platform, account, collectionId) => `list-unfinished:${platform}:${account.toLowerCase()}:${collectionId || 'all'}`;

// A quick scan stops at posts it knows, so a scan cut short mid-way through new posts must not make them count as
// known, or the next one stops at them and never reads the rest. Until a list's scan finishes, what counts as known
// stays what was known when that unfinished scan began.
export function knownForScan(store, platform, account, collectionId, known) {
  const key = unfinishedKey(platform, account, collectionId), held = store.get(key);
  if (held) { try { return JSON.parse(held); } catch { /* Start again from what's known now. */ } }
  store.set(key, JSON.stringify(known));
  return known;
}
export function listScanFinished(store, run, status) {
  if (!run.account) return;
  if (status === 'completed') store.db.prepare('DELETE FROM settings WHERE key=?').run(unfinishedKey(run.platform, run.account, run.collection_id));
  settleListRead(store, run.platform, run.account, run.collection_id, status === 'completed');
}
// Posts appear in the app while a scan is still reading, and a scan can stop partway, so the order is kept as each batch
// arrives, not only at the end. A finished scan's full read replaces this in missingFromList. A stopped scan's read is
// kept on top of what was remembered, which is safe because a stopped All posts read always makes the collections get read.
export function listReadSoFar(store, run, posts) {
  if (!['instagram', 'pinterest'].includes(run.platform) || !run.account) return;
  const key = readingKey(run.platform, run.account, run.collection_id);
  let held = null;
  try { held = JSON.parse(store.get(key) || 'null'); } catch { /* Starts again. */ }
  // The app closed during the last scan of this list, so what that one read is settled first.
  if (held && held.run !== run.id) { settleListRead(store, run.platform, run.account, run.collection_id); held = null; }
  const ids = held?.ids || [], read = new Set(ids);
  for (const post of posts) {
    let externalId = null;
    try { externalId = canonicalPost(post?.url).externalId; } catch { continue; }
    if (externalId && !read.has(externalId)) { read.add(externalId); ids.push(externalId); }
  }
  store.set(key, JSON.stringify({ run: run.id, ids: ids.slice(0, MEMORY) }));
}
function settleListRead(store, platform, account, collectionId, discard = false) {
  const key = readingKey(platform, account, collectionId);
  if (!discard) {
    let ids = [], known = [];
    try { ids = JSON.parse(store.get(key) || 'null')?.ids || []; known = JSON.parse(store.get(orderKey(platform, account, collectionId)) || '[]'); } catch { /* Nothing to keep. */ }
    if (ids.length) { const read = new Set(ids); store.set(orderKey(platform, account, collectionId), JSON.stringify([...ids, ...known.filter(id => !read.has(id))].slice(0, MEMORY))); }
  }
  store.db.prepare('DELETE FROM settings WHERE key=?').run(key);
}
// Every Instagram save appears in All posts and every pin in All pins, so reading that one list says whether the collections or
// boards need reading. Returns false only when nothing changed and no earlier pass was left unfinished. Any doubt means read them.
export function savedListGate(store, run, { status, seenIds, collectionsDone, reachedEnd }) {
  if (!['instagram', 'pinterest'].includes(run.platform) || !run.account) return undefined;
  const account = run.account.toLowerCase(), pending = `${run.platform}-collections-pending:${account}`;
  // A collection no longer ticked won't be read again, so it can't count as unfinished.
  const ticked = saveListSelections(store, run.platform)[account];
  const unfinished = () => store.db.prepare('SELECT key FROM settings WHERE key LIKE ?').all(`list-unfinished:${run.platform}:${account}:%`).map(row => row.key.split(':').pop()).some(id => id !== 'all' && (!ticked || ticked.includes(Number(id))));
  if (run.collection_id) {
    if (collectionsDone && !unfinished()) store.db.prepare('DELETE FROM settings WHERE key=?').run(pending);
    return undefined;
  }
  let remembered = [];
  try { remembered = JSON.parse(store.get(orderKey(run.platform, run.account, null)) || '[]'); } catch { /* Treated as changed. */ }
  let last = -1, changed = status !== 'completed' || !Array.isArray(seenIds) || !remembered.length || !!store.get(pending) || !!unfinished();
  for (const id of changed ? [] : seenIds) {
    const index = remembered.indexOf(id);
    if (index < last || index < 0) { changed = true; break; }
    last = index;
  }
  // Only reading a board can confirm a pin left it, so a pin gone from All pins, or one waiting on its second board read, means reading the boards.
  if (!changed && run.platform === 'pinterest') {
    const read = new Set(seenIds);
    changed = remembered.slice(0, reachedEnd ? remembered.length : last + 1).some(id => !read.has(id)) || !!store.db.prepare(`SELECT 1 FROM settings WHERE key LIKE 'pin-missing:%' LIMIT 1`).get();
  }
  if (changed) store.set(pending, '1');
  return changed;
}

// Works out which saved posts a finished scan expected to see but didn't. Nothing here removes
// anything: a post missing from a list is only a reason to go and check that post itself.
// A quick scan only reads the top of a list, so it compares against the order it remembers from last
// time, and only for the stretch it actually read. A scan that reached a collection's end covers all of it.
export function missingFromList(store, run, { status, seenIds, reachedEnd }) {
  if (status !== 'completed' || !Array.isArray(seenIds) || !['x', 'instagram', 'pinterest'].includes(run.platform) || !run.account) return [];
  const seen = seenIds.filter(id => typeof id === 'string').slice(0, 2000), read = new Set(seen);
  const key = orderKey(run.platform, run.account, run.collection_id);
  let known = [];
  try { known = JSON.parse(store.get(key) || '[]'); } catch { /* It starts again from this scan. */ }
  const lastRead = known.reduce((last, id, index) => read.has(id) ? index : last, -1);
  store.set(key, JSON.stringify([...seen, ...known.slice(lastRead + 1).filter(id => !read.has(id))].slice(0, MEMORY)));
  // Pinterest only remembers the order here, because a pin leaving a board is checked by two full board reads.
  if (run.platform === 'pinterest') return [];
  // X's deep scan has its own check for everything missing.
  if (run.platform === 'x' && run.mode === 'deep') return [];
  const candidates = new Set(known.slice(0, lastRead + 1).filter(id => !read.has(id)));
  if (reachedEnd && run.collection_id) for (const row of store.db.prepare('SELECT p.external_id AS id FROM instagram_collection_posts m JOIN posts p ON p.id=m.post_id WHERE m.collection_id=? AND p.archived=0').all(run.collection_id)) if (!read.has(row.id)) candidates.add(row.id);
  const found = [], hidden = run.platform === 'instagram' ? new Set(hiddenInstagramSaveIds(store)) : new Set();
  for (const externalId of candidates) {
    if (found.length >= (run.mode === 'deep' ? DEEP_LIMIT : QUICK_LIMIT)) break;
    const post = store.db.prepare('SELECT id,url,accounts,archived FROM posts WHERE platform=? AND external_id=?').get(run.platform, externalId);
    // A post the app isn't showing isn't worth a visit.
    if (!post || post.archived || hidden.has(post.id) || !JSON.parse(post.accounts).some(account => account.toLowerCase() === run.account.toLowerCase())) continue;
    // A post that was checked and is still saved, such as one moved out of a collection, isn't checked again on every scan.
    const attempt = `unsave-attempt:${run.account.toLowerCase()}:${post.url}`;
    if (Date.now() - Number(store.get(attempt) || 0) < DAY) continue;
    store.set(attempt, String(Date.now()));
    found.push({ platform: run.platform, account: run.account, externalId, wait: true });
  }
  return found;
}

// Pinterest has no one saved or not-saved state on a pin's own page, because a pin belongs to boards. So what
// confirms an unsave is the board itself: read to its end twice, at least a minute apart, without the pin in it.
// Returns true when a pin is waiting for that second read.
const BOARD_RECHECK = 60000;
export function pinterestBoardChanges(store, run, { status, seenIds, reachedEnd }) {
  if (run.platform !== 'pinterest' || status !== 'completed' || !reachedEnd || !run.collection_id || !Array.isArray(seenIds) || !seenIds.length) return false;
  const read = new Set(seenIds), prefix = `pin-missing:${run.collection_id}:`, forget = key => store.db.prepare('DELETE FROM settings WHERE key=?').run(key);
  const members = store.db.prepare('SELECT p.id,p.external_id AS externalId FROM instagram_collection_posts m JOIN posts p ON p.id=m.post_id WHERE m.collection_id=? AND p.archived=0').all(run.collection_id);
  const missing = members.filter(pin => !read.has(pin.externalId));
  for (const pin of members) if (read.has(pin.externalId)) forget(prefix + pin.externalId);
  // Much of a board vanishing at once looks like a bad read, not like someone unsaving.
  if (missing.length > Math.max(2, members.length * 0.3)) return false;
  let waiting = false;
  for (const pin of missing) {
    const key = prefix + pin.externalId, first = Number(store.get(key) || 0);
    if (!first) { store.set(key, String(Date.now())); waiting = true; }
    else if (Date.now() - first < BOARD_RECHECK) waiting = true;
    else { forget(key); store.pinLeftBoard(pin.id, run.collection_id, true); }
  }
  return waiting;
}

