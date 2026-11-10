const HOUR = 3600000, DAY = 24 * HOUR, MISSES_BEFORE_PAUSE = 3;

// Goes back to a post for a fresh link when its saved link has expired. It is the lowest
// priority work in the app: it stays out of the sync queue, so nothing ever waits for it,
// gives way as soon as anything else starts, and visits one post at a time with long gaps.
export function imageRecovery({ store, images, visit, blocked, onError = () => {}, delay = 60000, gap = 30000, jitter = 15000, poll = 30000, idle = 10 * 60000, watch = 1000, labels = false }) {
  let stopped = false, controller = null, timer = null, release = () => {};
  const misses = new Map();
  const wait = ms => new Promise(resolve => { release = resolve; timer = setTimeout(resolve, ms); timer.unref?.(); });
  const pausedKey = platform => `image_recovery_paused:${platform}`;
  const paused = () => ['instagram', 'x'].filter(platform => Number(store.get(pausedKey(platform)) || 0) > Date.now());
  const pause = (platform, ms) => { misses.delete(platform); store.set(pausedKey(platform), String(Date.now() + ms)); };
  const pace = () => gap + Math.random() * jitter;
  const off = () => store.get('image_recovery') === 'false';

  async function step() {
    if (off() || blocked() || images.busy()) return poll;
    const save = images.nextRecovery(paused()) || (labels ? images.nextLabelCheck(paused()) : null);
    if (!save) return idle;
    controller = new AbortController();
    const watcher = setInterval(() => { if (off() || blocked()) controller.abort(); }, watch);
    let outcome;
    try { outcome = await visit(save, controller.signal); }
    catch (error) { onError(error); outcome = { status: 'missing' }; }
    finally { clearInterval(watcher); }
    // A visit that gave way doesn't count against the save.
    if (stopped || controller.signal.aborted) return poll;
    if (outcome.status === 'check') { pause(save.platform, DAY); return poll; }
    if (outcome.status === 'unavailable') { pause(save.platform, HOUR); return poll; }
    if (save.labelOnly) images.noteLabelCheck(save.id); else images.noteRecovery(save.id);
    if (outcome.status === 'found') {
      misses.delete(save.platform);
      store.importPosts([{ ...outcome.post, platform: save.platform, url: save.url }]);
      return pace();
    }
    misses.set(save.platform, (misses.get(save.platform) || 0) + 1);
    if (misses.get(save.platform) >= MISSES_BEFORE_PAUSE) pause(save.platform, HOUR);
    return pace();
  }
  const done = (async () => {
    await wait(delay);
    while (!stopped) {
      let next = poll;
      try { next = await step(); } catch (error) { if (!stopped) onError(error); }
      if (!stopped) await wait(next);
    }
  })();
  return {
    stop() { stopped = true; controller?.abort(); clearTimeout(timer); release(); return done; }
  };
}
