import { loadEnvFile } from 'node:process';
import { resolve } from 'node:path';
import { createApp } from './app.mjs';

try { loadEnvFile(); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 3210);
const origin = process.env.APP_ORIGIN || `http://localhost:${port}`;
const secure = process.env.COOKIE_SECURE === 'true';
if (new URL(origin).protocol === 'https:' && !secure) throw new Error('Set COOKIE_SECURE=true when APP_ORIGIN uses HTTPS.');
const localMode = process.env.AUTH_REQUIRED !== 'true';
if (localMode && !['127.0.0.1', 'localhost', '::1'].includes(host)) throw new Error('Local mode must listen on loopback.');
const app = createApp({ dataPath: resolve(process.env.DATA_DIR || 'data', 'savextension.sqlite'), origin, secure, localMode });
app.server.listen(port, host, () => {
  console.log(`\n  saveXtension → ${origin}\n`);
  if (!localMode && !app.store.get('password')) console.log(`  First-time setup code: ${app.setupCode}\n  Enter this code in the web app, then choose your password.\n`);
});
function shutdown() { app.server.close(() => { app.store.close(); process.exit(0); }); }
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
