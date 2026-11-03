import { visibleInstagramSaves } from './instagram-save-lists.js';
import { accountOptions } from './filters.js';

// Source-account metadata identifies the saver; creator handles never enter this list.
export function sidebarAccounts(posts, catalog = [], collections = [], saveLists = {}) {
  let options = accountOptions(posts, catalog).filter(option => option.platform !== 'chrome');
  for (const collection of collections) {
    const handle = collection.account;
    if (!handle) continue;
    const value = `instagram:${handle.toLowerCase()}`;
    if (!options.some(option => option.value === value)) options.push({ value, platform: 'instagram', label: handle });
  }
  for (const platform of ['instagram', 'x']) if (options.some(option => option.platform === platform && option.value.startsWith(`${platform}:@`))) options = options.filter(option => option.value !== `${platform}:*`);
  const live = posts.filter(post => !post.archived);
  return options.sort((a, b) => (a.platform === 'x' ? 0 : 1) - (b.platform === 'x' ? 0 : 1) || a.label.localeCompare(b.label)).map(option => {
    const handle = option.value.slice(option.platform.length + 1);
    const available = option.platform === 'instagram' ? visibleInstagramSaves(live, saveLists, [option.value]) : live;
    const count = available.filter(post => post.platform === option.platform && (handle === '*' || (handle ? (post.accounts || []).some(account => account.toLowerCase() === handle) : !(post.accounts || []).length))).length;
    return { ...option, count };
  });
}
