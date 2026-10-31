import test from 'node:test';
import assert from 'node:assert/strict';
import { sidebarAccounts } from '../public/sidebar-accounts.js';

test('sidebar rows identify source accounts, count shared saves per owner and exclude archives', () => {
  const posts = [
    { platform: 'instagram', accounts: ['@Same'], author: 'creator' },
    { platform: 'x', accounts: ['@same', '@other'], author: 'different_creator' },
    { platform: 'x', accounts: ['@other'] },
    { platform: 'x', accounts: ['@same'], archived: true },
    { platform: 'instagram', accounts: [] }
  ];
  const rows = sidebarAccounts(posts, [{ handle: '@zero' }]);
  assert.equal(rows.find(row => row.value === 'instagram:@same').count, 1);
  assert.equal(rows.find(row => row.value === 'x:@same').count, 1);
  assert.equal(rows.find(row => row.value === 'x:@other').count, 2);
  assert.equal(rows.find(row => row.value === 'x:@zero').count, 0);
  assert.equal(rows.find(row => row.value === 'instagram:').count, 1);
  assert.equal(rows.some(row => row.label.includes('creator')), false);
});
test('collection owners get their own rows even before any saves arrive; unknown owners are never guessed', () => {
  const rows = sidebarAccounts([], [], [{ account: '@folder_owner' }]);
  assert.equal(rows.find(row => row.platform === 'instagram').value, 'instagram:@folder_owner');
  assert.equal(rows.find(row => row.platform === 'instagram').count, 0);
  assert.equal(rows.filter(row => row.platform === 'instagram').length, 1);
  assert.equal(sidebarAccounts([{ platform: 'instagram', accounts: [], author: 'creator' }]).find(row => row.platform === 'instagram').value, 'instagram:*');
});
