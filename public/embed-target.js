export function embedTarget(value) {
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port) return null;
    const host = url.hostname.toLowerCase().replace(/^www\./, '').replace(/^mobile\./, '');
    if (['x.com', 'twitter.com'].includes(host)) {
      const id = url.pathname.match(/^\/(?:\w+|i\/web|i)\/status\/(\d+)(?:\/|$)/)?.[1];
      return id ? { platform: 'x', path: `/embed/x/${id}` } : null;
    }
    if (host === 'instagram.com') {
      const match = url.pathname.match(/^\/(p|reels?|tv)\/([A-Za-z0-9_-]+)(?:\/|$)/);
      return match ? { platform: 'instagram', path: `/embed/instagram/${match[1] === 'reels' ? 'reel' : match[1]}/${match[2]}` } : null;
    }
  } catch { /* Unsupported URLs keep their original link. */ }
  return null;
}
