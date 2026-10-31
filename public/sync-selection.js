// Sync choices are separate from browsing filters. Counts include active saves only.
export function syncAccountOptions(posts, catalog = {}, selected = []) {
  catalog ||= {};
  const live = posts.filter(post => !post.archived);
  const handles = new Map((catalog.accounts || []).map(account => [account.handle.toLowerCase(), account.handle]));
  for (const value of selected || []) if (/^x:@/i.test(value) && !handles.has(value.slice(2).toLowerCase())) handles.set(value.slice(2).toLowerCase(), value.slice(2));
  const options = [...handles].map(([handle, label]) => ({ value: `x:${handle}`, platform: 'x', label, count: live.filter(post => post.platform === 'x' && (post.accounts || []).some(account => account.toLowerCase() === handle)).length }));
  if (!handles.size || !catalog.active && selected?.includes('x:current')) options.unshift({ value: 'x:current', platform: 'x', label: 'Current X account', count: live.filter(post => post.platform === 'x' && (!catalog.active || (post.accounts || []).some(account => account.toLowerCase() === catalog.active.toLowerCase()))).length });
  const instagram = [...new Set(posts.filter(post => post.platform === 'instagram').flatMap(post => post.accounts || []))];
  options.unshift({ value: 'instagram:current', platform: 'instagram', label: instagram.length === 1 ? instagram[0] : 'Instagram', count: live.filter(post => post.platform === 'instagram').length });
  options.push({ value: 'chrome:*', platform: 'chrome', label: 'Chrome', count: live.filter(post => post.platform === 'chrome').length });
  return options;
}

export function legacySyncSelection(source, xAccount, catalog = {}) {
  catalog ||= {};
  const platforms = source === 'all' ? ['chrome', 'x', 'instagram'] : source === 'both' ? ['x', 'instagram'] : [source];
  const result = [];
  if (platforms.includes('instagram')) result.push('instagram:current');
  if (platforms.includes('chrome')) result.push('chrome:*');
  if (platforms.includes('x')) {
    if (xAccount === 'all' && catalog.accounts?.length) result.push(...catalog.accounts.map(account => `x:${account.handle.toLowerCase()}`));
    else result.push(`x:${xAccount === 'current' || xAccount === 'all' ? catalog.active?.toLowerCase() || 'current' : xAccount.toLowerCase()}`);
  }
  return result;
}

export function syncSelectionRequest(selected, catalog = {}) {
  catalog ||= {};
  const targets = ['chrome', 'x', 'instagram'].filter(platform => selected.some(value => value.startsWith(`${platform}:`)));
  const handles = selected.filter(value => value.startsWith('x:')).map(value => value.slice(2));
  const known = (catalog.accounts || []).map(account => account.handle.toLowerCase());
  let xAccount = handles[0] || 'current';
  if (handles.length > 1) xAccount = known.length === handles.length && known.every(handle => handles.includes(handle)) ? 'all' : handles;
  return { targets, xAccount };
}
