(() => {
  if (globalThis.__saveXCollectorInstalled) return;
  globalThis.__saveXCollectorInstalled = true;
  let running = false, stopped = false;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const send = message => chrome.runtime.sendMessage(message);
  function scroller() {
    const root = document.scrollingElement || document.documentElement;
    const candidates = [root, ...document.querySelectorAll('main,section,[role="main"],main div')].filter(Boolean);
    return candidates.filter(el => el.scrollHeight > el.clientHeight + 100 && (el === root || /auto|scroll/.test(getComputedStyle(el).overflowY))).sort((a, b) => b.clientHeight - a.clientHeight)[0] || root;
  }
  function restriction() {
    if (/\/accounts\/login|\/challenge|\/checkpoint|\/i\/flow\/login/.test(location.pathname)) return 'The site needs you to sign in or complete a check. Resolve it yourself, then start another sync.';
    const text = (document.querySelector('main')?.innerText || '').toLowerCase();
    if (/rate limit exceeded|try again later|we restrict certain activity|unusual activity/.test(text)) return 'The site is limiting requests. Sync stopped; please try again later.';
    return '';
  }
  async function collect(options) {
    if (running) throw new Error('A sync is already running in this tab.');
    running = true; stopped = false;
    const info = SaveXExtractors.pageInfo(document, location);
    let status = 'partial', message = '', total = 0;
    const seen = new Set(); let pending = [], idle = 0, passes = 0;
    const deadline = Date.now() + 10 * 60 * 1000;
    const startPosition = { el: scroller(), top: scroller().scrollTop };
    const flush = async () => {
      while (pending.length) {
        const batch = pending.slice(0, 100);
        const response = await send({ type: 'SYNC_BATCH', runId: options.runId, posts: batch });
        if (!response?.ok) throw new Error(response?.error || 'Library unreachable. Previously imported posts are safe.');
        pending.splice(0, batch.length); total += batch.length;
      }
    };
    try {
      if (!info.valid || info.platform !== options.platform) throw new Error('Keep your Saved or Bookmarks page open during sync.');
      // Capture the current page before going to the top, so an explicitly opened collection works too.
      while (!stopped && Date.now() < deadline && seen.size < options.maxPosts) {
        const blocked = restriction(); if (blocked) throw new Error(blocked);
        const current = SaveXExtractors.pageInfo(document, location);
        if (!current.valid || current.platform !== info.platform || (info.account && current.account !== info.account)) throw new Error('The page or account changed. Start a new sync for this account.');
        let added = 0;
        for (const post of SaveXExtractors.extract(document, info.platform)) {
          const key = post.url.split('?')[0];
          if (!seen.has(key) && seen.size < options.maxPosts) { seen.add(key); pending.push(post); added++; }
        }
        if (pending.length >= 20 || passes % 2 === 0) await flush();
        await send({ type: 'SYNC_PROGRESS', runId: options.runId, seen: seen.size, message: `${seen.size} posts found · keep this tab open` });
        idle = added ? 0 : idle + 1;
        if (idle >= 5) {
          if (seen.size === 0) message = 'No posts found. On Instagram, open All posts or a saved collection first. An empty page or a layout change can also cause this.';
          else message = 'No new posts appeared after five checks. This imports only what the page exposed; a complete history cannot be guaranteed.';
          status = 'partial'; break;
        }
        const target = scroller();
        if (passes === 0 && target.scrollTop > 50) target.scrollTo({ top: 0, behavior: 'instant' });
        else target.scrollBy({ top: Math.max(500, Math.floor(target.clientHeight * .8)), behavior: 'instant' });
        passes++; await sleep(1400);
      }
      await flush();
      if (stopped) { status = 'cancelled'; message = 'Stopped by you. All acknowledged batches remain saved.'; }
      else if (!message) message = seen.size >= options.maxPosts ? `Reached the ${options.maxPosts}-post safety limit. Increase the limit or use smaller collections for more.` : 'Reached the 10-minute limit. You can run another sync or import an export file.';
      await send({ type: 'SYNC_FINISH', runId: options.runId, status, message, seen: seen.size });
    } catch (error) {
      await send({ type: 'SYNC_FINISH', runId: options.runId, status: 'failed', message: error.message, seen: total }).catch(() => {});
    } finally {
      running = false;
      if (startPosition.el.isConnected) startPosition.el.scrollTo({ top: startPosition.top, behavior: 'instant' });
    }
  }
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (sender.id !== chrome.runtime.id) return;
    if (message.type === 'START_COLLECT') { if (running) { respond({ ok: false, error: 'A sync is already running.' }); return; } respond({ ok: true }); collect(message.options); }
    if (message.type === 'STOP_COLLECT') { stopped = true; respond({ ok: true }); }
    if (message.type === 'COLLECTOR_STATUS') respond({ running });
  });
})();
