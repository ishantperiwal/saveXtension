import { loadEnvFile } from 'node:process';
import { createInterface } from 'node:readline/promises';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { Store } from '../server/store.mjs';
try { loadEnvFile(); } catch (e) { if (e.code !== 'ENOENT') throw e; }
const path = resolve(process.env.DATA_DIR || 'data', 'savextension.sqlite');
if (!existsSync(path)) { console.error('No library database found at the configured DATA_DIR.'); process.exit(1); }
if (!process.stdin.isTTY) { console.error('Run this command interactively with the server stopped.'); process.exit(1); }
const prompt = createInterface({ input: process.stdin, output: process.stdout });
const answer = await prompt.question('Stop the server first. Reset the password and revoke all browser sessions/devices? Type RESET to continue: ');
prompt.close();
if (answer !== 'RESET') { console.log('Cancelled.'); process.exit(0); }
const store = new Store(path);
try {
  store.db.exec("BEGIN IMMEDIATE; DELETE FROM settings WHERE key='password'; DELETE FROM sessions; DELETE FROM devices; DELETE FROM pairing; COMMIT;");
  console.log('Password reset. Saves preserved. Start the server and use its new setup code.');
} finally { store.close(); }
