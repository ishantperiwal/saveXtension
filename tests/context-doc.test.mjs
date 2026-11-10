import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// The code map in the new-chat context is only useful while it points at real code.
test('every file and anchor in the new-chat context still exists', async () => {
  const doc = await readFile(new URL('../docs/NEW_CHAT_CONTEXT.md', import.meta.url), 'utf8');
  const rows = [...doc.matchAll(/^\|[^|]+\|\s*`([^`]+)`\s*\|\s*`([^`]+)`\s*\|$/gm)];
  assert.ok(rows.length > 40, `found only ${rows.length} rows, so the table format may have changed`);
  const missing = [];
  for (const [, file, anchor] of rows) {
    const source = await readFile(new URL(`../${file}`, import.meta.url), 'utf8').catch(() => null);
    if (source === null) missing.push(`${file} does not exist`);
    else if (!source.includes(anchor)) missing.push(`${file} no longer contains ${anchor}`);
  }
  assert.deepEqual(missing, []);
});
