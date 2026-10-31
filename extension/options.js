const $ = s => document.querySelector(s);
function normalizeOrigin(value) {
  const u = new URL(value);
  if (u.username || u.password || u.search || u.hash || !['', '/'].includes(u.pathname)) throw new Error('Enter only the library origin, for example http://localhost:3210.');
  const local = ['localhost', '127.0.0.1'].includes(u.hostname);
  if (u.protocol !== 'https:' && !(local && u.protocol === 'http:')) throw new Error('Use HTTPS for a hosted library, or HTTP on localhost.');
  return u.origin;
}
async function showConnection() {
  const { connection } = await chrome.storage.local.get('connection');
  $('#connected').hidden = !connection;
  if (connection) { $('#origin').value = connection.origin; $('#connected-label').textContent = `Paired with ${connection.name} at ${connection.origin}`; }
}
$('#pair-form').onsubmit = async e => {
  e.preventDefault(); const button = $('button[type=submit]'); $('#result').textContent = '';
  try {
    const origin = normalizeOrigin($('#origin').value.trim());
    // Request only this chosen host. Nothing is granted for other HTTPS sites.
    const address = new URL(origin);
    const allowed = await chrome.permissions.request({ origins: [`${address.protocol}//${address.hostname}/*`] });
    if (!allowed) throw new Error('Library host access wasn’t granted. Pair again to allow this address.');
    button.disabled = true;
    const response = await fetch(`${origin}/api/extension/pair`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: $('#code').value, name: $('#name').value }), signal: AbortSignal.timeout(15000) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Pairing failed.');
    await chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
    await chrome.storage.local.set({ connection: { origin, token: data.token, deviceId: data.deviceId, name: $('#name').value }, consentAt: new Date().toISOString() });
    $('#code').value = ''; $('#result').className = 'success'; $('#result').textContent = 'Paired. Open Saved / Bookmarks, then click Sync in the extension.'; await showConnection();
  } catch (error) { $('#result').className = 'error'; $('#result').textContent = error instanceof TypeError ? 'Can’t reach the library. Start the server and check its address.' : error.message; }
  finally { button.disabled = false; }
};
$('#disconnect').onclick = async () => {
  const { syncState } = await chrome.storage.local.get('syncState');
  if (syncState?.status === 'running') { $('#result').textContent = 'Stop the current sync before removing this pairing.'; return; }
  await chrome.storage.local.remove(['connection', 'consentAt', 'syncState']); $('#result').textContent = 'Pairing removed from this browser.'; await showConnection();
};
showConnection();
