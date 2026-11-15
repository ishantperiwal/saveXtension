/* Shared by the injected collector and fixture tests. No network requests or credentials here. */
(() => {
  if (globalThis.SaveXExtractors) return;
  const visibleText = el => (el?.innerText || el?.textContent || '').trim();
  // Injected without modules, so this mirrors public/pinterest-host.js.
  const pinterestHost = host => /^(?:[a-z]{2,3}\.)?pinterest\.(?:com|co\.uk|com\.au|com\.mx|co\.kr|ca|de|fr|es|it|pt|at|ch|cl|dk|ie|jp|kr|nz|ph|se|ru)$/.test(host);
  const PINTEREST_PAGES = new Set(['pin', 'search', 'ideas', 'today', 'settings', 'business', 'topics', 'explore', 'videos', 'news_hub', 'login', '_']);
  function pageInfo(doc, location) {
    const host = location.hostname.replace(/^www\./, '').replace(/^mobile\./, '');
    const path = location.pathname;
    // Match the selected tab by its link so other site languages still work.
    const bookmarksSelected = [...doc.querySelectorAll('[role="tab"][aria-selected="true"]')].some(tab => [tab, ...tab.querySelectorAll('a[href]')].some(el => /^\/i\/bookmarks(?:\/|$)/.test(el.getAttribute('href') || '')) || /^bookmarks$/i.test(visibleText(tab)));
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
    if (pinterestHost(host)) {
      // /name/_pins/ lists everything, /name/_boards/ holds board cards and unorganized pins,
      // and /name/board/ is one board. Every other /name/_tab/ is not a saved list.
      const match = path.match(/^\/([\w.-]+)\/([^/]+)\/?$/);
      if (match && !PINTEREST_PAGES.has(match[1]) && (!match[2].startsWith('_') || ['_pins', '_boards'].includes(match[2]))) {
        const collectionId = match[2] === '_pins' ? '' : match[2] === '_boards' ? 'unorganized' : match[2];
        return { platform: 'pinterest', account: `@${match[1]}`, valid: true, collection: !!collectionId, collectionId };
      }
    }
    // Threads has one saved list, and its address doesn't name the account, so the account comes from the
    // navigation's profile link, as on X.
    if (['threads.com', 'threads.net'].includes(host) && /^\/saved\/?$/.test(path)) return { platform: 'threads', account: threadsAccount(doc), valid: true };
    return { valid: false, platform: null, account: '' };
  }
  // The signed-in account's profile link sits in the navigation, outside every post. A post's own author links are
  // inside a post box, so they never count.
  function threadsAccount(doc) {
    const handles = new Set();
    for (const anchor of doc.querySelectorAll('a[href^="/@"]')) {
      if (anchor.closest('[data-pressable-container]') || !anchor.querySelector('svg')) continue;
      const handle = anchor.getAttribute('href').match(/^\/@([\w.]{1,100})\/?$/)?.[1];
      if (handle) handles.add(handle.toLowerCase());
    }
    // Two different profile links mean the page can't say whose it is.
    return handles.size === 1 ? `@${[...handles][0]}` : '';
  }
  // Each post is a box marked data-pressable-container. Its own link is the one around its time. A post it quotes
  // sits inside it with its own link and time, so anything inside that part belongs to the quoted post.
  function threadsPosts(doc) {
    const found = new Map();
    const timeLink = anchor => /^\/@[\w.]+\/post\/[\w-]+/.test(anchor.getAttribute('href') || '') && anchor.querySelector('time');
    for (const card of doc.querySelectorAll('[data-pressable-container="true"]')) {
      if (card.parentElement?.closest('[data-pressable-container="true"]')) continue;
      const links = [...card.querySelectorAll('a[href]')].filter(timeLink), own = links[0];
      const match = own?.getAttribute('href').match(/^\/@([\w.]{1,100})\/post\/([\w-]+)/);
      if (!match || found.has(match[2])) continue;
      // The part holding a quoted post: from its link, the largest box that doesn't also hold this post's own link.
      const quotedBoxes = links.slice(1).map(link => { let box = link; while (box.parentElement && box.parentElement !== card && !box.parentElement.contains(own)) box = box.parentElement; return box; });
      const quoted = el => quotedBoxes.some(box => box.contains(el));
      const caption = [...card.querySelectorAll('span[dir="auto"]')].filter(span => !span.closest('a,[role="button"]') && !span.querySelector('time') && !span.parentElement?.closest('span[dir="auto"]') && !quoted(span)).map(visibleText).filter(Boolean).join('\n');
      const picture = img => /(?:cdninstagram\.com|fbcdn\.net)\//.test(img.getAttribute('src') || '') && !/\/t51\.\d+-19\//.test(img.getAttribute('src')) && !/profile picture/i.test(img.getAttribute('alt') || '');
      // A link's preview card is the link's picture, not the post's own.
      const preview = el => !!el.closest('a[href]:not([href^="/"])');
      const allImages = [...card.querySelectorAll('img')].filter(picture), images = allImages.filter(img => !quoted(img) && !preview(img));
      const videos = [...card.querySelectorAll('video')], ownVideo = videos.find(video => !quoted(video));
      const source = img => img.getAttribute('src') || '';
      const thumbnail = (images[0] && source(images[0])) || ownVideo?.getAttribute('poster') || allImages.map(source)[0] || videos[0]?.getAttribute('poster') || '';
      const authorName = visibleText([...card.querySelectorAll(`a[href="/@${match[1]}"]`)].find(anchor => !quoted(anchor) && visibleText(anchor)));
      found.set(match[2], { url: `https://www.threads.com/@${match[1]}/post/${match[2]}`, author: match[1], authorName: authorName && authorName !== match[1] ? authorName : '', text: caption,
        thumbnail, media: [...new Set(images.map(source).filter(Boolean))],
        kind: ownVideo ? 'video' : images.length > 1 ? 'carousel' : images.length ? 'image' : 'text',
        // Media can still be loading, so only a post showing media is sure of its kind.
        kindSure: !!ownVideo || images.length > 0,
        publishedAt: own.querySelector('time')?.getAttribute('datetime') || null });
    }
    return [...found.values()];
  }
  function pinterestBoards(doc, location) {
    const info = pageInfo(doc, location);
    if (info.platform !== 'pinterest' || info.collectionId !== 'unorganized') return { account: '', ready: false, collections: [] };
    const handle = info.account.slice(1), collections = new Map();
    for (const anchor of doc.querySelectorAll('a[href]')) {
      let url; try { url = new URL(anchor.getAttribute('href'), location.origin); } catch { continue; }
      const match = url.pathname.match(/^\/([\w.-]+)\/([^/_][^/]*)\/?$/);
      if (!match || match[1].toLowerCase() !== handle.toLowerCase() || !pinterestHost(url.hostname.replace(/^www\./, ''))) continue;
      const card = anchor.closest('[data-test-id="profile-board-card"],[data-test-id="pwt-grid-item"]');
      const name = visibleText((card || anchor).querySelector('[data-test-id="board-card-title"]')) || anchor.getAttribute('aria-label')?.trim() || '';
      if (name && !collections.has(match[2])) collections.set(match[2], { externalId: match[2], name, url: `https://www.pinterest.com/${handle}/${match[2]}/` });
    }
    if (doc.querySelector('[data-test-id="unorganized-ideas-heading-container"]')) collections.set('unorganized', { externalId: 'unorganized', name: 'Unorganized', url: `https://www.pinterest.com/${handle}/_boards/` });
    // A profile with no boards still shows its name, so an empty list is a real answer.
    return { account: info.account, ready: !!doc.querySelector('[data-test-id="profile-name"],[data-test-id="profile-board-card"]'), collections: [...collections.values()] };
  }
  function pinterestPosts(doc, location = doc.location) {
    // Only the list itself: a board's "More ideas" and other recommendations sit outside it.
    const { collectionId } = pageInfo(doc, location);
    const list = collectionId === 'unorganized' ? doc : doc.querySelector(collectionId ? '[data-test-id="board-feed"]' : '[data-test-id="user-profile-pin-grid"]');
    const found = new Map();
    for (const pin of list?.querySelectorAll('[data-test-id="pin"]') || []) {
      const link = pin.querySelector('a[href*="/pin/"]'), id = pin.getAttribute('data-test-pin-id') || link?.getAttribute('href')?.match(/\/pin\/(?:[^/]*--)?(\d+)/)?.[1];
      if (!id || !/^\d+$/.test(id) || found.has(id)) continue;
      const img = pin.querySelector('img'), video = pin.querySelector('video,[data-test-id="pincard-video-with-link"]');
      // Only the title, on the user's decision. The image's alt text can hold the whole description.
      const title = (link?.getAttribute('aria-label') || '').replace(/\s*pin page$/i, '').trim();
      const source = img?.getAttribute('src') || pin.querySelector('video')?.getAttribute('poster') || '';
      const thumbnail = source.replace('/236x/', '/736x/');
      found.set(id, { url: `https://www.pinterest.com/pin/${id}/`, author: '', authorName: '', text: /^untitled$/i.test(title) ? '' : title, thumbnail, media: thumbnail ? [thumbnail] : [], kind: video ? 'video' : 'image' });
    }
    return [...found.values()];
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
      // A quoted post sits inside this one's box, in a link block with its own author, so its media isn't this post's.
      const quoted = el => { for (let box = el.closest('[role="link"]'); box && box !== article && article.contains(box); box = box.parentElement?.closest('[role="link"]')) if (box.querySelector('[data-testid="User-Name"]')) return true; return false; };
      // A video tile can carry a small avatar of whoever first posted it; that isn't the post's image.
      const allPhotos = [...article.querySelectorAll('[data-testid="tweetPhoto"] img:not([src*="/profile_images/"])')], photos = allPhotos.filter(img => !quoted(img));
      const allVideos = [...article.querySelectorAll('video')], ownVideo = allVideos.find(el => !quoted(el));
      const hasVideo = !!ownVideo || [...article.querySelectorAll('[data-testid="videoPlayer"]')].some(el => !quoted(el));
      const hasQuote = [...allPhotos, ...allVideos, ...article.querySelectorAll('[data-testid="tweetText"]')].some(quoted);
      const tiles = [...article.querySelectorAll('[data-testid="tweetPhoto"]')].filter(el => !quoted(el)).length;
      const image = photos[0];
      const cardImage = article.querySelector('[data-testid="card.wrapper"] img');
      result.push({ url: `https://x.com/${match[1]}/status/${match[2]}`, author: match[1], authorName, text: caption,
        media: [...new Set(photos.map(img => img.getAttribute('src')).filter(Boolean))],
        // With no media of its own, a post still shows what it quotes, without claiming it as its own.
        thumbnail: image?.getAttribute('src') || ownVideo?.getAttribute('poster') || allPhotos[0]?.getAttribute('src') || allVideos[0]?.getAttribute('poster') || cardImage?.getAttribute('src') || '',
        kind: hasVideo ? 'video' : tiles > 1 ? 'carousel' : image ? 'image' : 'text',
        // A plain "text" reading could just be media that hasn't loaded yet, so only this much is certain.
        kindSure: hasVideo || !!image || hasQuote,
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
        authorName: '', text: alt, thumbnail: img?.getAttribute('src') || '', kind: match[2].startsWith('reel') || match[2] === 'tv' || anchor.querySelector('video') ? 'video' : /carousel/i.test(anchor.getAttribute('aria-label') || '') ? 'carousel' : 'image',
        // The grid can't tell a photo from a video on a /p/ link, so "image" here is only a guess.
        kindSure: match[2].startsWith('reel') || match[2] === 'tv' || !!anchor.querySelector('video') || /carousel/i.test(anchor.getAttribute('aria-label') || '') };
      if (!prior || post.text.length > prior.text.length || (!prior.thumbnail && post.thumbnail)) found.set(match[3], post);
    }
    return [...found.values()];
  }
  function detail(doc, platform, url) {
    // A Threads post's page shows it in the same box as the list, with the post it replies to above and replies below.
    if (platform === 'threads') {
      const code = url.match(/\/post\/([\w-]+)/)?.[1];
      return threadsPosts(doc).find(p => p.url.endsWith(`/post/${code}`)) || null;
    }
    if (platform === 'x') {
      const id = url.match(/\/status\/(\d+)/)?.[1];
      return xPosts(doc).find(p => p.url.endsWith(`/status/${id}`)) || null;
    }
    const meta = key => doc.querySelector(`meta[property="${key}"],meta[name="${key}"]`)?.getAttribute('content') || '';
    const article = doc.querySelector('main article,article,main');
    const description = meta('og:description') || meta('description');
    const caption = visibleText(article?.querySelector('h1')) || description;
    const author = article?.querySelector('header a[href]')?.getAttribute('href')?.match(/^\/([\w.]+)\/?$/)?.[1] || description.match(/(?:[—–-]\s*|\()([\w.]+)(?:\)| on |:)/)?.[1] || '';
    const images = [...(article?.querySelectorAll('img') || [])].filter(img => !img.closest('header') && !/profile picture/i.test(img.getAttribute('alt') || '') && (Number(img.getAttribute('width')) > 100 || /cdninstagram|fbcdn/.test(img.getAttribute('src') || ''))).map(img => img.getAttribute('src')).filter(Boolean);
    // Only this post's own media counts, not recommendations further down the page.
    const postMedia = doc.querySelector('main article,article') || doc.querySelector('main');
    const thumbnail = meta('og:image') || images[0] || '';
    if (!caption && !thumbnail) return null;
    return { url, text: caption, author, authorName: '', thumbnail, media: [...new Set([thumbnail, ...images].filter(Boolean))].slice(0, 20), publishedAt: article?.querySelector('time')?.getAttribute('datetime') || null, kind: postMedia?.querySelector('video') || /\/reel\//.test(url) ? 'video' : images.length > 1 ? 'carousel' : 'image', kindSure: !!postMedia?.querySelector('video') || /\/reel\//.test(url) || !!doc.querySelector('main article') && images.length > 0 };
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
    // The data-testid names the state in every site language. An English name
    // that contradicts it (remove, settings) still fails closed. Detail pages put
    // a public count in the name; it does not mean this user saved it.
    const save = buttons.filter(b => b.getAttribute('data-testid') === 'bookmark' && !/remove|settings/i.test(b.getAttribute('aria-label') || '') && b.getAttribute('aria-pressed') !== 'true');
    const remove = buttons.filter(b => b.getAttribute('data-testid') === 'removeBookmark');
    if (save.length === 1 && remove.length === 0) return { externalId, account: `@${handle}`, state: 'unsaved' };
    if (remove.length === 1 && save.length === 0) return { externalId, account: `@${handle}`, state: 'saved' };
    return null;
  }
  // Tells an empty saved list apart from a page whose posts can't be read.
  // 'unreadable' means the site rendered content this parser no longer understands.
  function diagnose(doc, platform) {
    if (platform === 'x') {
      if (doc.querySelector('[data-testid="emptyState"]')) return 'empty';
      return !xPosts(doc).length && doc.querySelector('main article, main a[href*="/status/"] time') ? 'unreadable' : '';
    }
    if (platform === 'threads') {
      if (threadsPosts(doc).length) return '';
      return doc.querySelector('[data-pressable-container="true"]') || doc.querySelectorAll('img[src*="fbcdn.net"],img[src*="cdninstagram.com"]').length >= 3 ? 'unreadable' : '';
    }
    if (platform === 'pinterest') {
      if (pinterestPosts(doc).length) return '';
      if (doc.querySelector('[data-test-id="pin"]') || doc.querySelectorAll('img[src*="pinimg.com"]').length >= 3) return 'unreadable';
      return doc.querySelector('[data-test-id="header-profile"]') ? 'empty' : '';
    }
    const images = [...doc.querySelectorAll('main img[src]')].filter(img => !img.closest('header'));
    return !instagramPosts(doc).length && images.length >= 3 ? 'unreadable' : '';
  }
  const layoutChanged = platform => `${platform === 'x' ? 'X' : platform === 'pinterest' ? 'Pinterest' : platform === 'threads' ? 'Threads' : 'Instagram'} loaded, but saveXtension couldn’t read the page. The site’s layout may have changed, so saveXtension needs an update. Nothing was removed.`;
  globalThis.SaveXExtractors = { pageInfo, detail, instagramCollections, pinterestBoards, xBookmarkState, diagnose, layoutChanged, threadsAccount, extract: (doc, platform) => platform === 'x' ? xPosts(doc) : platform === 'pinterest' ? pinterestPosts(doc) : platform === 'threads' ? threadsPosts(doc) : instagramPosts(doc) };
})();
