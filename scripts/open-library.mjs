import { spawn, execFile } from 'node:child_process';
import { openSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from 'node:process';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
try { loadEnvFile(); } catch (e) { if (e.code !== 'ENOENT') throw e; }
const url = process.env.APP_ORIGIN || `http://localhost:${process.env.PORT || 3210}`;
async function running() {
  try { const res = await fetch(`${url}/api/session`, { signal: AbortSignal.timeout(1000) }); const value = await res.json(); return res.ok && typeof value.localMode === 'boolean'; } catch { return false; }
}
if (!(await running())) {
  await import('./package-extension.mjs');
  const dataDir = resolve(process.env.DATA_DIR || 'data'); mkdirSync(dataDir, { recursive: true });
  const log = openSync(resolve(dataDir, 'server.log'), 'a', 0o600);
  const child = spawn(process.execPath, ['server/index.mjs'], { cwd: root, detached: true, stdio: ['ignore', log, log], env: process.env });
  child.unref();
  let started = false;
  for (let i = 0; i < 30; i++) { if (await running()) { started = true; break; } await new Promise(r => setTimeout(r, 300)); }
  if (!started) throw new Error(`Couldn’t start the library. Check ${resolve(dataDir, 'server.log')}.`);
}
console.log(`Your library is ready: ${url}`);
if (!process.argv.includes('--no-open')) execFile('open', [url], error => { if (error) console.error(`Open ${url} in your browser.`); });
