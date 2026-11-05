import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalPost, imageUrl, cleanPost, topicsFor } from '../server/domain.mjs';
import { Store, passwordHash, passwordMatches } from '../server/store.mjs';

test('canonical URLs remove tracking and unify X/Twitter identities', () => {
  assert.deepEqual(canonicalPost('https://twitter.com/alice/status/123456789/photo/1?s=20'), { platform: 'x', externalId: '123456789', url: 'https://x.com/i/status/123456789' });
  assert.equal(canonicalPost('https://x.com/i/web/status/123456789').externalId, '123456789');
  assert.equal(canonicalPost('https://www.instagram.com/reel/AbC_-123/?igsh=secret').url, 'https://www.instagram.com/reel/AbC_-123/');
});
test('Instagram links that put the creator first resolve to the same post', () => {
  for (const [link, url] of [
    ['https://www.instagram.com/creator/reel/AbC_-123/?igsh=secret', 'https://www.instagram.com/reel/AbC_-123/'],
    ['https://instagram.com/creator.name/p/AbC/', 'https://www.instagram.com/p/AbC/'],
    ['https://www.instagram.com/creator/reels/AbC', 'https://www.instagram.com/reel/AbC/'],
    ['https://www.instagram.com/creator/tv/AbC/', 'https://www.instagram.com/tv/AbC/'],
    // A post whose shortcode happens to be a route name is still that post.
    ['https://www.instagram.com/p/reel/', 'https://www.instagram.com/p/reel/']
  ]) assert.equal(canonicalPost(link).url, url);
});
test('rejects unsupported, deceptive and credential-bearing URLs', () => {
  for (const url of ['javascript:alert(1)', 'https://instagram.com.evil.com/p/abc', 'https://x.com@evil.com/a/status/1', 'https://x.com:444/a/status/1', 'https://x.com/a', 'https://www.instagram.com/username/saved/', 'https://www.instagram.com/stories/tv/3456789012345678902/', 'https://www.instagram.com/stories/creator/3456789012345678902/', 'https://www.instagram.com/creator/', 'https://www.instagram.com/a/b/p/AbC/']) assert.throws(() => canonicalPost(url));
});
test('thumbnail allowlist and plain local topic suggestions', () => {
  assert.equal(imageUrl('https://pbs.twimg.com/media/abc.jpg'), 'https://pbs.twimg.com/media/abc.jpg');
  for (const url of ['http://pbs.twimg.com/a', 'https://pbs.twimg.com.evil.com/a', 'data:image/svg+xml,<svg/>', 'https://127.0.0.1/admin', 'https://pbs.twimg.com:444/a']) assert.equal(imageUrl(url), '');
  assert.deepEqual(topicsFor('A new AI coding tool from GitHub'), ['Tech']);
  assert.deepEqual(topicsFor('Figma tips for your startup'), ['Design', 'Business']);
  assert.deepEqual(topicsFor('Easy weeknight recipe'), ['Lifestyle']);
  assert.deepEqual(topicsFor('A quiet morning'), []);
  assert.equal(cleanPost({ url: 'https://x.com/a/status/1', text: '<script>text stays text</script>' }).text, '<script>text stays text</script>');
});
test('deduplicates across accounts and never erases better captures or edits', () => {
  const store = new Store(':memory:');
  try {
    assert.equal(store.importPosts([{ url: 'https://twitter.com/a/status/123', text: 'A long useful caption about AI coding', sourceAccount: '@one', thumbnail: 'https://pbs.twimg.com/media/a.jpg' }]).imported, 1);
    store.updatePost(1, { title: 'My title', notes: 'Try this next week', tags: ['Read Later'], favorite: true, archived: true });
    assert.equal(store.importPosts([{ url: 'https://x.com/i/status/123', text: 'Short', sourceAccount: '@two' }]).updated, 1);
    const [p] = store.posts({ scope: 'all' }); assert.equal(p.title, 'My title'); assert.equal(p.notes, 'Try this next week'); assert.equal(p.favorite, true); assert.equal(p.archived, true);
    assert.equal(p.text, 'A long useful caption about AI coding'); assert.equal(p.thumbnail, 'https://pbs.twimg.com/media/a.jpg'); assert.deepEqual(p.accounts, ['@one', '@two']); assert.deepEqual(p.tags, ['read later']);
  } finally { store.close(); }
});
test('backup restores annotations and valid rows survive malformed rows', () => {
  const store = new Store(':memory:');
  try {
    const result = store.importPosts([{ url: 'https://instagram.com/p/Abc/', notes: 'Keep this', accounts: ['@one', '@two'], favorite: true, archived: true, savedAt: '2025-05-01T00:00:00Z' }, { url: 'https://evil.com/' }, null]);
    assert.equal(result.imported, 1); assert.equal(result.rejected, 2);
    const post = store.posts({ scope: 'all' })[0]; assert.equal(post.notes, 'Keep this'); assert.equal(post.favorite, true); assert.equal(post.archived, true); assert.deepEqual(post.accounts, ['@one', '@two']); assert.equal(post.savedAt, '2025-05-01T00:00:00.000Z');
  } finally { store.close(); }
});
test('passwords, expiring sessions and single-use revocable pairing', () => {
  const digest = passwordHash('a rather long password'); assert.ok(passwordMatches('a rather long password', digest)); assert.ok(!passwordMatches('wrong', digest));
  const store = new Store(':memory:');
  try {
    const session = store.createSession(); assert.ok(store.session(session)); store.deleteSession(session); assert.ok(!store.session(session));
    const code = store.pairCode(); const pair = store.pair(code, 'My browser'); assert.ok(store.device(pair.token)); assert.throws(() => store.pair(code, 'Again'));
    store.revoke(pair.deviceId); assert.equal(store.device(pair.token), undefined);
    const expired = store.pairCode(); store.db.prepare('UPDATE pairing SET expires=0').run(); assert.throws(() => store.pair(expired, 'Expired'));
  } finally { store.close(); }
});
