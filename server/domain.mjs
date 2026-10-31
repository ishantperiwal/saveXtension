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
  const canonical = canonicalPost(input.url);
  const caption = text(input.text, 20000);
  const title = text(input.title, 180);
  return {
    ...canonical, text: caption, title, author: text(input.author, 100),
    authorName: text(input.authorName, 120), thumbnail: imageUrl(input.thumbnail),
    kind: ['image', 'video', 'carousel', 'text'].includes(input.kind) ? input.kind : canonical.platform === 'instagram' ? 'image' : 'text',
    tags: tags(input.tags), topics: topicsFor(`${title} ${caption}`),
    sourceAccount: text(input.sourceAccount, 100), accounts: Array.isArray(input.accounts) ? input.accounts.map(a => text(a, 100)).filter(Boolean).slice(0, 50) : [],
    notes: text(input.notes, 10000), favorite: input.favorite === true, archived: input.archived === true,
    savedAt: Number.isFinite(Date.parse(input.savedAt)) ? new Date(input.savedAt).toISOString() : null,
    publishedAt: Number.isFinite(Date.parse(input.publishedAt)) ? new Date(input.publishedAt).toISOString() : null
  };
}
