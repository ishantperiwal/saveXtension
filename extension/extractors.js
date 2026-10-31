/* Shared by the injected collector and fixture tests. No network requests or credentials here. */
(() => {
  if (globalThis.SaveXExtractors) return;
  const visibleText = el => (el?.innerText || el?.textContent || '').trim();
  function pageInfo(doc, location) {
    const host = location.hostname.replace(/^www\./, '').replace(/^mobile\./, '');
    const path = location.pathname;
    if (['x.com', 'twitter.com'].includes(host) && /^\/i\/bookmarks(?:\/|$)/.test(path)) {
      const profile = doc.querySelector('a[data-testid="AppTabBar_Profile_Link"]');
      const account = profile?.getAttribute('href')?.match(/^\/([\w]+)\/?$/)?.[1];
      return { platform: 'x', account: account ? `@${account}` : '', valid: true };
    }
    if (host === 'instagram.com' && /^\/[\w.]+\/saved(?:\/|$)/.test(path)) {
      const account = path.split('/')[1];
      return { platform: 'instagram', account: `@${account}`, valid: true, collection: path.split('/').filter(Boolean).length > 2 };
    }
    return { valid: false, platform: null, account: '' };
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
        thumbnail: image?.getAttribute('src') || video?.getAttribute('poster') || cardImage?.getAttribute('src') || '',
        kind: video || article.querySelector('[data-testid="videoPlayer"]') ? 'video' : article.querySelectorAll('[data-testid="tweetPhoto"]').length > 1 ? 'carousel' : image ? 'image' : 'text',
        publishedAt: article.querySelector('time')?.getAttribute('datetime') || null });
    }
    return result;
  }
  function instagramPosts(doc) {
    const found = new Map();
    for (const anchor of doc.querySelectorAll('a[href]')) {
      const href = anchor.getAttribute('href');
      const match = href?.match(/^(?:https:\/\/(?:www\.)?instagram\.com)?\/(p|reels?|tv)\/([\w-]+)(?:\/|$)/); if (!match) continue;
      const img = anchor.querySelector('img');
      const alt = img?.getAttribute('alt') || '';
      const author = alt.match(/(?:Photo|Video|Reel) by ([\w.]+) (?:on|in) /i)?.[1] || '';
      const prior = found.get(match[2]);
      const post = { url: `https://www.instagram.com/${match[1] === 'reels' ? 'reel' : match[1]}/${match[2]}/`, author,
        authorName: '', text: alt, thumbnail: img?.getAttribute('src') || '', kind: match[1].startsWith('reel') || anchor.querySelector('video') ? 'video' : /carousel/i.test(anchor.getAttribute('aria-label') || '') ? 'carousel' : 'image' };
      if (!prior || post.text.length > prior.text.length || (!prior.thumbnail && post.thumbnail)) found.set(match[2], post);
    }
    return [...found.values()];
  }
  globalThis.SaveXExtractors = { pageInfo, extract: (doc, platform) => platform === 'x' ? xPosts(doc) : instagramPosts(doc) };
})();
