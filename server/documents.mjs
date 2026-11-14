import { randomUUID, createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { HttpError, updatedTime } from './domain.mjs';

// Documents are the person's own pages, written in Markdown: lists, tables, images, links, anything.
// A link to a saved post is just its address, and the app opens it in the post panel. They never come from a sync.
export const TITLE_LIMIT = 120, DESCRIPTION_LIMIT = 600, BODY_LIMIT = 500000, IMAGE_LIMIT = 15 * 1024 * 1024;
export function initializeDocuments(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS documents (id TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`);
  // What the document is for and what belongs in it (user's decision: required to create one). An AI adds only what fits it.
  if (!db.prepare('PRAGMA table_info(documents)').all().some(c => c.name === 'description')) db.exec("ALTER TABLE documents ADD COLUMN description TEXT NOT NULL DEFAULT ''");
}
const view = row => row && { id: row.id, title: row.title, description: row.description, body: row.body, createdAt: row.created_at, updatedAt: row.updated_at };
const cleanTitle = value => {
  const title = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  if (!title) throw new HttpError(400, 'Give the document a name.');
  if (title.length > TITLE_LIMIT) throw new HttpError(400, `Keep the name under ${TITLE_LIMIT} characters.`);
  return title;
};
const cleanBody = value => {
  if (typeof value !== 'string') throw new HttpError(400, 'Send the document as text.');
  if (value.length > BODY_LIMIT) throw new HttpError(413, 'That’s more than a document can hold.');
  return value;
};
const cleanDescription = value => {
  const description = typeof value === 'string' ? value.replace(/[ \t]+/g, ' ').trim() : '';
  if (!description) throw new HttpError(400, 'Say what this document is for and what belongs in it.');
  if (description.length > DESCRIPTION_LIMIT) throw new HttpError(400, `Keep the description under ${DESCRIPTION_LIMIT} characters.`);
  return description;
};
// Only the start of each heading, so a list stays small for an AI deciding which document to read.
const outline = body => body.split('\n').filter(line => /^#{1,3}\s/.test(line)).map(line => line.replace(/\s+$/, '')).slice(0, 30);

export class Documents {
  constructor(db) { this.db = db; initializeDocuments(db); }
  list({ outlines = false } = {}) {
    return this.db.prepare('SELECT * FROM documents ORDER BY updated_at DESC').all().map(row => ({ id: row.id, title: row.title, description: row.description, createdAt: row.created_at, updatedAt: row.updated_at, characters: row.body.length, ...(outlines ? { headings: outline(row.body) } : {}) }));
  }
  get(id) {
    const doc = view(this.db.prepare('SELECT * FROM documents WHERE id=?').get(String(id)));
    if (!doc) throw new HttpError(404, 'That document isn’t in your library.');
    return doc;
  }
  create({ title, description, body = '', id = randomUUID() }) {
    const now = new Date().toISOString();
    this.db.prepare('INSERT INTO documents(id,title,description,body,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(id, cleanTitle(title), cleanDescription(description), cleanBody(body), now, now);
    return this.get(id);
  }
  // expectedUpdatedAt stops a save from overwriting a newer version, such as an AI's edit made while the page was open.
  save(id, { title, description, body, expectedUpdatedAt }) {
    const current = this.get(id);
    if (expectedUpdatedAt !== undefined && expectedUpdatedAt !== current.updatedAt) throw new HttpError(409, 'This document changed somewhere else. Reload it first.');
    const next = { title: title === undefined ? current.title : cleanTitle(title), description: description === undefined ? current.description : cleanDescription(description), body: body === undefined ? current.body : cleanBody(body) };
    if (next.title === current.title && next.description === current.description && next.body === current.body) return current;
    this.db.prepare('UPDATE documents SET title=?,description=?,body=?,updated_at=? WHERE id=?').run(next.title, next.description, next.body, updatedTime(current.updatedAt), current.id);
    return this.get(id);
  }
  delete(id) {
    const doc = this.get(id);
    this.db.prepare('DELETE FROM documents WHERE id=?').run(doc.id);
    // Its undo entries go too, so an undo can't bring back a document that was deleted on purpose.
    for (const row of this.db.prepare("SELECT id,changes FROM mcp_changes WHERE changes LIKE ?").all(`%document:${doc.id}%`)) {
      const changes = JSON.parse(row.changes).filter(change => change.key !== `document:${doc.id}`);
      if (!changes.length) this.db.prepare('DELETE FROM mcp_changes WHERE id=?').run(row.id);
      else this.db.prepare('UPDATE mcp_changes SET changes=? WHERE id=?').run(JSON.stringify(changes), row.id);
    }
  }
  // An AI's edit: add to the end, swap exact pieces of text, or rename. Replacing everything is allowed but only when asked.
  edit(id, { expectedUpdatedAt, title, description, append, replacements = [], body }) {
    const current = this.get(id);
    if (expectedUpdatedAt !== current.updatedAt) throw new HttpError(409, 'The document changed since you read it. Read it again, then edit.');
    let next = body === undefined ? current.body : cleanBody(body);
    for (const { find, replace } of replacements) {
      const at = next.indexOf(find);
      if (!find || at < 0) throw new HttpError(400, `This text isn’t in the document: ${JSON.stringify(find.slice(0, 80))}`);
      if (next.indexOf(find, at + 1) >= 0) throw new HttpError(400, `This text appears more than once, so include more around it: ${JSON.stringify(find.slice(0, 80))}`);
      next = next.slice(0, at) + replace + next.slice(at + find.length);
    }
    if (append) next = next.replace(/\s+$/, '') + (next.trim() ? '\n\n' : '') + append.replace(/^\s+/, '');
    return this.save(id, { title, description, body: next });
  }
}

// Pictures pasted or dropped into a document. The Markdown keeps a short relative address, images/<hash>.<ext>,
// which the editor shows from /api/documents/images/. The same picture added twice is stored once.
const SIGNATURES = [['png', [0x89, 0x50, 0x4e, 0x47]], ['jpg', [0xff, 0xd8, 0xff]], ['gif', [0x47, 0x49, 0x46, 0x38]], ['webp', [0x52, 0x49, 0x46, 0x46], [8, [0x57, 0x45, 0x42, 0x50]]]];
export const IMAGE_TYPES = { png: 'image/png', jpg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };
const kind = bytes => SIGNATURES.find(([, start, later]) => start.every((b, i) => bytes[i] === b) && (!later || later[1].every((b, i) => bytes[later[0] + i] === b)))?.[0];
export function documentImages(dir) {
  return {
    async add(base64) {
      if (!dir) throw new HttpError(503, 'Pictures can’t be stored here.');
      const bytes = Buffer.from(typeof base64 === 'string' ? base64 : '', 'base64');
      if (!bytes.length) throw new HttpError(400, 'Send a picture.');
      if (bytes.length > IMAGE_LIMIT) throw new HttpError(413, 'That picture is over 15 MB.');
      const ext = kind(bytes);
      if (!ext) throw new HttpError(415, 'Use a PNG, JPEG, GIF or WebP picture.');
      const name = `${createHash('sha256').update(bytes).digest('hex').slice(0, 32)}.${ext}`;
      await mkdir(dir, { recursive: true, mode: 0o700 });
      await writeFile(join(dir, name), bytes, { flag: 'wx' }).catch(error => { if (error.code !== 'EEXIST') throw error; });
      return { src: `images/${name}` };
    },
    async read(name) {
      if (!dir || !/^[a-f0-9]{32}\.(png|jpg|gif|webp)$/.test(name)) throw new HttpError(404, 'Picture not found.');
      try { return { bytes: await readFile(join(dir, name)), type: IMAGE_TYPES[name.split('.').pop()] }; } catch { throw new HttpError(404, 'Picture not found.'); }
    },
  };
}

// Fonts a document can show its font names in. An AI adds one by giving a direct link to a font file (from Google Fonts, Fontshare
// or a foundry's free download); it's fetched once through the same guarded downloader as website previews and kept locally,
// so documents stay offline afterwards. In the Markdown a name is written [Satoshi](font:Satoshi). Fonts installed on the Mac
// need nothing added. Files are checked by their first bytes, and fonts.json lists which family each file is.
const FONT_KINDS = [['woff2', 'wOF2'], ['woff', 'wOFF'], ['otf', 'OTTO'], ['ttf', '\0\x01\0\0'], ['ttf', 'true']];
export const FONT_TYPES = { woff2: 'font/woff2', woff: 'font/woff', otf: 'font/otf', ttf: 'font/ttf' };
export const cleanFamily = value => {
  const family = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  if (!family || family.length > 80 || !/^[\p{L}\p{N} ._'&+-]+$/u.test(family)) throw new HttpError(400, 'Give the font family name as it’s written, like "Satoshi" or "Clash Display".');
  return family;
};
export function documentFonts(dir, { download } = {}) {
  const index = join(dir || '', 'fonts.json');
  const read = async () => { try { return JSON.parse(await readFile(index, 'utf8')); } catch { return []; } };
  return {
    async list() { return (await read()).map(({ family, file, source }) => ({ family, url: `/api/documents/fonts/${file}`, source })); },
    async add({ family, url }) {
      if (!dir || !download) throw new HttpError(503, 'Fonts can’t be stored here.');
      family = cleanFamily(family);
      let fetched;
      try { fetched = await download(url, 'font'); } catch (error) { throw /Unsupported/.test(error.message) ? new HttpError(415, 'That link isn’t a font file. Give a direct link to a .woff2, .woff, .ttf or .otf file.') : new HttpError(422, `Couldn’t download that font: ${error.message}`); }
      const head = fetched.bytes.subarray(0, 4).toString('latin1'), ext = FONT_KINDS.find(([, start]) => head === start)?.[0];
      if (!ext) throw new HttpError(415, 'That link isn’t a font file. Give a direct link to a .woff2, .woff, .ttf or .otf file.');
      const file = `${createHash('sha256').update(fetched.bytes).digest('hex').slice(0, 32)}.${ext}`;
      await mkdir(dir, { recursive: true, mode: 0o700 });
      await writeFile(join(dir, file), fetched.bytes, { flag: 'wx' }).catch(error => { if (error.code !== 'EEXIST') throw error; });
      const fonts = (await read()).filter(f => f.family.toLowerCase() !== family.toLowerCase());
      fonts.push({ family, file, source: new URL(fetched.url).hostname, addedAt: new Date().toISOString() });
      await writeFile(index, JSON.stringify(fonts, null, 2));
      return { family, file, bytes: fetched.bytes.length, source: new URL(fetched.url).hostname, markdown: `[${family}](font:${encodeURIComponent(family)})` };
    },
    async read(name) {
      if (!dir || !/^[a-f0-9]{32}\.(woff2|woff|otf|ttf)$/.test(name)) throw new HttpError(404, 'Font not found.');
      try { return { bytes: await readFile(join(dir, name)), type: FONT_TYPES[name.split('.').pop()] }; } catch { throw new HttpError(404, 'Font not found.'); }
    },
  };
}
