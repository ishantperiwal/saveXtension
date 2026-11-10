// The page's side of search by meaning. It's only an addition: if anything here fails, word search carries on as normal.
const host = url => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } };
// The model reads about a thousand characters well, so longer posts are split and a post scores as its best part.
// Each part overlaps the last so nothing is lost at a join. Notes and topics come first because they say the most.
const PART = 1000, OVERLAP = 150;
export function meaningParts(post, { description = true } = {}) {
  const text = [post.bookmarkTitle, post.title, post.notes, description ? post.imageDescription : '', (post.topics || []).join(', '), post.authorName, post.author, post.platform === 'chrome' ? host(post.url) : '', (post.folders || []).join(' '), post.text].map(value => (value || '').trim()).filter(Boolean).join('\n');
  const parts = [];
  for (let start = 0; start < text.length;) {
    let end = Math.min(start + PART, text.length);
    if (end < text.length) { const gap = text.slice(start + PART - OVERLAP, end).search(/\s\S*$/); if (gap >= 0) end = start + PART - OVERLAP + gap; }
    parts.push(text.slice(start, end));
    if (end === text.length) break;
    start = end - OVERLAP;
  }
  return parts;
}
function textKey(text) {
  let a = 0xdeadbeef, b = 0x41c6ce57;
  for (let index = 0; index < text.length; index++) { const code = text.charCodeAt(index); a = Math.imul(a ^ code, 2654435761); b = Math.imul(b ^ code, 1597334677); }
  return `${(a >>> 0).toString(36)}-${(b >>> 0).toString(36)}-${text.length}`;
}
export function createMeaningSearch({ onResults }) {
  let worker = null, last = '', source = null, rankId = 0;
  const ranking = new Map();
  const stop = () => { worker?.terminate(); worker = null; last = ''; source = null; for (const resolve of ranking.values()) resolve(null); ranking.clear(); };
  return {
    get running() { return !!worker; },
    start() {
      if (worker) return;
      try { worker = new Worker('/meaning-worker.js', { type: 'module' }); } catch { worker = null; return; }
      worker.onerror = stop;
      worker.onmessage = ({ data }) => {
        if (data.type === 'ranked') { ranking.get(data.id)?.(data); ranking.delete(data.id); }
        else if (data.type === 'results') onResults(data.query, new Map(data.matches));
        else if (data.type === 'indexed' && last) worker.postMessage({ type: 'search', query: last });
        else if (data.type === 'failed') { console.error('Search by meaning stopped:', data.error); stop(); }
      };
    },
    // Called with the saves the library shows, so hidden ones are never read.
    index(token, posts) {
      if (!worker || source === token) return;
      source = token;
      worker.postMessage({ type: 'index', items: posts.map(post => ({ id: post.id, parts: meaningParts(post).map(text => ({ key: textKey(text), text })) })).filter(item => item.parts.length) });
    },
    // Every post, closest to the query first. complete says if all of them have been read yet.
    rank(query) {
      if (!worker) return Promise.resolve(null);
      return new Promise(resolve => {
        const id = ++rankId; ranking.set(id, resolve);
        worker.postMessage({ type: 'rank', id, query });
        setTimeout(() => { if (ranking.delete(id)) resolve(null); }, 15000);
      });
    },
    search(query) {
      const text = query.trim(); last = text.length >= 3 ? text : '';
      if (worker && last) worker.postMessage({ type: 'search', query: last });
    },
    stop,
  };
}
