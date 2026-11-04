// Platform SDKs run only in this sandboxed frame on a separate loopback origin, never in the library.
(() => {
  const theme = new URLSearchParams(location.search).get('theme') === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = theme;
  window.addEventListener('message', event => {
    if (event.source === parent && event.data?.source === 'savex-library-theme' && ['light', 'dark'].includes(event.data.theme)) document.documentElement.dataset.theme = event.data.theme;
    // The library asks visible previews to re-measure as they scroll into view.
    if (event.source === parent && event.data?.source === 'savex-library-measure') measure();
  });
  const root = document.getElementById('embed-root');
  // Native widgets need a readable layout width even in compact grid cards.
  // Scale their whole viewport, including media, and preserve the shadow gutter.
  function fit() {
    const maximum = document.body.dataset.platform === 'x' ? .88 : 1;
    const scale = Math.min(maximum, Math.max(1, document.documentElement.clientWidth - 24) / 326);
    root.style.setProperty('--preview-scale', String(scale));
  }
  // A new width (switching Feed and Grid) re-lays out the post. Chrome can pause
  // layout callbacks in off-screen frames, so re-measure a few times as it settles.
  const settle = () => { for (const delay of [60, 250, 600, 1200, 2400]) setTimeout(measure, delay); };
  fit(); window.addEventListener('resize', () => { fit(); settle(); });
  let ready = false, failed = false, lastHeight = 0;
  const send = (type, extra = {}) => parent.postMessage({ source: 'savex-native-embed', type, ...extra }, '*');
  const timer = setTimeout(() => fail(new Error('The original post did not respond in time.')), 20000);
  function measure() {
    if (!ready) return;
    const height = Math.ceil(root.getBoundingClientRect().height);
    if (height > 80 && Math.abs(height - lastHeight) > 1) { lastHeight = height; send('resize', { height }); }
  }
  function done() { if (failed) return; ready = true; clearTimeout(timer); send('ready'); measure(); }
  function fail(reason) { if (failed) return; failed = true; ready = false; clearTimeout(timer); send('failed', { reason: reason instanceof Error ? reason.message : 'The platform preview was unavailable.' }); }
  function load(src) {
    return new Promise((resolve, reject) => { const script = document.createElement('script'); script.src = src; script.async = true; script.onload = resolve; script.onerror = () => reject(new Error('The platform widget script could not load.')); document.head.append(script); });
  }
  // X sizes its widget to the pixel, and drawing the post at 88% can round away its
  // last row: the card's bottom border and corners. Each height X sets gets 2px extra.
  function keepBorder(widget) {
    const frame = widget.tagName === 'IFRAME' ? widget : widget.querySelector('iframe');
    if (!frame) return;
    const pad = () => {
      const height = parseFloat(frame.style.height);
      if (!height || frame.dataset.savexHeight === String(height)) return;
      frame.dataset.savexHeight = String(height + 2); frame.style.height = `${height + 2}px`;
    };
    new MutationObserver(pad).observe(frame, { attributes: true, attributeFilter: ['style'] }); pad();
  }
  const observer = new ResizeObserver(measure); observer.observe(root);
  window.addEventListener('pagehide', () => { observer.disconnect(); clearTimeout(timer); });
  if (document.body.dataset.platform === 'x') {
    load('https://platform.twitter.com/widgets.js').then(async () => {
      if (!window.twttr?.widgets?.createTweet) throw new Error('X embed unavailable');
      const frame = await window.twttr.widgets.createTweet(document.body.dataset.postId, root, { dnt: true, conversation: 'none', theme, align: 'center', width: 550 });
      if (frame) { keepBorder(frame); done(); } else fail(new Error('X did not provide an embed for this post.'));
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
