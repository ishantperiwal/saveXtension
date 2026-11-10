import { instagramSaveSelection, visibleInstagramSaves } from '../public/instagram-save-lists.js';
import { HttpError } from './domain.mjs';

export function instagramSaveLists(store) {
  try { return JSON.parse(store.get('instagram_save_lists') || '{}'); }
  catch { return {}; }
}
// The library's own visibility rule, for anything outside the UI that must show the same saves.
export const instagramSaveVisible = (store, post) => visibleInstagramSaves([post], instagramSaveLists(store)).length > 0;
export function hiddenInstagramSaveIds(store) {
  const lists = instagramSaveLists(store);
  if (!Object.keys(lists).length) return [];
  // This runs on most MCP calls, so load only what visibleInstagramSaves reads instead of hydrating every save.
  const collections = new Map();
  for (const { post_id, id, account } of store.db.prepare('SELECT m.post_id,c.id,c.account FROM instagram_collection_posts m JOIN instagram_collections c ON c.id=m.collection_id').all()) {
    if (!collections.has(post_id)) collections.set(post_id, []);
    collections.get(post_id).push({ id, account });
  }
  const posts = store.db.prepare('SELECT id,platform,accounts FROM posts').all().map(post => ({ ...post, accounts: JSON.parse(post.accounts), collections: collections.get(post.id) || [] }));
  const visible = new Set(visibleInstagramSaves(posts, lists).map(post => post.id));
  return posts.filter(post => !visible.has(post.id)).map(post => post.id);
}
export const instagramCollectionVisible = (store, collection) => {
  if (!['instagram', 'pinterest'].includes(collection.platform)) return true;
  const selected = instagramSaveSelection(`${collection.platform}:${collection.account}`, instagramSaveLists(store));
  return selected === null || selected.includes(collection.id);
};
export function setInstagramSaveList(store, { platform = 'instagram', account, collectionIds, all }) {
  if (!['instagram', 'pinterest'].includes(platform)) throw new HttpError(400, 'Choose Instagram or Pinterest.');
  const source = platform === 'pinterest' ? 'Pinterest' : 'Instagram';
  if (typeof account !== 'string' || !/^@[\w.-]{1,100}$/.test(account)) throw new HttpError(400, `Choose ${platform === 'pinterest' ? 'a' : 'an'} ${source} account.`);
  const handle = account.toLowerCase(), key = platform === 'pinterest' ? `pinterest:${handle}` : handle, lists = instagramSaveLists(store);
  if (all !== undefined && typeof all !== 'boolean') throw new HttpError(400, 'Choose a valid All option.');
  if (all === undefined && collectionIds === null) delete lists[key];
  else {
    if (!Array.isArray(collectionIds) || (!collectionIds.length && all !== true) || collectionIds.length > 1000 || collectionIds.some(id => !Number.isSafeInteger(id) || id < 1)) throw new HttpError(400, 'Choose All or at least one collection.');
    const owned = new Set(store.instagramCollections().filter(c => c.platform === platform && c.account.toLowerCase() === handle).map(c => c.id));
    if (collectionIds.some(id => !owned.has(id))) throw new HttpError(400, `Choose ${platform === 'pinterest' ? 'boards' : 'collections'} belonging to this ${source} account.`);
    const ids = [...new Set(collectionIds)];
    lists[key] = all === undefined ? ids : { all, collectionIds: ids };
  }
  store.set('instagram_save_lists', JSON.stringify(lists));
  return lists;
}
// What a sync may fetch per handle. An account set to All has no entry.
export function saveListSelections(store, platform) {
  const lists = instagramSaveLists(store), pinterest = platform === 'pinterest', selections = {};
  for (const key of Object.keys(lists)) {
    if (key.startsWith('pinterest:') !== pinterest) continue;
    const selected = instagramSaveSelection(key, lists);
    if (selected !== null) selections[pinterest ? key.slice('pinterest:'.length) : key] = selected;
  }
  return selections;
}
export function instagramSyncScope(store, account = 'current', collectionId = null) {
  if (account !== 'current' && (typeof account !== 'string' || !/^@[\w.]{1,100}$/.test(account))) throw new HttpError(400, 'Choose an Instagram account.');
  if (collectionId !== null) {
    if (!Number.isSafeInteger(collectionId) || collectionId < 1) throw new HttpError(400, 'Choose a valid Instagram collection.');
    const collection = store.instagramCollections().find(item => item.id === collectionId && item.platform === 'instagram');
    if (!collection || account !== 'current' && collection.account.toLowerCase() !== account.toLowerCase()) throw new HttpError(400, 'Choose a collection belonging to this Instagram account.');
    return {account:collection.account,refresh:true,selections:{[collection.account.toLowerCase()]:[collection.id]}};
  }
  const selections = saveListSelections(store, 'instagram');
  return account === 'current' && !Object.keys(selections).length ? null : { account, selections };
}
