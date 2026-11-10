// A saved pin only gives a still preview, so a GIF looks like an image. Its original sits under the same ID as the preview,
// so asking whether a .gif exists settles it, with no sign-in and no visit to the pin. Each pin is asked about once.
const GIF_ID = /^https:\/\/i\.pinimg\.com\/[^/]+\/((?:[0-9a-f]{2}\/){3}[0-9a-f]+)\./i;
export const gifAddress = thumbnail => { const id = String(thumbnail || '').match(GIF_ID)?.[1]; return id ? `https://i.pinimg.com/originals/${id}.gif` : ''; };

export function pinterestGifs({ store, ask = fetch, every = 60000, gap = 500, onError = () => {} }) {
  let stopped = false, timer = null, running = null;
  const controller = new AbortController();
  async function check() {
    for (const { id, thumbnail } of store.uncheckedPins(50)) {
      if (stopped) return;
      const address = gifAddress(thumbnail);
      if (!address) { store.markPinChecked(id, false); continue; }
      const reply = await ask(address, { method: 'HEAD', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]) });
      // Anything but a clear answer is asked again on the next round.
      if (reply.status === 200) store.markPinChecked(id, /^image\/gif/i.test(reply.headers.get('content-type') || ''));
      else if (reply.status === 403 || reply.status === 404) store.markPinChecked(id, false);
      else return;
      await new Promise(resolve => { const wait = setTimeout(resolve, gap); wait.unref?.(); });
    }
  }
  const round = () => { running = check().catch(error => { if (!stopped) onError(error); }).finally(() => { running = null; if (!stopped) { timer = setTimeout(round, every); timer.unref?.(); } }); return running; };
  return {
    start() { return round(); },
    check,
    close() { stopped = true; clearTimeout(timer); controller.abort(); return running; },
  };
}
