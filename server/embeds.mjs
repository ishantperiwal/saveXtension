import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export function embedDocument(path, scriptOrigin, parentOrigin = scriptOrigin) {
  const x = path.match(/^\/embed\/x\/(\d+)$/);
  const ig = path.match(/^\/embed\/instagram\/(p|reel|tv)\/([A-Za-z0-9_-]+)$/);
  if (!x && !ig) return null;
  const platform = x ? 'x' : 'instagram', id = x ? x[1] : ig[2];
  const url = x ? `https://x.com/i/status/${id}` : `https://www.instagram.com/${ig[1]}/${id}/`;
  const csp = `default-src 'none'; script-src ${scriptOrigin} 'unsafe-inline' https://platform.twitter.com https://cdn.syndication.twimg.com https://www.instagram.com; style-src ${scriptOrigin} 'unsafe-inline'; frame-src 'self' https://platform.twitter.com https://syndication.twitter.com https://www.instagram.com; connect-src https://*.twitter.com https://*.twimg.com https://*.x.com https://*.instagram.com; img-src data: https://*.twimg.com https://*.cdninstagram.com https://*.fbcdn.net https://www.instagram.com; frame-ancestors ${parentOrigin}; base-uri 'none'; form-action 'none'; sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox allow-presentation allow-same-origin`;
  return { csp, html: `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${platform === 'x' ? 'X' : 'Instagram'} original post</title><link rel="stylesheet" href="/embed-host.css"><script src="/embed-host.js" defer></script></head><body data-platform="${platform}" data-post-id="${id}" data-url="${url}"><main id="embed-root">${ig ? `<blockquote class="instagram-media" data-instgrm-permalink="${url}" data-instgrm-version="14" data-instgrm-captioned><a href="${url}" target="_blank" rel="noopener noreferrer">View this post on Instagram</a></blockquote>` : ''}</main></body></html>` };
}

// A separate loopback origin lets the SDKs use their own internal frames, while
// keeping them away from the library document, cookies, and API origin.
export function previewServer(libraryOrigin) {
  let origin, started = false, resolveReady, rejectReady;
  const ready = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  ready.catch(() => {});
  const parent = new URL(libraryOrigin), parents = new Set([parent.origin]);
  if (['localhost', '127.0.0.1'].includes(parent.hostname)) { parent.hostname = parent.hostname === 'localhost' ? '127.0.0.1' : 'localhost'; parents.add(parent.origin); }
  const server = createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'no-referrer');
    try {
      if (!origin || req.headers.host !== new URL(origin).host || !['GET', 'HEAD'].includes(req.method)) { res.writeHead(403); return res.end(); }
      const path = new URL(req.url, origin).pathname;
      const doc = embedDocument(path, origin, [...parents].join(' '));
      if (doc) { res.setHeader('Content-Security-Policy', doc.csp); res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(req.method === 'HEAD' ? undefined : doc.html); }
      if (['/embed-host.js', '/embed-host.css'].includes(path)) {
        const bytes = await readFile(fileURLToPath(new URL(`../public${path}`, import.meta.url)));
        res.writeHead(200, { 'Content-Type': path.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/css; charset=utf-8' }); return res.end(req.method === 'HEAD' ? undefined : bytes);
      }
      res.writeHead(404); res.end();
    } catch { if (!res.headersSent) res.writeHead(500); res.end(); }
  });
  server.on('error', rejectReady);
  return {
    ready, get origin() { return origin; },
    start() { if (started) return; started = true; server.listen(0, '127.0.0.1', () => { origin = `http://127.0.0.1:${server.address().port}`; server.unref(); resolveReady(); }); },
    close() { if (server.listening) { server.closeAllConnections(); server.close(); } }
  };
}
