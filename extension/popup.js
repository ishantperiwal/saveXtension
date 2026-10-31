const $ = s => document.querySelector(s);
const send = async message => { const result = await chrome.runtime.sendMessage(message); if (!result?.ok) throw new Error(result?.error || 'Extension unavailable. Try reloading it.'); return result; };
let tabId, connected = false, isBusy = false;
function error(e) { $('#error').textContent = e.message || e; }
async function render() {
  try {
    const { connection, syncState: run } = await send({ type: 'GET_STATUS' }); connected = !!connection;
    $('#connection').textContent = connection ? `Connected to ${connection.name || connection.origin}` : 'Pair your library to start syncing.';
    $('#pair').hidden = connected; $('#sync-form').hidden = !connected; $('#open').hidden = !connected;
    $('#progress').hidden = !run;
    isBusy = run?.status === 'running';
    $('#sync').disabled = isBusy || !connected;
    if (run) {
      $('#status-title').textContent = isBusy ? 'Syncing your saves' : run.status === 'failed' ? 'Sync needs attention' : run.status === 'cancelled' ? 'Sync stopped' : 'Import finished · may be partial';
      $('#new-count').textContent = run.imported; $('#updated-count').textContent = run.updated;
      $('#status-message').textContent = `${run.message}${run.rejected ? ` ${run.rejected} posts skipped.` : ''}`;
      $('#stop').hidden = !isBusy; $('.status-dot').classList.toggle('done', !isBusy);
    }
  } catch (e) { error(e); }
}
$('#settings').onclick = $('#pair').onclick = () => chrome.runtime.openOptionsPage();
$('#open').onclick = () => send({ type: 'OPEN_LIBRARY' }).catch(error);
$('#sync').onclick = async () => {
  $('#error').textContent = ''; $('#sync').disabled = true;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }); tabId = tab.id;
    await send({ type: 'START_SYNC', tabId, account: $('#account').value.trim(), maxPosts: Number($('#limit').value) }); await render();
  } catch (e) { error(e); $('#sync').disabled = false; }
};
$('#stop').onclick = () => send({ type: 'STOP_SYNC' }).then(render).catch(error);
render(); const interval = setInterval(render, 1200); window.addEventListener('unload', () => clearInterval(interval));
