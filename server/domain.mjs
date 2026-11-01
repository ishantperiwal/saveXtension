import { createHash } from 'node:crypto';

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export function canonicalPost(input) {
  let url;
  try { url = new URL(String(input)); } catch { throw new HttpError(400, 'Enter a valid Instagram or X post URL.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port) throw new HttpError(400, 'Unsupported post URL.');
  const host = url.hostname.toLowerCase().replace(/^www\./, '').replace(/^mobile\./, '');
  if (['x.com', 'twitter.com'].includes(host)) {
    const match = url.pathname.match(/^\/(?:[\w]+|i\/web|i)\/status\/(\d+)(?:\/|$)/);
    if (match) return { platform: 'x', externalId: match[1], url: `https://x.com/i/status/${match[1]}` };
  }
  if (host === 'instagram.com') {
    const match = url.pathname.match(/^\/(p|reel|reels|tv)\/([A-Za-z0-9_-]+)(?:\/|$)/);
    if (match) return { platform: 'instagram', externalId: match[2], url: `https://www.instagram.com/${match[1] === 'reels' ? 'reel' : match[1]}/${match[2]}/` };
  }
  throw new HttpError(400, 'Use a link to an Instagram post/Reel or an X post.');
}

export function text(value, max = 2000) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
export function cleanInstagramCollection(account, input) {
  if (typeof account !== 'string' || !/^@[\w.]{1,100}$/.test(account) || !input || typeof input !== 'object') throw new HttpError(400, 'Invalid Instagram collection.');
  let url; try { url = new URL(input.url); } catch { throw new HttpError(400, 'Invalid Instagram collection link.'); }
  const match = url.pathname.match(/^\/([\w.]+)\/saved\/(?:[^/]+\/)?(\d+)\/?$/);
  const name = text(input.name, 200);
  if (url.protocol !== 'https:' || !['instagram.com', 'www.instagram.com'].includes(url.hostname) || url.username || url.password || url.port || !match || `@${match[1]}`.toLowerCase() !== account.toLowerCase() || !name) throw new HttpError(400, 'Invalid Instagram collection link or account.');
  if (input.externalId !== undefined && String(input.externalId) !== match[2]) throw new HttpError(400, 'Instagram collection ID does not match its link.');
  return { account, externalId: match[2], name, url: `https://www.instagram.com${url.pathname.replace(/\/?$/, '/')}` };
}
export function noteText(value) { return typeof value === 'string' ? value.slice(0, 10000) : ''; }
export function updatedTime(previous) { return new Date(Math.max(Date.now(), (Date.parse(previous) || 0) + 1)).toISOString(); }
export function tags(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(t => text(t, 40).toLowerCase()).filter(Boolean))].slice(0, 16);
}

export function imageUrl(value) {
  try {
    const u = new URL(value);
    const host = u.hostname.toLowerCase();
    if (u.protocol !== 'https:' || u.username || u.password || u.port) return '';
    if (host === 'pbs.twimg.com' || host.endsWith('.cdninstagram.com') || host.endsWith('.fbcdn.net')) return u.href;
  } catch { /* Missing or unsupported thumbnail. */ }
  return '';
}

const TOPICS = [
  ['AI & models', /\b(ai|artificial intelligence|llm|gpt|claude|gemini|openai|anthropic|model|inference|agent)\b/i],
  ['Coding', /\b(code|coding|developer|programming|github|javascript|typescript|python|cursor|codex|react|api)\b/i],
  ['Design', /\b(design|figma|typography|ui|ux|interface|animation|motion)\b/i],
  ['Tools', /\b(tool|tools|app|apps|workflow|productivity|automation|extension)\b/i],
  ['Research', /\b(research|paper|study|benchmark|arxiv|dataset)\b/i],
  ['Learning', /\b(tutorial|learn|guide|course|how to|explained|tips)\b/i],
  ['Business', /\b(startup|business|founder|marketing|revenue|launch|saas)\b/i]
];
export function topicsFor(content) { return TOPICS.filter(([, regex]) => regex.test(content)).map(([name]) => name); }

export function cleanPost(input) {
  if (!input || typeof input !== 'object') throw new HttpError(400, 'Invalid post.');
  const canonical = input.platform === 'chrome' ? canonicalBookmark(input.url) : canonicalPost(input.url);
  const caption = text(input.text, 20000);
  const title = text(input.title, 180);
  return {
    ...canonical, text: caption, title, author: text(input.author, 100),
    bookmarkTitle: canonical.platform === 'chrome' ? text(input.bookmarkTitle, 1000) : '',
    folders: canonical.platform === 'chrome' && Array.isArray(input.folders) ? [...new Set(input.folders.map(f => text(f, 2000)).filter(Boolean))].slice(0, 200) : [],
    authorName: text(input.authorName, 120), thumbnail: imageUrl(input.thumbnail),
    media: [...new Set((Array.isArray(input.media) ? input.media : []).map(imageUrl).filter(Boolean))].slice(0, 20),
    kind: ['image', 'video', 'carousel', 'text'].includes(input.kind) ? input.kind : canonical.platform === 'instagram' ? 'image' : 'text',
    tags: tags(input.tags), topics: typeof input.topicsCurated === 'boolean' && Array.isArray(input.topics) ? [...new Set(input.topics.filter(t => typeof t === 'string' && t.trim() && t.trim().length <= 80 && !/[\p{Cc}]/u.test(t)).map(t => t.normalize('NFKC').trim()))].slice(0, 50) : topicsFor(`${title} ${caption} ${text(input.bookmarkTitle, 1000)} ${(Array.isArray(input.folders) ? input.folders : []).join(" ")}`),
    sourceAccount: text(input.sourceAccount, 100), accounts: Array.isArray(input.accounts) ? input.accounts.map(a => text(a, 100)).filter(Boolean).slice(0, 50) : [],
    notes: noteText(input.notes), favorite: input.favorite === true, archived: input.archived === true,
    savedAt: Number.isFinite(Date.parse(input.savedAt)) ? new Date(input.savedAt).toISOString() : null,
    publishedAt: Number.isFinite(Date.parse(input.publishedAt)) ? new Date(input.publishedAt).toISOString() : null
  };
}


export function canonicalBookmark(input) {
  let url;
  try { url = new URL(String(input)); } catch { throw new HttpError(400, 'Invalid bookmark URL.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.href.length > 12000) throw new HttpError(400, 'Only HTTP and HTTPS bookmarks are supported.');
  return { platform: 'chrome', externalId: createHash('sha256').update(url.href).digest('hex'), url: url.href };
}
