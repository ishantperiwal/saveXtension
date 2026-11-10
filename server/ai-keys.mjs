import { readFileSync, rmSync, writeFileSync } from 'node:fs';

// API keys for AI services, encrypted by the operating system's keychain and kept out of the library, so they never reach a backup or export in the clear.
// vault is { encrypt(text) -> Buffer, decrypt(Buffer) -> text }.
export function aiKeys({ file, vault }) {
  const read = () => { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return {}; } };
  const write = keys => { if (Object.keys(keys).length) writeFileSync(file, JSON.stringify(keys), { mode: 0o600 }); else rmSync(file, { force: true }); };
  return {
    has: id => !!read()[id],
    get(id) { const saved = read()[id]; if (!saved) return ''; try { return vault.decrypt(Buffer.from(saved, 'base64')); } catch { return ''; } },
    set(id, key) { write({ ...read(), [id]: vault.encrypt(key).toString('base64') }); },
    remove(id) { const { [id]: gone, ...rest } = read(); write(rest); },
  };
}
