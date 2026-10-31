import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { Store } from '../server/store.mjs';
import { syncQueue } from '../server/sync.mjs';
const script = await readFile(new URL('../extension/x-accounts.js', import.meta.url), 'utf8');
function fixture(handles = ['alpha', 'beta', 'gamma']) {
  const dom = new JSDOM(`<a data-testid="AppTabBar_Profile_Link" href="/alpha">Profile</a><button data-testid="SideNav_AccountSwitcher_Button">Account menu</button><div id="menu" hidden>${handles.filter(h => h !== 'alpha').map(h => `<button data-testid="UserCell" aria-label="Switch to @${h}">${h} name\n@${h}</button>`).join('')}<button aria-label="Follow @not_an_account">@not_an_account</button><button role="menuitem">Add an existing account</button><button role="menuitem">Log out @alpha</button></div>`, { url: 'https://x.com/i/history', runScripts: 'outside-only' });
  const doc = dom.window.document;
  doc.querySelector('[data-testid="SideNav_AccountSwitcher_Button"]').onclick = () => { doc.querySelector('#menu').hidden = !doc.querySelector('#menu').hidden; };
  doc.querySelectorAll('[aria-label^="Switch to @"]').forEach(button => { button.onclick = () => { doc.querySelector('a').setAttribute('href', '/' + button.getAttribute('aria-label').split('@')[1]); }; });
  dom.window.setTimeout = fn => setTimeout(fn, 0); dom.window.eval(script); return dom;
}
test('discovers all signed-in X accounts, not follower suggestions or a hard-coded pair', async () => {
  const dom = fixture();
  try { const result = await dom.window.SaveXAccounts.discover(); assert.equal(result.active, '@alpha'); assert.deepEqual(Array.from(result.accounts, a => a.handle), ['@alpha', '@beta', '@gamma']); assert.equal(dom.window.document.querySelector('#menu').hidden, true); }
  finally { dom.window.close(); }
});
test('selects only the requested account and refuses a missing login', async () => {
  const dom = fixture();
  try { await dom.window.SaveXAccounts.choose('@BETA'); assert.equal(dom.window.SaveXAccounts.current(), '@beta'); await assert.rejects(dom.window.SaveXAccounts.choose('@missing'), /not signed in/); assert.equal(dom.window.SaveXAccounts.current(), '@beta'); }
  finally { dom.window.close(); }
});
test('single-account X sessions are discovered normally', async () => {
  const dom = fixture(['alpha']); try { assert.deepEqual(Array.from((await dom.window.SaveXAccounts.discover()).accounts, a => a.handle), ['@alpha']); } finally { dom.window.close(); }
});
test('account selections survive queueing and legacy helpers cannot silently claim them', () => {
  const store = new Store(':memory:');
  try {
    const queue = syncQueue(store);
    assert.throws(() => queue.enqueue(['x'], 'not-a-handle'), /Choose/);
    queue.setAccounts({ active: '@alpha', accounts: [{ handle: '@alpha' }, { handle: '@beta' }, { handle: '@gamma' }] });
    const job = queue.enqueue(['x'], 'all'); assert.equal(job.xAccount, 'all');
    assert.equal(queue.claim('old-helper'), null); assert.equal(queue.claim('new-helper', true).id, job.id);
    queue.update(job.id, 'new-helper', { status: 'completed', results: ['alpha', 'beta', 'gamma'].map(handle => ({ platform: 'x', account: '@' + handle, imported: 1 })) });
    assert.equal(queue.status().job.results.length, 3); assert.equal(queue.status().job.results[2].account, '@gamma');
    assert.equal(queue.enqueue(['x'], '@beta').xAccount, '@beta');
    assert.equal(syncQueue(store).status().xAccounts.accounts.length, 3);
  } finally { store.close(); }
});
