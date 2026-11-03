// Platform SDKs run only in this sandboxed frame on a separate loopback origin, never in the library.
(() => {
  const theme = new URLSearchParams(location.search).get('theme') === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = theme;
  window.addEventListener('message', event => {
    if (event.source === parent && event.data?.source === 'savex-library-theme' && ['light', 'dark'].includes(event.data.theme)) document.documentElement.dataset.theme = event.data.theme;
  });
  const root = document.getElementById('embed-root');
  // Native widgets need a readable layout width even in compact grid cards.
  // Scale their whole viewport, including media, and preserve the shadow gutter.
  function fit() {
    const maximum = document.body.dataset.platform === 'x' ? .88 : 1;
    const scale = Math.min(maximum, Math.max(1, document.documentElement.clientWidth - 24) / 326);
    root.style.setProperty('--preview-scale', String(scale));
  }
  fit(); window.addEventListener('resize', fit);
  let ready = false, failed = false, lastHeight = 0;
  const send = (type, extra = {}) => parent.postMessage({ source: 'savex-native-embed', type, ...extra }, '*');
  const timer = setTimeout(() => fail(new Error('The original post did not respond in time.')), 20000);
  function measure() {
    if (!ready) return;
    const height = Math.ceil(root.getBoundingClientRect().height);
    if (height > 80 && Math.abs(height - lastHeight) > 2) { lastHeight = height; send('resize', { height }); }
  }
  function done() { if (failed) return; ready = true; clearTimeout(timer); send('ready'); measure(); }
  function fail(reason) { if (failed) return; failed = true; ready = false; clearTimeout(timer); send('failed', { reason: reason instanceof Error ? reason.message : 'The platform preview was unavailable.' }); }
  function load(src) {
    return new Promise((resolve, reject) => { const script = document.createElement('script'); script.src = src; script.async = true; script.onload = resolve; script.onerror = () => reject(new Error('The platform widget script could not load.')); document.head.append(script); });
  }
  const observer = new ResizeObserver(measure); observer.observe(root);
  window.addEventListener('pagehide', () => { observer.disconnect(); clearTimeout(timer); });
  if (document.body.dataset.platform === 'x') {
    load('https://platform.twitter.com/widgets.js').then(async () => {
      if (!window.twttr?.widgets?.createTweet) throw new Error('X embed unavailable');
      const frame = await window.twttr.widgets.createTweet(document.body.dataset.postId, root, { dnt: true, conversation: 'none', theme, align: 'center', width: 550 });
      if (frame) done(); else fail(new Error('X did not provide an embed for this post.'));
    }).catch(fail);
  } else {
    const frames = new WeakSet(), loaded = new WeakSet();
    let renderedFrame;
    function check() {
      const fallback = root.querySelector('blockquote.instagram-media');
      const hasFallback = fallback && fallback.getClientRects().length && getComputedStyle(fallback).visibility !== 'hidden';
      if (ready && (!renderedFrame?.isConnected || hasFallback)) return fail(new Error('Instagram returned its fallback instead of the post.'));
      const frame = root.querySelector('iframe.instagram-media');
      // SDK helper frames and the original fallback link are not a rendered post.
      if (!ready && !hasFallback && frame && loaded.has(frame) && frame.getBoundingClientRect().height > 80) { renderedFrame = frame; done(); }
    }
    const watch = () => {
      root.querySelectorAll('iframe.instagram-media').forEach(frame => {
        if (frames.has(frame)) return;
        frames.add(frame); frame.addEventListener('load', () => { loaded.add(frame); check(); }, { once: true }); frame.addEventListener('error', fail, { once: true });
      });
      check();
    };
    const mutation = new MutationObserver(watch); mutation.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
    load('https://www.instagram.com/embed.js').then(() => { window.instgrm?.Embeds?.process(); watch(); }).catch(fail);
    window.addEventListener('pagehide', () => mutation.disconnect());
  }
})();
