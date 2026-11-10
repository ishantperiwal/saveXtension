const MINUTE = 60000;

// Looks for new saves while the app stays open: on a timer, when the person comes back to the
// app, and right away when they save a post in the panel. `check` starts a scan and returns
// false if something else is running, which only matters for a save that shouldn't be missed.
export function backgroundChecks({ check, onError = () => {}, every = 30 * MINUTE, jitter = 5 * MINUTE, returnAfter = 10 * MINUTE, retry = 2000, retries = 60, now = Date.now }) {
  let stopped = false, timer = null, retryTimer = null, last = now();
  const run = async request => {
    try { const started = await check(request); if (started) last = now(); return started; }
    catch (error) { onError(error); return false; }
  };
  const later = (fn, ms) => { const handle = setTimeout(fn, ms); handle.unref?.(); return handle; };
  const schedule = () => { if (!stopped) timer = later(async () => { await run(); schedule(); }, every + Math.random() * jitter); };
  schedule();
  return {
    returned() { if (!stopped && now() - last >= returnAfter) void run(); },
    // Waits its turn if a scan is already running, since that scan may have passed this post already.
    saved(request) {
      clearTimeout(retryTimer);
      const attempt = async left => { if (!stopped && !await run(request) && left > 0) retryTimer = later(() => attempt(left - 1), retry); };
      void attempt(retries);
    },
    stop() { stopped = true; clearTimeout(timer); clearTimeout(retryTimer); }
  };
}
