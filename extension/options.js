const $ = s => document.querySelector(s);
const origins = ['https://x.com/*', 'https://www.instagram.com/*'];
async function render() {
  $('#origin').value = (await chrome.storage.local.get('libraryOrigin')).libraryOrigin || 'http://localhost:3210';
  const bookmarkAccess = await chrome.permissions.contains({ permissions: ['bookmarks'] });
  $('#enable-bookmarks').hidden = bookmarkAccess;
  $('#bookmark-result').textContent = bookmarkAccess ? 'Chrome bookmarks are enabled. Sync them from your library.' : 'Optional: import bookmark titles, links and folders from this Chrome profile.';
  const allowed = await chrome.permissions.contains({ origins });
  $('#enable').hidden = allowed;
  if (allowed) $('#result').textContent = 'Ready. Click Sync in your library; keep working in your current tab.';
}
$('#settings-form').onsubmit = async e => {
  e.preventDefault();
  try {
    const u = new URL($('#origin').value);
    if (u.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(u.hostname) || u.username || u.password || !['', '/'].includes(u.pathname) || u.search || u.hash) throw new Error('Use a local library address, for example http://localhost:3210.');
    await chrome.storage.local.set({ libraryOrigin: u.origin }); await chrome.runtime.sendMessage({ type: 'CHECK_JOBS' }); $('#result').textContent = 'Address saved.';
  } catch(e) { $('#result').textContent = e.message; }
};
$('#enable').onclick = async () => { try { if (await chrome.permissions.request({ origins })) { await chrome.runtime.sendMessage({ type: 'CHECK_JOBS' }); await render(); } } catch(e) { $('#result').textContent = e.message; } };
$('#enable-bookmarks').onclick = async () => { try { if (await chrome.permissions.request({ permissions: ['bookmarks'] })) { await chrome.runtime.sendMessage({ type: 'CHECK_JOBS' }); await render(); } } catch(e) { $('#bookmark-result').textContent = e.message; } };
$('#open').onclick = () => chrome.runtime.sendMessage({ type: 'OPEN_LIBRARY' });
render();
