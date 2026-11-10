(() => {
  if (globalThis.__saveXCollectorInstalled) return;
  globalThis.__saveXCollectorInstalled = true;
  let running = false, stopped = false;
  const QUICK_KNOWN_BOUNDARY = 7;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const send = message => chrome.runtime.sendMessage(message);
  function scroller() {
    const root = document.scrollingElement || document.documentElement;
    const candidates = [root, ...document.querySelectorAll('main,section,[role="main"],main div')].filter(Boolean);
    return candidates.filter(el => el.scrollHeight > el.clientHeight + 100 && (el === root || /auto|scroll/.test(getComputedStyle(el).overflowY))).sort((a, b) => b.clientHeight - a.clientHeight)[0] || root;
  }
  function restriction() {
    if (/\/accounts\/login|\/challenge|\/checkpoint|\/i\/flow\/login|^\/login/.test(location.pathname)) return 'The site needs you to sign in or complete a check. Resolve it yourself, then start another sync.';
    const text = (document.querySelector('main')?.innerText || '').toLowerCase();
    if (/rate limit exceeded|try again later|we restrict certain activity|unusual activity/.test(text)) return 'The site is limiting requests. Sync stopped; please try again later.';
    return '';
  }
  async function collect(options) {
    if (running) throw new Error('A sync is already running in this tab.');
    running = true; stopped = false;
    const info = SaveXExtractors.pageInfo(document, location);
    let status = 'partial', message = '', total = 0, reachedEnd = false;
    const deep = options.mode === 'deep';
    const known = new Set(options.knownIds || []);
    const postId = post => post.url.match(info.platform === 'x' ? /\/status\/(\d+)/ : info.platform === 'pinterest' ? /\/pin\/(\d+)/ : /\/(?:p|reels?|tv)\/([\w-]+)/)?.[1];
    let familiar = 0;
    const seen = new Set(); let pending = [], idle = 0, passes = 0;
    const minutes = deep ? 120 : 10;
    const deadline = Date.now() + minutes * 60 * 1000;
    const startPosition = { el: scroller(), top: scroller().scrollTop };
    const flush = async () => {
      while (pending.length) {
        const batch = pending.slice(0, 100);
        const response = await send({ type: 'SYNC_BATCH', runId: options.runId, posts: batch });
        if (!response?.ok) throw new Error(response?.error || 'Library unreachable. Previously imported posts are safe.');
        if (response.rejected) throw new Error('Some posts could not be saved. Sync is incomplete; acknowledged saves are kept.');
        pending.splice(0, batch.length); total += batch.length;
      }
    };
    try {
      if (!info.valid || info.platform !== options.platform) throw new Error('Keep your Saved or Bookmarks page open during sync.');
      if (options.collectionExternalId && info.collectionId !== options.collectionExternalId) throw new Error(`The selected ${info.platform === 'pinterest' ? 'Pinterest board' : 'Instagram collection'} did not open.`);
      // A restored source tab may start halfway down a virtualized list. Reset
      // before assigning positions, otherwise the newest prefix is recorded last.
      const firstScroller=scroller();
      if(firstScroller.scrollTop>50){
        firstScroller.scrollTo({top:0,behavior:'instant'});
        firstScroller.dispatchEvent(new Event('scroll',{bubbles:true}));window.dispatchEvent(new Event('scroll'));
        await sleep(1400);
      }
      let initialSignature='', initialSamples=0, initialWaits=0;
      while (!stopped && Date.now() < deadline && seen.size < options.maxPosts) {
        const blocked = restriction(); if (blocked) throw new Error(blocked);
        const current = SaveXExtractors.pageInfo(document, location);
        if (!current.valid || current.platform !== info.platform || (info.account && current.account !== info.account)) throw new Error('The page or account changed. Start a new sync for this account.');
        if (current.collectionId !== info.collectionId) throw new Error('The saved collection changed. Start another sync.');
        const extracted=SaveXExtractors.extract(document, info.platform);
        if(!seen.size){
          // The shell can be ready before its first posts hydrate. Never scroll
          // an empty/loading first viewport and accidentally skip the newest saves.
          initialWaits++;
          // After a few seconds an explicit empty list, or content the parser no
          // longer understands, is final; waiting longer would not change it.
          const state=initialWaits>=10?SaveXExtractors.diagnose(document,info.platform):'';
          if(state==='empty'){status='completed';message='No saved posts on this page.';break;}
          if(state==='unreadable'){status='failed';message=SaveXExtractors.layoutChanged(info.platform);break;}
          if(initialWaits>50){message='The top of the saved list did not finish loading. Try refreshing again.';break;}
          const target=scroller();
          if(target.scrollTop>50){target.scrollTo({top:0,behavior:'instant'});target.dispatchEvent(new Event('scroll',{bubbles:true}));window.dispatchEvent(new Event('scroll'));initialSignature='';initialSamples=0;await sleep(500);continue;}
          const signature=extracted.slice(0,5).map(post=>postId(post)||post.url).join(',');
          initialSamples=signature&&signature===initialSignature?initialSamples+1:0;initialSignature=signature;
          if(!signature||initialSamples<2){await sleep(500);continue;}
        }
        let added = 0;
        for (const post of extracted) {
          const key = postId(post) || post.url.split('?')[0];
          if (!seen.has(key) && seen.size < options.maxPosts) {
            seen.add(key); added++;
            if (known.has(key)) familiar++;
            else familiar = 0;
            // X also records the familiar prefix: an existing bookmark may have
            // moved to the top. The quick boundary still limits traversal.
            if (deep || info.platform === 'x' || !known.has(key)) pending.push(post);
          }
        }
        if (pending.length >= 20 || passes % 2 === 0) await flush();
        await send({ type: 'SYNC_PROGRESS', runId: options.runId, seen: seen.size, message: `${deep ? 'Deep scan' : 'Quick check'} · ${seen.size} posts checked` });
        // Inspect the entire loaded viewport before stopping: a new post below
        // familiar ones still resets the boundary without another scroll/load.
        // Only distinct IDs known before this run can count toward the boundary.
        if (!deep && familiar >= QUICK_KNOWN_BOUNDARY) {
          await flush(); status = 'completed';
          message = 'Quick check finished at previously saved posts. Older history was not checked; use Deep scan to check it.';
          break;
        }
        idle = added ? 0 : idle + 1;
        if (idle >= 5) {
          if (seen.size === 0) message = info.platform === 'pinterest' ? 'No pins found on this page. An empty page or a layout change can cause this.' : 'No posts found. On Instagram, open All posts or a saved collection first. An empty page or a layout change can also cause this.';
          else message = `${deep ? 'Deep scan' : 'Quick check'} stopped after five checks without more posts loading. Saved batches are kept; complete history and removals are not verified.`;
          status = 'partial';
          // A short list simply ends; only a list still able to scroll, or still loading, is unfinished.
          const end = scroller();
          if (seen.size && end.scrollTop + end.clientHeight >= end.scrollHeight - 5 && !document.querySelector('[role="progressbar"],[data-visualcompletion="loading-state"]')) { status = 'completed'; reachedEnd = true; message = 'Reached the end of this list.'; }
          break;
        }
        const target = scroller();
        target.scrollBy({ top: Math.max(500, Math.floor(target.clientHeight * .8)), behavior: 'instant' });
        // Hidden tabs may defer native scroll events until a paint. Notify the
        // list's scroll listeners after moving our own viewport so virtualized
        // feeds can load the next batch without activating the tab.
        target.dispatchEvent(new Event('scroll', { bubbles: true }));
        window.dispatchEvent(new Event('scroll'));
        passes++; await sleep(1400);
      }
      await flush();
      if (stopped) { status = 'cancelled'; message = 'Stopped by you. All acknowledged batches remain saved.'; }
      else if (!message) message = seen.size >= options.maxPosts ? `Reached the ${options.maxPosts}-post safety limit. ${deep ? 'Deep scan is incomplete.' : 'Use Deep scan to check older saves.'}` : `Reached the ${minutes}-minute limit. The scan is incomplete; saved batches are kept.`;
      await send({ type: 'SYNC_FINISH', runId: options.runId, status, message, seen: seen.size, seenIds: [...seen].slice(0, 2000), reachedEnd });
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
