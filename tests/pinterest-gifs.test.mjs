import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../server/store.mjs';
import { gifAddress, pinterestGifs } from '../server/pinterest-gifs.mjs';

const pin = (number, hash) => ({ platform: 'pinterest', url: `https://www.pinterest.com/pin/${number}/`, kind: 'image', sourceAccount: '@one', thumbnail: `https://i.pinimg.com/736x/aa/bb/cc/${hash}.jpg` });
const reply = (status, type = '') => ({ status, headers: new Headers({ 'content-type': type }) });
const kindOf = (store, number) => store.posts({ scope: 'all' }).find(post => post.url.includes(`/${number}/`)).kind;

test('the original GIF is found from the preview’s address', () => {
  assert.equal(gifAddress('https://i.pinimg.com/736x/c6/1e/2d/c61e.jpg'), 'https://i.pinimg.com/originals/c6/1e/2d/c61e.gif');
  assert.equal(gifAddress('https://example.com/736x/c6/1e/2d/c61e.jpg'), '');
  assert.equal(gifAddress(''), '');
});

test('GIFs become playable, images stay, each pin is asked once, and an unclear answer waits', async t => {
  const store = new Store(':memory:'); t.after(() => store.close());
  store.importPosts([pin(1, 'aaa1'), pin(2, 'bbb2'), pin(3, 'ccc3'), { platform: 'pinterest', url: 'https://www.pinterest.com/pin/4/', kind: 'video', sourceAccount: '@one', thumbnail: 'https://i.pinimg.com/736x/aa/bb/cc/ddd4.jpg' }, { url: 'https://x.com/a/status/5', text: 'x' }]);
  const asked = [];
  const answers = { aaa1: reply(200, 'image/gif'), bbb2: reply(403, 'application/xml'), ccc3: reply(503) };
  const gifs = pinterestGifs({ store, gap: 0, ask: async url => { asked.push(url); return answers[url.match(/\/(\w+)\.gif/)[1]]; } });
  await gifs.check();
  assert.equal(kindOf(store, 1), 'video'); assert.equal(kindOf(store, 2), 'image'); assert.equal(kindOf(store, 3), 'image');
  assert.equal(asked.length, 3);
  // A later scan says image again, and it stays a GIF.
  store.importPosts([pin(1, 'aaa1')]); assert.equal(kindOf(store, 1), 'video');
  answers.ccc3 = reply(200, 'image/gif'); asked.length = 0;
  await gifs.check();
  assert.deepEqual(asked.map(url => url.match(/\/(\w+)\.gif/)[1]), ['ccc3']); assert.equal(kindOf(store, 3), 'video');
  asked.length = 0; await gifs.check(); assert.equal(asked.length, 0);
  await gifs.close();
});

test('a network failure changes nothing and is tried again', async t => {
  const store = new Store(':memory:'); t.after(() => store.close());
  store.importPosts([pin(1, 'aaa1')]);
  let calls = 0;
  const gifs = pinterestGifs({ store, gap: 0, ask: async () => { calls++; if (calls === 1) throw new Error('offline'); return reply(200, 'image/gif'); } });
  await assert.rejects(gifs.check()); assert.equal(kindOf(store, 1), 'image');
  await gifs.check(); assert.equal(kindOf(store, 1), 'video');
  await gifs.close();
});

test('a pin’s title replaces longer old text, and a pin with no title keeps what it has', t => {
  const store = new Store(':memory:'); t.after(() => store.close());
  const save = text => store.importPosts([{ ...pin(1, 'aaa1'), text }]);
  const text = () => store.posts({ scope: 'all' })[0].text;
  save('A very long description that an older scan kept instead of the title of this pin.');
  save('Short title'); assert.equal(text(), 'Short title');
  save(''); assert.equal(text(), 'Short title');
  store.importPosts([{ url: 'https://x.com/a/status/9', text: 'a longer caption', sourceAccount: '@one' }]);
  store.importPosts([{ url: 'https://x.com/a/status/9', text: 'short', sourceAccount: '@one' }]);
  assert.equal(store.posts({ scope: 'all' }).find(post => post.platform === 'x').text, 'a longer caption');
});
