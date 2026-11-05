import { instagramSaveSelection } from '../public/instagram-save-lists.js';
import { HttpError } from './domain.mjs';

export function instagramSaveLists(store) {
  try { return JSON.parse(store.get('instagram_save_lists') || '{}'); }
  catch { return {}; }
}
export function setInstagramSaveList(store, { account, collectionIds, all }) {
  if (typeof account !== 'string' || !/^@[\w.]{1,100}$/.test(account)) throw new HttpError(400, 'Choose an Instagram account.');
  const lists = instagramSaveLists(store), key = account.toLowerCase();
  if (all !== undefined && typeof all !== 'boolean') throw new HttpError(400, 'Choose a valid All option.');
  if (all === undefined && collectionIds === null) delete lists[key];
  else {
    if (!Array.isArray(collectionIds) || (!collectionIds.length && all !== true) || collectionIds.length > 1000 || collectionIds.some(id => !Number.isSafeInteger(id) || id < 1)) throw new HttpError(400, 'Choose All or at least one collection.');
    const owned = new Set(store.instagramCollections().filter(c => c.platform === 'instagram' && c.account.toLowerCase() === key).map(c => c.id));
    if (collectionIds.some(id => !owned.has(id))) throw new HttpError(400, 'Choose collections belonging to this Instagram account.');
    const ids = [...new Set(collectionIds)];
    lists[key] = all === undefined ? ids : { all, collectionIds: ids };
  }
  store.set('instagram_save_lists', JSON.stringify(lists));
  return lists;
}
export function instagramSyncScope(store, account = 'current', collectionId = null) {
  if (account !== 'current' && (typeof account !== 'string' || !/^@[\w.]{1,100}$/.test(account))) throw new HttpError(400, 'Choose an Instagram account.');
  if (collectionId !== null) {
    if (!Number.isSafeInteger(collectionId) || collectionId < 1) throw new HttpError(400, 'Choose a valid Instagram collection.');
    const collection = store.instagramCollections().find(item => item.id === collectionId && item.platform === 'instagram');
    if (!collection || account !== 'current' && collection.account.toLowerCase() !== account.toLowerCase()) throw new HttpError(400, 'Choose a collection belonging to this Instagram account.');
    return {account:collection.account,selections:{[collection.account.toLowerCase()]:[collection.id]}};
  }
  const lists = instagramSaveLists(store), selections = {};
  for (const handle of Object.keys(lists)) {
    const selected = instagramSaveSelection(handle, lists);
    if (selected !== null) selections[handle] = selected;
  }
  return account === 'current' && !Object.keys(selections).length ? null : { account, selections };
}
