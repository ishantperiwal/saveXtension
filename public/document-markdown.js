// The editor writes Markdown in two ways that read badly to a person or an AI, so documents are stored as plain Markdown
// and turned back into the editor's form on opening:
// - A picture on its own line keeps its size where the description belongs, as ![0.50](src "description").
//   Stored, it's ![description](src), with "size 0.5" as its title only when it was resized.
// - An empty line is written as <br />. Stored, it's just a blank line.
// Code blocks are left exactly as they are.
const PICTURE = /^!\[((?:[^\]\\]|\\.)*)\]\((\S+?)(?:\s+"((?:[^"\\]|\\.)*)")?\)$/;
const unescape = value => value.replace(/\\(.)/g, '$1');
function lines(markdown, change) {
  const out = []; let fence = null;
  for (const line of markdown.split('\n')) {
    const marker = line.match(/^\s*(`{3,}|~{3,})/)?.[1];
    if (fence) { out.push(line); if (marker && marker[0] === fence[0] && marker.length >= fence.length) fence = null; continue; }
    if (marker) { fence = marker; out.push(line); continue; }
    const next = change(line);
    // Outside code, one blank line between blocks is all Markdown needs.
    if (next === null || (next.trim() === '' && (!out.length || out.at(-1).trim() === ''))) continue;
    out.push(next);
  }
  return out.join('\n').replace(/\s+$/, '\n').replace(/^\n$/, '');
}
export function storedMarkdown(markdown) {
  return lines(markdown, line => {
    if (line.trim() === '<br />') return null;
    const picture = line.trim().match(PICTURE);
    if (!picture || !/^\d+(\.\d+)?$/.test(picture[1])) return line;
    const ratio = Number(picture[1]), description = unescape(picture[3] || '').replace(/[[\]\\]/g, '\\$&');
    return `![${description}](${picture[2]}${ratio > 0 && Math.abs(ratio - 1) > 0.005 ? ` "size ${+ratio.toFixed(2)}"` : ''})`;
  });
}
export function editorMarkdown(markdown) {
  return lines(markdown, line => {
    const picture = line.trim().match(PICTURE);
    if (!picture) return line;
    const size = picture[3]?.match(/^size (\d+(?:\.\d+)?)$/), description = unescape(picture[1]).replace(/["\\]/g, '\\$&');
    return `![${size ? Number(size[1]).toFixed(2) : '1.00'}](${picture[2]}${description ? ` "${description}"` : ''})`;
  });
}
