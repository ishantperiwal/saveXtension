import { addedTimeGroup, libraryAddedAt } from './saved-time.js';
const time = value => Date.parse(value) || 0;
const newestImport = (a,b) => time(libraryAddedAt(b)) - time(libraryAddedAt(a)) || b.id - a.id;
const compare = (a,b) => time(b.observedAt) - time(a.observedAt) || (b.runOrder || 0) - (a.runOrder || 0) || a.position - b.position;
export function xSequenceAccount(filters = {}) {
  const selected = filters.accounts || [];
  return selected.length === 1 && /^x:@[\w]+$/i.test(selected[0]) ? selected[0].slice(2).toLowerCase() : null;
}
// There is no common bookmark order across accounts/platforms. Keep their
// existing slots within each date group and order each X account's subsequence.
export function orderLibraryPosts(posts, filters = {}, now = Date.now()) {
  const result = [...posts].sort(newestImport), buckets = new Map(), owners = new Map();
  const sequenceAccount = xSequenceAccount(filters);
  for (const post of result) {
    if (post.platform !== 'x') continue;
    const selected = (filters.accounts || []).filter(value => value.startsWith(`${post.platform}:`)).map(value => value.slice(post.platform.length+1).toLowerCase());
    const matches = account => !selected.length || selected.includes('*') || selected.includes(account.toLowerCase());
    const entries = (post.sourceOrder || []).filter(entry => matches(entry.account));
    entries.sort(compare);
    const account = entries[0]?.account?.toLowerCase() || (post.accounts || []).map(a => a.toLowerCase()).filter(matches).sort()[0];
    if (!account) continue;
    const key = `${sequenceAccount ? 'source-sequence' : addedTimeGroup(libraryAddedAt(post), now).key}:${post.platform}:${account}`;
    owners.set(post,key);
    if (!buckets.has(key)) buckets.set(key,[]);
    buckets.get(key).push({post, order:entries.find(entry=>entry.account.toLowerCase()===account) || {observedAt:libraryAddedAt(post),position:-post.id}});
  }
  for (const entries of buckets.values()) entries.sort((a,b)=>compare(a.order,b.order));
  const offsets = new Map();
  return result.map(post => {
    const key = owners.get(post); if (!key) return post;
    const offset = offsets.get(key) || 0; offsets.set(key,offset+1);
    return buckets.get(key)[offset].post;
  });
}
