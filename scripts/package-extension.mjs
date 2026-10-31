import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const extension = resolve(root, 'extension');
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
}
function pngChunk(name, data) {
  const type = Buffer.from(name), length = Buffer.alloc(4), crc = Buffer.alloc(4); length.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(Buffer.concat([type, data])));
  return Buffer.concat([length, type, data, crc]);
}
// Render the simple bookmark mark locally; no remote assets or image dependencies.
function icon(size) {
  const pixels = Buffer.alloc((size * 4 + 1) * size);
  const polygon = [[.35, .25], [.65, .25], [.65, .78], [.5, .66], [.35, .78]];
  function distance(px, py, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1], t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(px - a[0] - t * dx, py - a[1] - t * dy);
  }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let alpha = 0, white = 0;
    for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) {
      const px = (x + (sx + .5) / 4) / size, py = (y + (sy + .5) / 4) / size;
      const cx = Math.max(.24, Math.min(.76, px)), cy = Math.max(.24, Math.min(.76, py));
      if (Math.hypot(px - cx, py - cy) < .22) alpha++;
      if (polygon.some((a, i) => distance(px, py, a, polygon[(i + 1) % polygon.length]) < .022)) white++;
    }
    const i = y * (size * 4 + 1) + x * 4 + 1, t = white / 16;
    pixels[i] = Math.round(222 + (255 - 222) * t); pixels[i + 1] = Math.round(93 + (255 - 93) * t); pixels[i + 2] = Math.round(59 + (255 - 59) * t); pixels[i + 3] = Math.round(alpha / 16 * 255);
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), pngChunk('IHDR', ihdr), pngChunk('IDAT', deflateSync(pixels)), pngChunk('IEND', Buffer.alloc(0))]);
}
await mkdir(resolve(extension, 'icons'), { recursive: true });
for (const size of [16, 48, 128]) await writeFile(resolve(extension, `icons/icon${size}.png`), icon(size));
async function files(dir, prefix = '') {
  const output = [];
  for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name.startsWith('.')) continue;
    if (entry.isDirectory()) output.push(...await files(resolve(dir, entry.name), `${prefix}${entry.name}/`));
    else output.push({ name: `extension/${prefix}${entry.name}`, data: await readFile(resolve(dir, entry.name)) });
  }
  return output;
}
const entries = await files(extension), local = [], central = []; let offset = 0;
for (const entry of entries) {
  const name = Buffer.from(entry.name), data = entry.data, crc = crc32(data);
  const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x21, 12); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(name.length, 26);
  const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x21, 14); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(offset, 42);
  local.push(lh, name, data); central.push(ch, name); offset += lh.length + name.length + data.length;
}
const cd = Buffer.concat(central), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
const zip = Buffer.concat([...local, cd, end]);
await mkdir(resolve(root, 'dist'), { recursive: true });
await writeFile(resolve(root, 'dist/extension.zip'), zip); await writeFile(resolve(root, 'public/extension.zip'), zip);
console.log(`Extension packaged: dist/extension.zip (${entries.length} files)`);
