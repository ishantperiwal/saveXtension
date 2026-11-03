export function instagramSaveList(account, lists = {}) {
  const handle = String(account).replace(/^instagram:/, '').toLowerCase();
  const value = lists[handle];
  if (Array.isArray(value)) return { all: false, collectionIds: value };
  if (value && typeof value.all === 'boolean' && Array.isArray(value.collectionIds)) return value;
  // Existing libraries keep all collections listed until customized.
  return { all: true, collectionIds: null };
}
export function instagramSaveSelection(account, lists = {}) {
  const value = instagramSaveList(account, lists);
  return value.all ? null : value.collectionIds;
}
export function visibleInstagramSaves(posts, lists = {}, accounts = []) {
  return posts.filter(post => {
    if (post.platform !== 'instagram' || !post.accounts?.length) return true;
    return post.accounts.some(account => {
      if (accounts.length && !accounts.some(value => value === 'instagram:*' || value.toLowerCase() === `instagram:${account.toLowerCase()}`)) return false;
      const selected = instagramSaveSelection(account, lists);
      return selected === null || (post.collections || []).some(collection => collection.account?.toLowerCase() === account.toLowerCase() && selected.includes(Number(collection.id)));
    });
  });
}
