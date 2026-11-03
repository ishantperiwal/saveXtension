import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

const extractors = await readFile(new URL('../extension/extractors.js', import.meta.url), 'utf8');
const page = (body, url) => { const dom = new JSDOM(body, { url, runScripts: 'outside-only' }); dom.window.HTMLElement.prototype.getClientRects = function () { return [{ width: 20, height: 20 }]; }; dom.window.eval(extractors); return dom; };

test('an empty saved list is told apart from a page whose posts can no longer be read', () => {
  const cases = [
    ['<main><div data-testid="emptyState">Nada guardado</div></main>', 'https://x.com/i/bookmarks', 'x', 'empty'],
    ['<main><article><a href="/writer/status/1"><time>hoy</time></a></article></main>', 'https://x.com/i/bookmarks', 'x', 'unreadable'],
    ['<main><article data-testid="tweet"><a href="/writer/status/1"><time>hoy</time></a></article></main>', 'https://x.com/i/bookmarks', 'x', ''],
    ['<main></main>', 'https://x.com/i/bookmarks', 'x', ''],
    ['<main><div><img src="a"><img src="b"><img src="c"></div></main>', 'https://www.instagram.com/me/saved/all-posts/', 'instagram', 'unreadable'],
    ['<main><header><img src="avatar"></header><a href="/p/One/"><img src="a"></a><img src="b"><img src="c"></main>', 'https://www.instagram.com/me/saved/all-posts/', 'instagram', ''],
    ['<main><header><img src="avatar"></header></main>', 'https://www.instagram.com/me/saved/all-posts/', 'instagram', '']
  ];
  for (const [body, url, platform, expected] of cases) {
    const dom = page(body, url);
    try { assert.equal(dom.window.SaveXExtractors.diagnose(dom.window.document, platform), expected, body); } finally { dom.window.close(); }
  }
});

test('X bookmark state and the Bookmarks tab are recognized in any site language', () => {
  const tab = page('<a data-testid="AppTabBar_Profile_Link" href="/one">Perfil</a><div role="tab" aria-selected="true"><a href="/i/bookmarks">Elementos guardados</a></div>', 'https://x.com/i/history');
  try { assert.deepEqual({ ...tab.window.SaveXExtractors.pageInfo(tab.window.document, tab.window.location) }, { platform: 'x', account: '@one', valid: true }); } finally { tab.window.close(); }
  const post = testid => `<a data-testid="AppTabBar_Profile_Link" href="/one">Perfil</a><main><article data-testid="tweet"><a href="/writer/status/12345"><time>hoy</time></a><button data-testid="${testid}" aria-label="235 Elementos guardados. Guardar">Guardar</button></article></main>`;
  for (const [testid, state] of [['bookmark', 'unsaved'], ['removeBookmark', 'saved']]) {
    const dom = page(post(testid), 'https://x.com/writer/status/12345');
    try { assert.equal(dom.window.SaveXExtractors.xBookmarkState(dom.window.document, 'https://x.com/writer/status/12345').state, state); } finally { dom.window.close(); }
  }
  const pressed = page(post('bookmark').replace('<button', '<button aria-pressed="true"'), 'https://x.com/writer/status/12345');
  try { assert.equal(pressed.window.SaveXExtractors.xBookmarkState(pressed.window.document, 'https://x.com/writer/status/12345'), null); } finally { pressed.window.close(); }
});

test('the Instagram signed-in account is found by its navigation avatar in any site language', async () => {
  const unsave = await readFile(new URL('../extension/unsave-dom.js', import.meta.url), 'utf8');
  const body = `<aside><div><a href="/">Inicio</a><a href="/direct/inbox/">Mensajes</a><a href="/explore/">Buscar</a><a href="/one/"><img alt="Foto del perfil de one"></a></div></aside><main><article><a href="/writer/"><img alt="Foto del perfil de writer"></a><a href="/p/ExactPost/"><time>hoy</time></a><section><button><svg aria-label="Like"></svg></button><button><svg aria-label="Comment"></svg></button><button><svg aria-label="Remove"></svg></button></section></article></main>`;
  const dom = page(body, 'https://www.instagram.com/p/ExactPost/'); dom.window.eval(unsave);
  try {
    const target = { url: 'https://www.instagram.com/p/ExactPost/', platform: 'instagram' };
    assert.equal(dom.window.SaveXUnsave.inspect({ ...target, account: '@one' }).state, 'saved');
    // The post author's avatar is inside main and never counts as the signed-in account.
    assert.equal(dom.window.SaveXUnsave.inspect({ ...target, account: '@writer' }), null);
  } finally { dom.window.close(); }
});

test('X account switching works with localized labels and ignores follow suggestions', async () => {
  const script = await readFile(new URL('../extension/x-accounts.js', import.meta.url), 'utf8');
  const dom = new JSDOM(`<a data-testid="AppTabBar_Profile_Link" href="/alpha">Perfil</a><button data-testid="SideNav_AccountSwitcher_Button">Cuenta</button><div data-testid="sidebarColumn"><button data-testid="UserCell" aria-label="Seguir a @suggested">@suggested</button></div><div id="menu" hidden><button data-testid="UserCell" aria-label="Cambiar a @beta">Beta\n@beta</button><a href="/logout">Cerrar la sesión de @alpha</a></div>`, { url: 'https://x.com/i/bookmarks', runScripts: 'outside-only' });
  const doc = dom.window.document;
  doc.querySelector('[data-testid="SideNav_AccountSwitcher_Button"]').onclick = () => { doc.querySelector('#menu').hidden = !doc.querySelector('#menu').hidden; };
  doc.querySelector('[aria-label="Cambiar a @beta"]').onclick = () => doc.querySelector('a').setAttribute('href', '/beta');
  dom.window.setTimeout = fn => setTimeout(fn, 0); dom.window.eval(script);
  try {
    assert.deepEqual(Array.from((await dom.window.SaveXAccounts.discover()).accounts, account => account.handle), ['@alpha', '@beta']);
    await dom.window.SaveXAccounts.choose('@beta'); assert.equal(dom.window.SaveXAccounts.current(), '@beta');
  } finally { dom.window.close(); }
});

async function collect(body, url, platform) {
  const dom = new JSDOM(body, { url, runScripts: 'outside-only' });
  dom.window.Element.prototype.scrollTo = () => {}; dom.window.Element.prototype.scrollBy = () => {};
  dom.window.setTimeout = callback => setTimeout(callback, 0);
  let listener, finish; const finished = new Promise(resolve => { finish = resolve; });
  dom.window.chrome = { runtime: { id: 'test', onMessage: { addListener: fn => { listener = fn; } }, sendMessage: async message => { if (message.type === 'SYNC_FINISH') finish(message); return { ok: true }; } } };
  dom.window.eval(extractors);
  dom.window.eval(await readFile(new URL('../extension/collector.js', import.meta.url), 'utf8'));
  listener({ type: 'START_COLLECT', options: { runId: 'test', platform, maxPosts: 100 } }, { id: 'test' }, () => {});
  try { return await finished; } finally { dom.window.close(); }
}

test('a scan reports an empty list as finished and an unreadable page as a layout change', async () => {
  const empty = await collect('<main><div data-testid="emptyState"></div></main>', 'https://x.com/i/bookmarks', 'x');
  assert.equal(empty.status, 'completed'); assert.match(empty.message, /No saved posts/);
  const changed = await collect('<main><article><a href="/writer/status/1"><time>hoy</time></a></article></main>', 'https://x.com/i/bookmarks', 'x');
  assert.equal(changed.status, 'failed'); assert.match(changed.message, /X loaded, but saveXtension couldn’t read the page/);
  const instagram = await collect('<main><img src="a"><img src="b"><img src="c"></main>', 'https://www.instagram.com/me/saved/all-posts/', 'instagram');
  assert.equal(instagram.status, 'failed'); assert.match(instagram.message, /Instagram loaded/);
});
