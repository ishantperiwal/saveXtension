function selectedTargets() { const value = document.querySelector('#source').value; return value === 'all' ? ['chrome', 'x', 'instagram'] : value === 'both' ? ['x', 'instagram'] : [value]; }
const $ = s => document.querySelector(s);
const send = async message => { const response = await chrome.runtime.sendMessage(message); if (!response?.ok) throw new Error(response?.error || 'Reload the extension and try again.'); return response; };
function error(e) { $('#error').textContent = e.message; }
async function render() {
  try {
    const { ready, bookmarksReady, origin, syncState: run, job, xAccounts } = await send({ type: 'GET_STATUS' });
    $('#connection').textContent = `Your local library · ${origin}`;
    const targets = selectedTargets();
    const needsAccess = targets.includes('chrome') && !bookmarksReady || targets.some(t => t !== 'chrome') && !ready;
    $('#enable').hidden = !needsAccess; $('#sync-form').hidden = false;
    $('#enable').textContent = targets.includes('chrome') && !bookmarksReady ? 'Allow Chrome bookmarks' : 'Enable background sync';
    $('#x-account-label').hidden = !selectedTargets().includes('x');
    const accounts = xAccounts?.accounts || [], signature = JSON.stringify(accounts);
    if ($('#x-account').dataset.options !== signature) { const value = $('#x-account').value; $('#x-account').innerHTML = '<option value="current">Current X account</option><option value="all">All signed-in X accounts</option>'; for (const account of accounts) { const option = document.createElement('option'); option.value = account.handle; option.textContent = account.handle; $('#x-account').append(option); } $('#x-account').value = value; if (!$('#x-account').value) $('#x-account').value = 'current'; $('#x-account').dataset.options = signature; }
    $('#sync').disabled = !!job; $('#deep-sync').disabled = !!job; $('#deep-sync').hidden = targets.every(t => t === 'chrome'); $('#progress').hidden = !job && !run;
    if (job || run) {
      $('#status-title').textContent = job ? 'Working in the background' : 'Last sync';
      $('#status-message').textContent = run?.message || 'Opening your saved posts…'; $('#stop').hidden = !job;
    }
  } catch (e) { error(e); }
}
$('#enable').onclick = async () => {
  try { const targets = selectedTargets(), access = {}; if (targets.includes('chrome')) access.permissions = ['bookmarks']; if (targets.some(t => t !== 'chrome')) access.origins = ['https://x.com/*', 'https://www.instagram.com/*']; if (await chrome.permissions.request(access)) { await send({ type: 'CHECK_JOBS' }); await render(); } }
  catch (e) { error(e); }
};
async function startSync(mode) {
  try {
    $('#sync').disabled = true; $('#deep-sync').disabled = true;
    await send({ type: 'START_BACKGROUND', targets: selectedTargets(), xAccount: $('#x-account').value, mode });
    await render();
  } catch (e) { error(e); await render(); }
}
$('#sync').onclick = () => startSync('quick');
$('#deep-sync').onclick = () => startSync('deep');
$('#source').onchange = render;
$('#stop').onclick = () => send({ type: 'STOP_SYNC' }).catch(error);
$('#settings').onclick = () => chrome.runtime.openOptionsPage();
$('#open').onclick = () => send({ type: 'OPEN_LIBRARY' }).catch(error);
render(); const timer = setInterval(render, 1500); window.addEventListener('unload', () => clearInterval(timer));
