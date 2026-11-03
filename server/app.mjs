import { unsaveQueue } from './unsave.mjs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, dirname, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { timingSafeEqual } from 'node:crypto';
import { Store, passwordHash, passwordMatches, token, hash } from './store.mjs';
import { previewServer } from './embeds.mjs';
import { instagramSaveLists, setInstagramSaveList } from './instagram-save-lists.mjs';
import { syncQueue } from './sync.mjs';
import { HttpError, text, canonicalPost } from './domain.mjs';
import { createLibraryMcp } from './mcp.mjs';
import { TopicLibrary, topicCatalog, importTopicCatalog } from './topics.mjs';

const publicDir = resolve(dirname(fileURLToPath(import.meta.url)), '../public');
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.zip': 'application/zip', '.ttf': 'font/ttf' };
const extensionOrigin = value => /^chrome-extension:\/\/[a-p]{32}$/.test(value || '');

export function createApp({ dataPath, origin = 'http://localhost:3210', secure = false, localMode = true, setupCode = token() } = {}) {
  const store = new Store(dataPath || ':memory:');
  if (localMode && !['localhost', '127.0.0.1'].includes(new URL(origin).hostname)) throw new Error('Local mode requires a localhost origin.');
  const sync = syncQueue(store), topicLibrary = new TopicLibrary(store), unsaves = unsaveQueue(store, sync);
  const enqueueSync = (...args) => { if(unsaves.busy())throw new HttpError(409, 'Wait for the current unsave to finish.'); return sync.enqueue(...args); };
  // Discard the generated image cache; previews are served by the platforms.
  store.db.exec('DROP TABLE IF EXISTS media_cache');
  const preview = previewServer(new URL(origin).origin);

  const attempts = new Map();
  const appOrigin = new URL(origin).origin;
  const mcp = createLibraryMcp(store, { origin: appOrigin, localMode });
  function limited(req, group, max = 10) {
    const key = `${group}:${req.socket.remoteAddress}`;
    const now = Date.now();
    const previous = attempts.get(key);
    const entry = !previous || previous.reset < now ? { count: 0, reset: now + 60000 } : previous;
    if (++entry.count > max) throw new HttpError(429, 'Too many attempts. Try again in a minute.');
    attempts.set(key, entry);
    if (attempts.size > 10000) for (const [k, v] of attempts) if (v.reset < now) attempts.delete(k);
  }
  function sessionValue(req) { return req.headers.cookie?.split(';').map(v => v.trim()).find(v => v.startsWith('savex_session='))?.slice(14); }
  function session(req) { if (localMode) return; if (!store.session(sessionValue(req))) throw new HttpError(401, 'Please sign in to your library.'); }
  function device(req) {
    if (localMode) return { id: 'local-browser', name: 'Local Chrome' };
    const value = req.headers.authorization?.match(/^Bearer (\S+)$/)?.[1];
    const found = store.device(value);
    if (!found) throw new HttpError(401, 'Extension disconnected. Pair it again from your library.');
    return found;
  }
  async function body(req) {
    const type = req.headers['content-type'] || '';
    if (!type.startsWith('application/json')) throw new HttpError(415, 'Send JSON data.');
    const parts = []; let size = 0;
    for await (const part of req) {
      size += part.length;
      if (size > 4 * 1024 * 1024) throw new HttpError(413, 'Import too large. Use batches of at most 200 posts.');
      parts.push(part);
    }
    try {
      const parsed = JSON.parse(Buffer.concat(parts).toString('utf8'));
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
      return parsed;
    } catch { throw new HttpError(400, 'Send a JSON object.'); }
  }
  function cookie(res, value, age = 604800) {
    res.setHeader('Set-Cookie', `savex_session=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${secure ? '; Secure' : ''}`);
  }
  function json(res, value, status = 200) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); }
  const server = createServer(async (req, res) => {
    try { await preview.ready; } catch { /* The library and original links remain usable if previews cannot start. */ }
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Security-Policy', `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' https://pbs.twimg.com https://*.cdninstagram.com https://*.fbcdn.net; connect-src 'self'; frame-src ${preview.origin || "'none'"}; frame-ancestors 'none'; base-uri 'none'; form-action 'self'`);
    const requestOrigin = req.headers.origin;
    // Extension origins receive CORS only for their limited token-authenticated endpoints.
    const path = new URL(req.url, appOrigin).pathname;
    const isExtensionRoute = path.startsWith('/api/extension/');
    if (isExtensionRoute && extensionOrigin(requestOrigin)) {
      res.setHeader('Access-Control-Allow-Origin', requestOrigin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Private-Network', 'true');
    }
    try {
      const host = req.headers.host;
      const expectedHost = new URL(appOrigin).host;
      // Prevent DNS rebinding; localhost and 127.0.0.1 are interchangeable in local mode.
      const localHosts = new URL(appOrigin).hostname === 'localhost' || new URL(appOrigin).hostname === '127.0.0.1';
      const validLocalHost = localHosts && ['localhost', '127.0.0.1'].some(h => host === `${h}:${new URL(appOrigin).port || (secure ? '443' : '80')}`);
      if (host !== expectedHost && !validLocalHost) throw new HttpError(403, 'Unexpected host. Configure APP_ORIGIN for this address.');
      if (path === '/mcp') {
        if (!localMode || !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress)) throw new HttpError(403, 'MCP accepts local connections only.');
        const allowedOrigins = new Set([appOrigin, `http://127.0.0.1:${new URL(appOrigin).port || '80'}`, `http://localhost:${new URL(appOrigin).port || '80'}`]);
        if (requestOrigin !== undefined && !allowedOrigins.has(requestOrigin)) throw new HttpError(403, 'Unsupported MCP origin.');
        return await mcp.handle(req, res);
      }
      if (req.method === 'OPTIONS' && isExtensionRoute && extensionOrigin(requestOrigin)) { res.writeHead(204); res.end(); return; }
      if (!['GET', 'HEAD'].includes(req.method) && !isExtensionRoute) {
        const localOrigin = validLocalHost && requestOrigin === `http://${host}`;
        if (requestOrigin !== appOrigin && !localOrigin) throw new HttpError(403, 'Request must come from your library.');
      }
      if (isExtensionRoute && requestOrigin && !extensionOrigin(requestOrigin) && requestOrigin !== appOrigin) throw new HttpError(403, 'Unsupported extension origin.');
      if (localMode && !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress)) throw new HttpError(403, 'Local mode only accepts connections from this computer.');
      if (path === '/api/session' && req.method === 'GET') return json(res, { embedOrigin: preview.origin, localMode, setupRequired: !localMode && !store.get('password'), authenticated: localMode || store.session(sessionValue(req)), name: store.get('name') || 'My saves' });
      if (path === '/api/setup' && req.method === 'POST') {
        limited(req, 'auth');
        if (store.get('password')) throw new HttpError(409, 'Your library is already set up.');
        const input = await body(req);
        if (!timingSafeEqual(Buffer.from(hash(input.code)), Buffer.from(hash(setupCode)))) throw new HttpError(401, 'Use the setup code printed in your server terminal.');
        if (typeof input.password !== 'string' || input.password.length < 12 || input.password.length > 256) throw new HttpError(400, 'Choose a password between 12 and 256 characters.');
        store.set('password', passwordHash(input.password)); store.set('name', text(input.name, 50) || 'My library');
        cookie(res, store.createSession()); return json(res, { ok: true });
      }
      if (path === '/api/login' && req.method === 'POST') {
        limited(req, 'auth'); const input = await body(req);
        const stored = store.get('password');
        if (!stored || typeof input.password !== 'string' || input.password.length > 256 || !passwordMatches(input.password, stored)) throw new HttpError(401, 'That password didn’t match. Try again.');
        cookie(res, store.createSession()); return json(res, { ok: true });
      }
      if (path === '/api/logout' && req.method === 'POST') { store.deleteSession(sessionValue(req)); cookie(res, '', 0); return json(res, { ok: true }); }
      if (path === '/api/extension/pair' && req.method === 'POST') {
        limited(req, 'pair'); const input = await body(req); return json(res, store.pair(input.code, input.name));
      }
      if (isExtensionRoute) {
        const d = device(req);
        if (localMode && path === '/api/extension/jobs' && req.method === 'POST') {
          const input = await body(req); sync.heartbeat(input);
          const claimedUnsave = input.claim && input.ready ? unsaves.claim(text(input.instance,100),input.unsave===true) : null;
          return json(res, { ...sync.status(), unsave: unsaves.status(), claimedUnsave, scanAccountsRequested: input.accountSwitching ? sync.takeAccountScan() : false, setupRequested: sync.takeSetup(text(input.instance, 100)), bookmarkSetupRequested: sync.takeSetup(text(input.instance, 100), 'chrome'), claimed: !unsaves.busy() && input.claim && (input.ready || input.bookmarksReady) ? sync.claim(text(input.instance, 100), input.accountSwitching === true, { selectedAccounts: input.selectedAccounts === true, syncModes: input.syncModes === true, instagramCollections: input.instagramCollections === true, instagramSaveLists: input.instagramSaveLists === true, socialReady: input.ready === true, bookmarksSupported: input.bookmarksSupported === true, bookmarksReady: input.bookmarksReady === true }) : null });
        }
        if (localMode && path === '/api/extension/queue' && req.method === 'POST') { const input = await body(req); return json(res, { job: enqueueSync(input.targets, input.xAccount, input.mode, input.instagramAccount, input.instagramCollectionId) }); }
        if (localMode && path === '/api/extension/accounts' && req.method === 'POST') return json(res, { xAccounts: sync.setAccounts(await body(req)) });
        if (localMode && path === '/api/extension/instagram-collections' && req.method === 'POST') {
          const input = await body(req);
          return json(res, { collections: store.upsertInstagramCollections(input.account, input.collections) });
        }
        if (localMode && path === '/api/extension/stop' && req.method === 'POST') return json(res, { job: sync.cancel() });
        const unsavePath = path.match(/^\/api\/extension\/unsaves\/([a-f0-9]+)\/(act|finish)$/);
        if(localMode && unsavePath && req.method==='POST') {const input=await body(req);return json(res,unsavePath[2]==='act'?unsaves.act(unsavePath[1],text(input.instance,100)):unsaves.finish(unsavePath[1],text(input.instance,100),input));}
        const jobPath = path.match(/^\/api\/extension\/jobs\/([a-f0-9]+)$/);
        if (localMode && jobPath && req.method === 'POST') { const input = await body(req); return json(res, { job: sync.update(jobPath[1], input.instance, input) }); }
        if (localMode && path === '/api/extension/details' && req.method === 'GET') {
          const query = new URL(req.url, appOrigin).searchParams, platform = query.get('platform'), account = query.get('account');
          const runId = query.get('runId');
          if (runId) {
            const run = store.run(runId, d.id);
            if (!run || run.platform !== platform || run.account !== account || run.status !== 'running') throw new HttpError(404, 'Active sync not found.');
          }
          const candidates = store.detailCandidates(platform, account, runId);
          const posts = candidates.slice(0, 25).map(p => ({ url: p.url }));
          return json(res, { posts, remaining: Math.max(0, candidates.length - posts.length) });
        }
        if (localMode && path === '/api/extension/known' && req.method === 'GET') {
          const query = new URL(req.url, appOrigin).searchParams, platform = query.get('platform'), account = query.get('account');
          if (!['x', 'instagram'].includes(platform) || !account) throw new HttpError(400, 'Choose a social account.');
          return json(res, { ids: store.scanKnownPostIds(platform, account, query.get('collectionId')) });
        }
        if (path === '/api/extension/status' && req.method === 'GET') return json(res, { ok: true, name: store.get('name'), device: d.name });
        if (path === '/api/extension/runs' && req.method === 'POST') {
          const input = await body(req); return json(res, { runId: store.startRun(d.id, input.platform, input.account, input.mode, input.collectionId) });
        }
        const missingPath = path.match(/^\/api\/extension\/runs\/([a-f0-9]+)\/missing$/);
        if (localMode && missingPath) {
          const run = store.run(missingPath[1], d.id);
          if (!run || run.status !== 'running' || run.mode !== 'deep' || run.platform !== 'x' || !run.account) throw new HttpError(409, 'An active manual X deep scan is required.');
          if (req.method === 'GET') {
            const candidates = store.missingFromRun(run);
            return json(res, { posts: candidates.slice(0, 25), remaining: Math.max(0, candidates.length - 25) });
          }
          if (req.method === 'POST') {
            const input = await body(req), post = canonicalPost(input.url);
            if (post.platform !== 'x') throw new HttpError(400, 'Choose an X post.');
            const observed = store.db.prepare(`SELECT 1 FROM sync_discoveries WHERE platform='x' AND account=? AND external_id=? AND last_seen_run=?`).get(run.account, post.externalId, run.id);
            if (observed) throw new HttpError(409, 'This post was found in the current saved list.');
            let removed = false;
            if (input.observations !== undefined) {
              if (!Array.isArray(input.observations) || input.observations.length !== 2 || input.observations.some(o =>
                o?.state !== 'unsaved' || o?.externalId !== post.externalId || typeof o.account !== 'string' || o.account.toLowerCase() !== run.account.toLowerCase())) throw new HttpError(400, 'Two explicit, account-matched unsaved observations are required.');
              removed = store.removeSourceSave(post.url, run.account);
            }
            store.set(`unsave-attempt:${run.account.toLowerCase()}:${post.url}`, String(Date.now()));
            return json(res, { removed });
          }
        }
        const match = path.match(/^\/api\/extension\/runs\/([a-f0-9]+)(\/finish)?$/);
        if (match && req.method === 'POST') {
          const run = store.run(match[1], d.id);
          if (!run) throw new HttpError(404, 'Sync not found.');
          if (run.status !== 'running') throw new HttpError(409, 'This sync has already finished.');
          const input = await body(req);
          if (match[2]) { store.finishRun(run.id, input.status, input.message); return json(res, { ok: true }); }
          if (!Array.isArray(input.posts) || input.posts.length > 200) throw new HttpError(400, 'Send at most 200 posts per batch.');
          const result = store.importPosts(input.posts.map(p => p && typeof p === 'object' ? ({
            platform: run.platform, url: p.url, title: p.title, text: p.text, author: p.author, authorName: p.authorName,
            bookmarkTitle: p.bookmarkTitle, folders: p.folders, savedAt: p.savedAt,
            thumbnail: p.thumbnail, media: p.media, kind: p.kind, publishedAt: p.publishedAt, sourceAccount: run.account
          }) : p));
          if (input.details === true) for (const post of input.posts) { try { store.set(`detail:${canonicalPost(post.url).url}`, String(Date.now())); } catch { /* Invalid rows were rejected above. */ } }
          if (input.details !== true) store.recordDiscoveries(run, input.posts);
          if (input.detailFailed) {
            const canonical = canonicalPost(input.detailFailed);
            if (canonical.platform !== run.platform) throw new HttpError(400, 'Wrong detail source.');
            store.set(`detail-attempt:${canonical.url}`, String(Date.now()));
          }
          store.recordRun(run.id, result); return json(res, result);
        }
        throw new HttpError(404, 'Extension endpoint not found.');
      }
      if (path.startsWith('/api/')) {
        session(req);
        const unsaveAck=path.match(/^\/api\/unsave\/([a-f0-9]+)\/ack$/);
        if(localMode && unsaveAck && req.method==='POST'){await body(req);return json(res,unsaves.acknowledge(unsaveAck[1]));}
        const unsavePost = path.match(/^\/api\/posts\/(\d+)\/unsave(?:\/(prepare))?$/);
        if(localMode && unsavePost && req.method==='POST') {const input=await body(req);return json(res,unsavePost[2]?unsaves.prepare(Number(unsavePost[1])):unsaves.confirm(Number(unsavePost[1]),input));}
        if (path === '/api/mcp' && req.method === 'GET') return json(res, mcp.status());
        if (path === '/api/mcp' && req.method === 'POST') return json(res, await mcp.setEnabled((await body(req)).enabled));
        if (path === '/api/topics' && req.method === 'GET') return json(res, { topics: topicCatalog(store.db) });
        if (localMode && path === '/api/library' && req.method === 'POST') {
          const input = await body(req); store.set('name', text(input.name, 50) || 'My saves');
          return json(res, { name: store.get('name') });
        }
        if (localMode && path === '/api/sync' && req.method === 'GET') return json(res, {...sync.status(),unsave:unsaves.status()});
        if (localMode && path === '/api/sync/setup' && req.method === 'POST') return json(res, sync.requestSetup((await body(req)).kind));
        if (localMode && path === '/api/sync/accounts' && req.method === 'POST') return json(res, sync.requestAccountScan());
        if (localMode && path === '/api/sync' && req.method === 'POST') { const input = await body(req); return json(res, { job: enqueueSync(input.targets, input.xAccount, input.mode, input.instagramAccount, input.instagramCollectionId) }); }
        if (localMode && path === '/api/sync/stop' && req.method === 'POST') return json(res, { job: sync.cancel() });
        if (path === '/api/instagram-save-list' && req.method === 'POST') return json(res, { instagramSaveLists: setInstagramSaveList(store, await body(req)) });
        if (path === '/api/posts' && req.method === 'GET') {
          const scope = new URL(req.url, appOrigin).searchParams.get('scope') || 'active';
          return json(res, { embedOrigin: preview.origin, posts: store.posts({ scope }), runs: store.runs(), instagramCollections: store.instagramCollections(), instagramSaveLists: instagramSaveLists(store), topics: topicCatalog(store.db) });
        }
        if (path === '/api/posts/import' && req.method === 'POST') {
          const input = await body(req);
          if (!Array.isArray(input.posts) || (!input.posts.length && !input.topics?.length) || input.posts.length > 200) throw new HttpError(400, 'Import up to 200 posts at a time, or a topic catalog.');
          if (input.topics !== undefined) importTopicCatalog(store.db, input.topics);
          return json(res, store.importPosts(input.posts));
        }
        const collectionPost = path.match(/^\/api\/posts\/(\d+)\/collections$/);
        if (collectionPost && req.method === 'POST') {
          const input = await body(req);
          const result = topicLibrary.addToCollection({ postId: Number(collectionPost[1]), topicId: input.topicId, name: input.name }, { allowArchived: true });
          return json(res, { ...result, topics: topicCatalog(store.db) });
        }
        const post = path.match(/^\/api\/posts\/(\d+)$/);
        if (post && req.method === 'PATCH') return json(res, store.updatePost(Number(post[1]), await body(req)));
        if (post && req.method === 'DELETE') { store.deletePost(Number(post[1])); return json(res, { ok: true }); }
        if (path === '/api/pairing' && req.method === 'POST') return json(res, { code: store.pairCode(), expiresIn: 300 });
        if (path === '/api/devices' && req.method === 'GET') return json(res, { devices: store.devices() });
        const dev = path.match(/^\/api\/devices\/([a-f0-9]+)$/);
        if (dev && req.method === 'DELETE') { store.revoke(dev[1]); return json(res, { ok: true }); }
        if (path === '/api/export' && req.method === 'GET') {
          res.setHeader('Content-Disposition', 'attachment; filename="savextension-backup.json"');
          return json(res, { version: 2, exportedAt: new Date().toISOString(), posts: store.posts({ scope: 'all' }), instagramCollections: store.instagramCollections(), topics: topicCatalog(store.db, { all: true }) });
        }
        throw new HttpError(404, 'Endpoint not found.');
      }
      if (!['GET', 'HEAD'].includes(req.method)) throw new HttpError(405, 'Method not allowed.');
      let file;
      try { file = resolve(publicDir, `.${decodeURIComponent(path === '/' ? '/index.html' : path)}`); } catch { throw new HttpError(400, 'Invalid path.'); }
      if (!file.startsWith(`${publicDir}${sep}`)) throw new HttpError(403, 'Forbidden.');
      try {
        const contents = await readFile(file); res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' }); res.end(req.method === 'HEAD' ? undefined : contents);
      } catch { throw new HttpError(404, 'File not found.'); }
    } catch (e) {
      if (!res.headersSent) json(res, { error: e instanceof HttpError ? e.message : 'Something went wrong. Check your server terminal.' }, e.status || 500);
      else res.end();
      if (!(e instanceof HttpError)) console.error(e);
    }
  });
  server.on('listening', () => preview.start());
  server.on('close', () => { preview.close(); void mcp.close(); });
  return { server, store, setupCode, mcp };
}
