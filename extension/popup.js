// The popup only says whether the extension can reach the library. Scanning and everything else happen in the app.
const $ = s => document.querySelector(s);
const SITES = ['https://x.com/*', 'https://www.instagram.com/*'];
async function status() { const response = await chrome.runtime.sendMessage({ type: 'GET_STATUS' }); if (!response?.ok) throw new Error(response?.error || 'Reload the extension and try again.'); return response; }
async function render() {
  try {
    const { ready, bookmarksReady, reachable } = await status();
    $('#connection').textContent = reachable ? 'Connected to your library.' : 'Can’t reach your library. Open the saveXtension app.';
    // Only the older browser mode asks for access; the app's own copy of the extension has it from the start.
    $('#enable').hidden = ready && bookmarksReady;
  } catch (e) { $('#error').textContent = e.message; }
}
$('#enable').onclick = async () => {
  try { if (await chrome.permissions.request({ origins: SITES, permissions: ['bookmarks'] })) { await chrome.runtime.sendMessage({ type: 'CHECK_JOBS' }); await render(); } }
  catch (e) { $('#error').textContent = e.message; }
};
render();
