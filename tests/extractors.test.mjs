import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
const script = await readFile(new URL('../extension/extractors.js', import.meta.url), 'utf8');
async function fixture(name, url) { const dom = new JSDOM(await readFile(new URL(`fixtures/${name}.html`, import.meta.url), 'utf8'), { url, runScripts: 'outside-only' }); dom.window.eval(script); return dom; }
test('X captures stable status IDs, text, author and media without duplicate photo links', async () => {
  const dom = await fixture('x', 'https://x.com/i/bookmarks');
  const { document, SaveXExtractors: parser, location } = dom.window;
  assert.equal(parser.pageInfo(document, location).account, '@personal_account');
  const posts = parser.extract(document, 'x'); assert.equal(posts.length, 2); assert.equal(posts[0].authorName, 'Alice Example'); assert.equal(posts[0].url, 'https://x.com/alice/status/123456789'); assert.match(posts[0].text, /coding workflow/); assert.match(posts[0].thumbnail, /pbs.twimg.com/);
  dom.window.close();
});
test('X skips the avatar on a video tile and uses the post\'s own image', () => {
  const avatar = 'https://pbs.twimg.com/profile_images/1/a_normal.jpg', cover = name => `https://pbs.twimg.com/media/${name}.jpg`;
  const tile = name => `<div data-testid="tweetPhoto"><img src="${avatar}"><img src="${cover(name)}"></div>`;
  const dom = new JSDOM(`<article data-testid="tweet"><a href="/sai/status/9"><time datetime="2026-11-01T00:00:00.000Z"></time></a>${tile('one')}${tile('two')}</article>`, { url: 'https://x.com/i/bookmarks', runScripts: 'outside-only' });
  dom.window.eval(script);
  const [post] = dom.window.SaveXExtractors.extract(dom.window.document, 'x');
  assert.equal(post.thumbnail, cover('one')); assert.deepEqual([...post.media], [cover('one'), cover('two')]); assert.equal(post.kind, 'carousel');
  dom.window.close();
});
test('Instagram collects unique grid posts, accessibility text and Reel type', async () => {
  const dom = await fixture('instagram', 'https://www.instagram.com/my_account/saved/all-posts/');
  const { document, SaveXExtractors: parser, location } = dom.window;
  assert.equal(parser.pageInfo(document, location).account, '@my_account');
  const posts = parser.extract(document, 'instagram'); assert.equal(posts.length, 2); assert.equal(posts[0].author, 'example.creator'); assert.match(posts[0].text, /tutorial/); assert.equal(posts[1].kind, 'video'); dom.window.close();
});
test('ordinary feeds, login pages and lookalike domains are not sync targets', async () => {
  const dom = await fixture('x', 'https://x.com/home'); const { SaveXExtractors: parser, document } = dom.window;
  for (const url of ['https://x.com/home', 'https://x.com/i/flow/login', 'https://www.instagram.com/', 'https://www.instagram.com/accounts/login/', 'https://x.com.evil.com/i/bookmarks']) assert.equal(parser.pageInfo(document, new URL(url)).valid, false);
  dom.window.close();
});
test('Instagram collection links with creator prefixes resolve to the same posts as All posts', () => {
  const dom = new JSDOM(`<main>
    <a href="/studio.name/p/Shared/?img_index=1"><img alt="A saved reference"></a>
    <a href="/p/Shared/"><img alt="Duplicate"></a>
    <a href="https://www.instagram.com/motion_studio/reel/Reel_123/?igsh=tracking"><img alt="A motion reference"></a>
    <a href="/creator/reels/Reel_123/">Duplicate reel</a>
    <a href="//www.instagram.com/creator/tv/Video-123/"><img alt="A video reference"></a>
    <a href="https://evil.example/creator/p/Nope/">Other website</a>
    <a href="https://www.instagram.com.evil.example/creator/p/Nope/">Lookalike</a>
    <a href="https://user:password@www.instagram.com/creator/p/Nope/">Credentials</a>
    <a href="/creator/saved/123/">Collection</a>
    <a href="/creator/extra/p/Nope/">Invalid route</a>
  </main>`, { url: 'https://www.instagram.com/me/saved/design/123/', runScripts: 'outside-only' });
  try {
    dom.window.eval(script);
    const posts = dom.window.SaveXExtractors.extract(dom.window.document, 'instagram');
    assert.deepEqual(Array.from(posts, post => post.url), ['https://www.instagram.com/p/Shared/', 'https://www.instagram.com/reel/Reel_123/', 'https://www.instagram.com/tv/Video-123/']);
    assert.equal(posts[0].author, 'studio.name');
    assert.equal(posts[1].kind, 'video');
  } finally { dom.window.close(); }
});
test('X History supports the selected Bookmarks tab but rejects Likes', async () => {
  const dom = await fixture('x', 'https://x.com/i/history');
  const { document, SaveXExtractors: parser, location } = dom.window;
  assert.equal(parser.pageInfo(document, location).valid, false);
  const tab = document.createElement('button');
  tab.setAttribute('role', 'tab'); tab.setAttribute('aria-selected', 'true');
  tab.textContent = 'Bookmarks'; document.body.append(tab);
  assert.equal(parser.pageInfo(document, location).valid, true);
  tab.textContent = 'Likes';
  assert.equal(parser.pageInfo(document, location).valid, false);
  dom.window.close();
});

test('unsave evidence requires the exact post, signed-in profile, and an explicit enabled Bookmark control', async () => {
  const dom = await fixture('x', 'https://x.com/alice/status/123456789');
  const { document, SaveXExtractors: parser } = dom.window;
  const article = document.querySelector('article');
  const button = document.createElement('button');
  button.setAttribute('data-testid', 'bookmark'); button.setAttribute('aria-label', 'Bookmark'); article.append(button);
  const state = parser.xBookmarkState(document, 'https://x.com/i/status/123456789');
  assert.equal(state.state, 'unsaved'); assert.equal(state.account, '@personal_account');
  for(const label of ['235 Bookmarks. Bookmark','1 Bookmark. Bookmark','1,235 Bookmarks. Bookmark','1.2K Bookmarks. Bookmark']){
    button.setAttribute('aria-label',label);
    assert.equal(parser.xBookmarkState(document,'https://x.com/i/status/123456789').state,'unsaved');
  }
  for(const label of ['235 Bookmarks. Remove Bookmark','Remove Bookmark','Bookmark settings']){
    button.setAttribute('aria-label',label);assert.equal(parser.xBookmarkState(document,'https://x.com/i/status/123456789'),null);
  }
  button.setAttribute('aria-label','235 Bookmarks. Bookmark');button.setAttribute('aria-pressed','true');
  assert.equal(parser.xBookmarkState(document,'https://x.com/i/status/123456789'),null);button.removeAttribute('aria-pressed');
  const duplicate = article.cloneNode(true); article.after(duplicate);
  assert.equal(parser.xBookmarkState(document, 'https://x.com/i/status/123456789'), null);
  duplicate.remove();
  const quote = document.createElement('a'); quote.href = '/someone/status/999'; quote.innerHTML = '<time>Quoted</time>'; article.append(quote);
  assert.equal(parser.xBookmarkState(document, 'https://x.com/i/status/999'), null);
  assert.equal(parser.xBookmarkState(document, 'https://x.com/i/status/987654321'), null);
  button.disabled = true; assert.equal(parser.xBookmarkState(document, 'https://x.com/i/status/123456789'), null);
  button.disabled = false; button.setAttribute('data-testid', 'removeBookmark'); button.setAttribute('aria-label', 'Remove bookmark');
  assert.equal(parser.xBookmarkState(document, 'https://x.com/i/status/123456789').state, 'saved');
  button.remove(); assert.equal(parser.xBookmarkState(document, 'https://x.com/i/status/123456789'), null);
  article.append(button); document.querySelector('[data-testid="AppTabBar_Profile_Link"]').remove();
  assert.equal(parser.xBookmarkState(document, 'https://x.com/i/status/123456789'), null);
  dom.window.close();
});
test('Pinterest pages identify all pins, unorganized pins and boards on any regional host', async () => {
  const dom = await fixture('pinterest-board', 'https://in.pinterest.com/maker.name/game-assets/');
  const { SaveXExtractors: parser, document } = dom.window, info = url => parser.pageInfo(document, new URL(url));
  assert.deepEqual({ ...info('https://in.pinterest.com/maker.name/_pins/') }, { platform: 'pinterest', account: '@maker.name', valid: true, collection: false, collectionId: '' });
  assert.equal(info('https://www.pinterest.co.uk/maker.name/_boards/').collectionId, 'unorganized');
  assert.equal(info('https://pinterest.com/maker.name/game-assets/').collectionId, 'game-assets');
  for (const url of ['https://in.pinterest.com/', 'https://in.pinterest.com/pin/123/', 'https://www.pinterest.com/login/', 'https://www.pinterest.com/search/pins/', 'https://in.pinterest.com/maker.name/_created/', 'https://in.pinterest.com/maker.name/', 'https://pinterest.evil.com/maker.name/_pins/', 'https://www.pinterest.com.evil.com/maker.name/_pins/']) assert.equal(info(url).valid, false, url);
  dom.window.close();
});
test('Pinterest reads a board’s own pins, without its recommendations, at a sharper size', async () => {
  const dom = await fixture('pinterest-board', 'https://in.pinterest.com/maker.name/game-assets/');
  const { SaveXExtractors: parser, document } = dom.window, posts = [...parser.extract(document, 'pinterest')];
  assert.deepEqual(posts.map(post => post.url), ['https://www.pinterest.com/pin/222/', 'https://www.pinterest.com/pin/333/']);
  assert.equal(posts[0].text, 'crisscross / 006'); assert.equal(posts[0].kind, 'image');
  assert.equal(posts[0].thumbnail, 'https://i.pinimg.com/736x/aa/bb/cc/two.jpg');
  assert.equal(posts[1].kind, 'video'); assert.equal(posts[1].thumbnail, 'https://i.pinimg.com/736x/dd/ee/ff/three.jpg');
  assert.equal(parser.diagnose(document, 'pinterest'), '');
  dom.window.close();
});
test('Pinterest finds boards and unorganized pins, and tells an empty list from an unreadable one', async () => {
  const dom = await fixture('pinterest-boards', 'https://in.pinterest.com/maker.name/_boards/');
  const { SaveXExtractors: parser, document, location } = dom.window;
  const { account, ready, collections } = JSON.parse(JSON.stringify(parser.pinterestBoards(document, location)));
  assert.equal(account, '@maker.name'); assert.equal(ready, true);
  assert.deepEqual(collections, [
    { externalId: 'visual-styles', name: 'Visual Styles', url: 'https://www.pinterest.com/maker.name/visual-styles/' },
    { externalId: 'game-assets', name: 'Game Assets', url: 'https://www.pinterest.com/maker.name/game-assets/' },
    { externalId: 'unorganized', name: 'Unorganized', url: 'https://www.pinterest.com/maker.name/_boards/' }
  ]);
  const posts = [...parser.extract(document, 'pinterest')];
  assert.deepEqual(posts.map(post => post.url), ['https://www.pinterest.com/pin/111/']); assert.equal(posts[0].text, '');
  dom.window.close();
  const empty = await fixture('pinterest-board', 'https://in.pinterest.com/maker.name/_pins/');
  assert.equal(empty.window.SaveXExtractors.extract(empty.window.document, 'pinterest').length, 0, 'the all-pins grid is missing here');
  assert.equal(empty.window.SaveXExtractors.diagnose(empty.window.document, 'pinterest'), 'unreadable', 'pins exist outside the expected list');
  empty.window.document.querySelectorAll('[data-test-id="pin"]').forEach(pin => pin.remove());
  assert.equal(empty.window.SaveXExtractors.diagnose(empty.window.document, 'pinterest'), 'empty');
  empty.window.close();
});
