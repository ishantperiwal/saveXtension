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
