/* Shared by the injected collector and fixture tests. No network requests or credentials here. */
(() => {
  if (globalThis.SaveXExtractors) return;
  const visibleText = el => (el?.innerText || el?.textContent || '').trim();
  function pageInfo(doc, location) {
    const host = location.hostname.replace(/^www\./, '').replace(/^mobile\./, '');
    const path = location.pathname;
    const bookmarksSelected = [...doc.querySelectorAll('[role="tab"][aria-selected="true"]')].some(tab => /^bookmarks$/i.test(visibleText(tab)));
    const xBookmarks = /^\/i\/bookmarks(?:\/|$)/.test(path) || (/^\/i\/history(?:\/|$)/.test(path) && bookmarksSelected);
    if (['x.com', 'twitter.com'].includes(host) && xBookmarks) {
      const profile = doc.querySelector('a[data-testid="AppTabBar_Profile_Link"]');
      const account = profile?.getAttribute('href')?.match(/^\/([\w]+)\/?$/)?.[1];
      return { platform: 'x', account: account ? `@${account}` : '', valid: true };
    }
    if (host === 'instagram.com' && /^\/[\w.]+\/saved(?:\/|$)/.test(path)) {
      const account = path.split('/')[1];
      const collectionId = path.match(/\/saved\/(?:[^/]+\/)?(\d+)\/?$/)?.[1] || '';
      return { platform: 'instagram', account: `@${account}`, valid: true, collection: !!collectionId, collectionId };
    }
    return { valid: false, platform: null, account: '' };
  }
  function instagramCollections(doc, location) {
    const info = pageInfo(doc, location);
    if (info.platform !== 'instagram' || !info.valid) return { account: '', ready: false, collections: [] };
    const collections = new Map(); let ready = false;
    for (const anchor of doc.querySelectorAll('a[href]')) {
      let url; try { url = new URL(anchor.getAttribute('href'), 'https://www.instagram.com'); } catch { continue; }
      if (!['instagram.com', 'www.instagram.com'].includes(url.hostname) || url.protocol !== 'https:' || url.username || url.password || url.port) continue;
      const all = url.pathname.match(/^\/([\w.]+)\/saved\/all-posts\/?$/);
      if (all && `@${all[1]}`.toLowerCase() === info.account.toLowerCase()) ready = true;
      const match = url.pathname.match(/^\/([\w.]+)\/saved\/(?:[^/]+\/)?(\d+)\/?$/);
      if (!match || `@${match[1]}`.toLowerCase() !== info.account.toLowerCase()) continue;
      const name = (anchor.getAttribute('aria-label') || visibleText(anchor)).trim();
      if (!name) continue;
      if (!collections.has(match[2])) collections.set(match[2], { externalId: match[2], name, url: `https://www.instagram.com${url.pathname.replace(/\/?$/, '/')}` });
    }
    return { account: info.account, ready, collections: [...collections.values()] };
  }
  function xPosts(doc) {
    const result = [];
    for (const article of doc.querySelectorAll('article[data-testid="tweet"]')) {
      const link = [...article.querySelectorAll('a[href]')].find(a => a.querySelector('time') && /\/status\/\d+/.test(a.getAttribute('href'))) || [...article.querySelectorAll('a[href]')].find(a => /\/status\/\d+/.test(a.getAttribute('href')));
      const href = link?.getAttribute('href') || '';
      const match = href.match(/\/(\w+)\/status\/(\d+)/); if (!match) continue;
      const name = article.querySelector('[data-testid="User-Name"]');
      const authorName = visibleText(name?.querySelector('a:not([tabindex="-1"]) span')) || visibleText(name?.querySelector('span'));
      const caption = [...article.querySelectorAll('[data-testid="tweetText"]')].map(visibleText).join('\n\n');
      const image = article.querySelector('[data-testid="tweetPhoto"] img');
      const video = article.querySelector('video');
      const cardImage = article.querySelector('[data-testid="card.wrapper"] img');
      result.push({ url: `https://x.com/${match[1]}/status/${match[2]}`, author: match[1], authorName, text: caption,
        media: [...new Set([...article.querySelectorAll('[data-testid="tweetPhoto"] img')].map(img => img.getAttribute('src')).filter(Boolean))],
        thumbnail: image?.getAttribute('src') || video?.getAttribute('poster') || cardImage?.getAttribute('src') || '',
        kind: video || article.querySelector('[data-testid="videoPlayer"]') ? 'video' : article.querySelectorAll('[data-testid="tweetPhoto"]').length > 1 ? 'carousel' : image ? 'image' : 'text',
        publishedAt: article.querySelector('time')?.getAttribute('datetime') || null });
    }
    return result;
  }
  function instagramPosts(doc) {
    const found = new Map();
    for (const anchor of doc.querySelectorAll('a[href]')) {
      let url; try { url = new URL(anchor.getAttribute('href'), 'https://www.instagram.com'); } catch { continue; }
      if (url.protocol !== 'https:' || !['instagram.com', 'www.instagram.com'].includes(url.hostname) || url.username || url.password || url.port) continue;
      // Collection grids include the creator before /p/ or /reel/; All posts
      // can omit it. Both forms must have the same canonical post identity.
      const match = url.pathname.match(/^\/(?:([\w.]+)\/)?(p|reels?|tv)\/([\w-]+)(?:\/|$)/); if (!match) continue;
      const img = anchor.querySelector('img');
      const alt = img?.getAttribute('alt') || '';
      const author = alt.match(/(?:Photo|Video|Reel) by ([\w.]+) (?:on|in) /i)?.[1] || match[1] || '';
      const prior = found.get(match[3]);
      const post = { url: `https://www.instagram.com/${match[2] === 'reels' ? 'reel' : match[2]}/${match[3]}/`, author,
        authorName: '', text: alt, thumbnail: img?.getAttribute('src') || '', kind: match[2].startsWith('reel') || match[2] === 'tv' || anchor.querySelector('video') ? 'video' : /carousel/i.test(anchor.getAttribute('aria-label') || '') ? 'carousel' : 'image' };
      if (!prior || post.text.length > prior.text.length || (!prior.thumbnail && post.thumbnail)) found.set(match[3], post);
    }
    return [...found.values()];
  }
  function detail(doc, platform, url) {
    if (platform === 'x') {
      const id = url.match(/\/status\/(\d+)/)?.[1];
      return xPosts(doc).find(p => p.url.endsWith(`/status/${id}`)) || null;
    }
    const meta = key => doc.querySelector(`meta[property="${key}"],meta[name="${key}"]`)?.getAttribute('content') || '';
    const article = doc.querySelector('main article,article,main');
    const description = meta('og:description') || meta('description');
    const caption = visibleText(article?.querySelector('h1')) || description;
    const author = article?.querySelector('header a[href]')?.getAttribute('href')?.match(/^\/([\w.]+)\/?$/)?.[1] || description.match(/(?:[—–-]\s*|\()([\w.]+)(?:\)| on |:)/)?.[1] || '';
    const images = [...(article?.querySelectorAll('img') || [])].filter(img => !/profile picture/i.test(img.getAttribute('alt') || '') && (Number(img.getAttribute('width')) > 100 || /cdninstagram|fbcdn/.test(img.getAttribute('src') || ''))).map(img => img.getAttribute('src')).filter(Boolean);
    const thumbnail = meta('og:image') || images[0] || '';
    if (!caption && !thumbnail) return null;
    return { url, text: caption, author, authorName: '', thumbnail, media: [...new Set([thumbnail, ...images].filter(Boolean))].slice(0, 20), publishedAt: article?.querySelector('time')?.getAttribute('datetime') || null, kind: doc.querySelector('video') || /\/reel\//.test(url) ? 'video' : images.length > 1 ? 'carousel' : 'image' };
  }
  function xBookmarkState(doc, url) {
    const externalId = url.match(/\/status\/(\d+)/)?.[1];
    const profile = doc.querySelector('a[data-testid="AppTabBar_Profile_Link"]')?.getAttribute('href');
    const handle = profile?.match(/^\/([\w]+)\/?$/)?.[1];
    if (!externalId || !handle) return null;
    const targets = [...doc.querySelectorAll('article[data-testid="tweet"]')].filter(article => {
      // Require the target post's own dated permalink, never a quoted/recommended post.
      const ownLinks = [...article.querySelectorAll('a[href]')].filter(a => a.closest('article') === article && a.querySelector('time'));
      return ownLinks[0]?.getAttribute('href')?.match(/\/status\/(\d+)(?:\/|$)/)?.[1] === externalId;
    });
    if (targets.length !== 1) return null;
    const article = targets[0];
    const buttons = [...article.querySelectorAll('button[data-testid]')].filter(b => b.closest('article') === article && !b.disabled && b.getAttribute('aria-disabled') !== 'true');
    const save = buttons.filter(b => b.getAttribute('data-testid') === 'bookmark' && /^bookmark$/i.test(b.getAttribute('aria-label') || '') && b.getAttribute('aria-pressed') !== 'true');
    const remove = buttons.filter(b => b.getAttribute('data-testid') === 'removeBookmark');
    if (save.length === 1 && remove.length === 0) return { externalId, account: `@${handle}`, state: 'unsaved' };
    if (remove.length === 1 && save.length === 0) return { externalId, account: `@${handle}`, state: 'saved' };
    return null;
  }
  globalThis.SaveXExtractors = { pageInfo, detail, instagramCollections, xBookmarkState, extract: (doc, platform) => platform === 'x' ? xPosts(doc) : instagramPosts(doc) };
})();
