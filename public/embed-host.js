// Platform SDKs run only in this sandboxed frame on a separate loopback origin, never in the library.
(() => {
  const theme = new URLSearchParams(location.search).get('theme') === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = theme;
  window.addEventListener('message', event => {
    if (event.source === parent && event.data?.source === 'savex-library-theme' && ['light', 'dark'].includes(event.data.theme)) document.documentElement.dataset.theme = event.data.theme;
  });
  const root = document.getElementById('embed-root');
  let ready = false, failed = false, lastHeight = 0;
  const send = (type, extra = {}) => parent.postMessage({ source: 'savex-native-embed', type, ...extra }, '*');
  const timer = setTimeout(() => fail(new Error('The original post did not respond in time.')), 20000);
  function measure() {
    if (!ready) return;
    const height = Math.ceil(root.getBoundingClientRect().height);
    if (height > 80 && Math.abs(height - lastHeight) > 2) { lastHeight = height; send('resize', { height }); }
  }
  function done() { if (failed) return; ready = true; clearTimeout(timer); send('ready'); measure(); }
  function fail(reason) { if (ready || failed) return; failed = true; clearTimeout(timer); send('failed', { reason: reason instanceof Error ? reason.message : 'The platform preview was unavailable.' }); }
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
    const frames = new WeakSet();
    const watch = () => root.querySelectorAll('iframe').forEach(frame => {
      if (frames.has(frame)) return;
      frames.add(frame); frame.addEventListener('load', done, { once: true }); frame.addEventListener('error', fail, { once: true });
    });
    const mutation = new MutationObserver(watch); mutation.observe(root, { childList: true, subtree: true });
    load('https://www.instagram.com/embed.js').then(() => { window.instgrm?.Embeds?.process(); watch(); }).catch(fail);
    window.addEventListener('pagehide', () => mutation.disconnect());
  }
})();
