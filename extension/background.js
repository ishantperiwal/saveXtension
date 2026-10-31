const getSettings = async () => (await chrome.storage.local.get('connection')).connection;
let starting = false;
const isSavedUrl = value => {
  try { const u = new URL(value); return u.protocol === 'https:' && ((['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com', 'mobile.twitter.com'].includes(u.hostname) && /^\/i\/bookmarks(?:\/|$)/.test(u.pathname)) || (['instagram.com', 'www.instagram.com'].includes(u.hostname) && /^\/[\w.]+\/saved(?:\/|$)/.test(u.pathname))); } catch { return false; }
};
async function request(path, body, settings) {
  settings ||= await getSettings(); if (!settings?.token) throw new Error('Pair your library in extension settings first.');
  let response;
  try { response = await fetch(`${settings.origin}/api/extension${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.token}` }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(20000) }); }
  catch { throw new Error('Can’t reach your library. Start its server and check the address in settings.'); }
  const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Library request failed.'); return data;
}
async function getRun() { return (await chrome.storage.local.get('syncState')).syncState; }
async function setRun(state) { await chrome.storage.local.set({ syncState: { ...state, updatedAt: Date.now() } }); }
async function checkStale() {
  const run = await getRun();
  if (run?.status === 'running') {
    let active = false;
    try { active = (await chrome.tabs.sendMessage(run.tabId, { type: 'COLLECTOR_STATUS' }))?.running; } catch { /* Tab closed or navigated. */ }
    if (!active) {
      const message = 'The source tab was closed, reloaded, or navigated away. Previously imported posts are safe.';
      await request(`/runs/${run.runId}/finish`, { status: 'partial', message }).catch(() => {});
      await setRun({ ...run, status: 'partial', message });
    }
  }
  return getRun();
}
async function handle(message, sender) {
  if (sender.id !== chrome.runtime.id) throw new Error('Unknown sender.');
  // Content scripts only get to send batches for the tab and run initiated by the popup.
  const fromExtensionPage = sender.url?.startsWith(chrome.runtime.getURL(''));
  if (sender.tab && !fromExtensionPage) {
    const run = await getRun();
    if (!isSavedUrl(sender.url) || !run || run.tabId !== sender.tab.id || run.runId !== message.runId || run.status !== 'running') throw new Error('This tab has no active sync.');
    if (message.type === 'SYNC_BATCH') {
      const result = await request(`/runs/${run.runId}`, { posts: message.posts });
      await setRun({ ...run, imported: run.imported + result.imported, updated: run.updated + result.updated, rejected: run.rejected + result.rejected });
      return result;
    }
    if (message.type === 'SYNC_PROGRESS') { await setRun({ ...run, seen: message.seen, message: message.message }); return {}; }
    if (message.type === 'SYNC_FINISH') {
      let messageText = message.message, status = message.status;
      try { await request(`/runs/${run.runId}/finish`, { status, message: messageText }); }
      catch (e) { status = 'failed'; messageText = `${messageText} ${e.message}`; }
      await setRun({ ...run, status, message: messageText, seen: message.seen }); return {};
    }
    throw new Error('Unsupported collector message.');
  }
  if (!fromExtensionPage) throw new Error('Only extension pages can start or manage syncs.');
  if (message.type === 'GET_STATUS') {
    const connection = await getSettings();
    return { connection: connection ? { origin: connection.origin, name: connection.name } : null, syncState: await checkStale() };
  }
  if (message.type === 'START_SYNC') {
    if (starting) throw new Error('A sync is already starting.');
    starting = true;
    try {
      if ((await checkStale())?.status === 'running') throw new Error('Stop the active sync before starting another.');
      const tab = await chrome.tabs.get(message.tabId);
      if (!isSavedUrl(tab.url)) throw new Error('Open X Bookmarks or Instagram Saved. On Instagram, open All posts or a collection.');
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['extractors.js', 'collector.js'] });
      const [{ result: info }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => globalThis.SaveXExtractors.pageInfo(document, location) });
      if (!info.valid) throw new Error('This is not a supported Saved or Bookmarks page.');
      const account = String(message.account || info.account || '').slice(0, 100);
      const { runId } = await request('/runs', { platform: info.platform, account });
      const run = { runId, tabId: tab.id, platform: info.platform, account, status: 'running', imported: 0, updated: 0, rejected: 0, seen: 0, message: 'Loading your saved posts…', startedAt: Date.now() };
      await setRun(run);
      try { const response = await chrome.tabs.sendMessage(tab.id, { type: 'START_COLLECT', options: { runId, platform: info.platform, maxPosts: Math.max(50, Math.min(5000, Number(message.maxPosts) || 500)) } }); if (!response?.ok) throw new Error(response?.error || 'Couldn’t start collector.'); }
      catch (e) { await request(`/runs/${runId}/finish`, { status: 'failed', message: e.message }).catch(() => {}); await setRun({ ...run, status: 'failed', message: e.message }); throw e; }
      return { syncState: run };
    } finally { starting = false; }
  }
  if (message.type === 'STOP_SYNC') {
    const run = await getRun(); if (run?.status === 'running') { await chrome.tabs.sendMessage(run.tabId, { type: 'STOP_COLLECT' }); await setRun({ ...run, message: 'Stopping after the current batch…' }); } return {};
  }
  if (message.type === 'OPEN_LIBRARY') { const settings = await getSettings(); if (!settings) throw new Error('Pair your library first.'); await chrome.tabs.create({ url: settings.origin }); return {}; }
  throw new Error('Unknown extension action.');
}
chrome.runtime.onInstalled.addListener(async () => {
  // Site scripts never receive the pairing token. Disable content-script access to storage.
  await chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
});
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  handle(message, sender).then(data => respond({ ok: true, ...data })).catch(error => respond({ ok: false, error: error.message }));
  return true;
});
