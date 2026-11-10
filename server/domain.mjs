import { createHash } from 'node:crypto';
import { isPinterestHost, PINTEREST_PIN } from '../public/pinterest-host.js';

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
    // Collection grids put the creator first; /stories/<account>/ is never a post.
    const match = url.pathname.match(/^\/(?:(?!stories\/)[\w.]+\/)?(p|reel|reels|tv)\/([A-Za-z0-9_-]+)(?:\/|$)/);
    if (match) return { platform: 'instagram', externalId: match[2], url: `https://www.instagram.com/${match[1] === 'reels' ? 'reel' : match[1]}/${match[2]}/` };
  }
  if (isPinterestHost(host)) {
    const match = url.pathname.match(PINTEREST_PIN);
    if (match) return { platform: 'pinterest', externalId: match[1], url: `https://www.pinterest.com/pin/${match[1]}/` };
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
// A Pinterest board, or "unorganized" for the saves on the boards page that belong to no board.
export function cleanPinterestBoard(account, input) {
  if (typeof account !== 'string' || !/^@[\w.-]{1,100}$/.test(account) || !input || typeof input !== 'object') throw new HttpError(400, 'Invalid Pinterest board.');
  let url; try { url = new URL(input.url); } catch { throw new HttpError(400, 'Invalid Pinterest board link.'); }
  const match = url.pathname.match(/^\/([\w.-]+)\/(_boards|[^/_][^/]*)\/?$/), name = text(input.name, 200);
  if (url.protocol !== 'https:' || !isPinterestHost(url.hostname) || url.username || url.password || url.port || !match || `@${match[1]}`.toLowerCase() !== account.toLowerCase() || !name) throw new HttpError(400, 'Invalid Pinterest board link or account.');
  const externalId = match[2] === '_boards' ? 'unorganized' : match[2];
  if (input.externalId !== undefined && String(input.externalId) !== externalId) throw new HttpError(400, 'Pinterest board ID does not match its link.');
  return { platform: 'pinterest', account, externalId, name, url: `https://www.pinterest.com/${match[1]}/${match[2]}/` };
}
export const cleanCollection = (platform, account, input) => platform === 'pinterest' ? cleanPinterestBoard(account, input) : cleanInstagramCollection(account, input);
export function noteText(value) { return typeof value === 'string' ? value.slice(0, 10000) : ''; }
export function updatedTime(previous) { return new Date(Math.max(Date.now(), (Date.parse(previous) || 0) + 1)).toISOString(); }
export function tags(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(t => text(t, 40).toLowerCase()).filter(Boolean))].slice(0, 16);
}

// X and Instagram profile pictures: a person's face, never what the post shows.
const PROFILE_PICTURE = /^\/profile_images\/|\/t51\.2885-19\//;

// Instagram's page summary puts its counts and the date before the caption, as in
// 448 likes, 12 comments - someone on July 26, 2026: "The caption". Only the caption is worth keeping.
const INSTAGRAM_SUMMARY = /^(?:[\d.,]+[KkMm]?\s+likes?(?:,\s*)?)?(?:[\d.,]+[KkMm]?\s+comments?)?\s*[-–—]\s*[\w.]+\s+on\s+[^:"\n]{3,40}?(?::\s*|\.?\s*$)/i;
export function instagramCaption(value) {
  if (!/^[\d.,]+[KkMm]?\s+(?:likes?|comments?)\b/i.test(value)) return value;
  const prefix = value.match(INSTAGRAM_SUMMARY)?.[0];
  if (!prefix) return value;
  const rest = value.slice(prefix.length).trim(), quoted = rest.match(/^["“]([\s\S]*)["”]\.?$/);
  return quoted ? quoted[1].trim() : rest;
}

export function imageUrl(value) {
  try {
    const u = new URL(value);
    const host = u.hostname.toLowerCase();
    if (u.protocol !== 'https:' || u.username || u.password || u.port || PROFILE_PICTURE.test(u.pathname)) return '';
    if (host === 'pbs.twimg.com' || host === 'i.pinimg.com' || host.endsWith('.cdninstagram.com') || host.endsWith('.fbcdn.net')) return u.href;
  } catch { /* Missing or unsupported thumbnail. */ }
  return '';
}

// Broad on purpose: a new library should read at a glance. Anything more specific is the
// person's own topics to make.
const TOPICS = [
  ['Tech', /\b(ai|artificial intelligence|llm|gpt|claude|gemini|openai|anthropic|model|inference|agent|code|coding|developer|programming|github|javascript|typescript|python|cursor|codex|react|api|tool|tools|app|apps|software|workflow|productivity|automation|extension|research|paper|benchmark|arxiv|dataset)\b/i],
  ['Design', /\b(design|designer|figma|typography|font|fonts|ui|ux|interface|animation|motion|logo|branding|illustration)\b/i],
  ['Business', /\b(startup|startups|business|founder|founders|marketing|revenue|saas|finance|investing|career|careers|sales)\b/i],
  ['Lifestyle', /\b(recipe|recipes|food|cooking|travel|fashion|outfit|outfits|fitness|workout|skincare|beauty|wellness|decor|interiors|gardening)\b/i]
];
export function topicsFor(content) { return TOPICS.filter(([, regex]) => regex.test(content)).map(([name]) => name); }

export function cleanPost(input) {
  if (!input || typeof input !== 'object') throw new HttpError(400, 'Invalid post.');
  const canonical = input.platform === 'chrome' ? canonicalBookmark(input.url) : canonicalPost(input.url);
  const caption = canonical.platform === 'instagram' ? instagramCaption(text(input.text, 20000)) : text(input.text, 20000);
  const title = text(input.title, 180);
  return {
    ...canonical, text: caption, title, author: text(input.author, 100),
    bookmarkTitle: canonical.platform === 'chrome' ? text(input.bookmarkTitle, 1000) : '',
    folders: canonical.platform === 'chrome' && Array.isArray(input.folders) ? [...new Set(input.folders.map(f => text(f, 2000)).filter(Boolean))].slice(0, 200) : [],
    authorName: text(input.authorName, 120), thumbnail: imageUrl(input.thumbnail),
    media: [...new Set((Array.isArray(input.media) ? input.media : []).map(imageUrl).filter(Boolean))].slice(0, 20),
    kindSure: input.kindSure === true,
    kind: ['image', 'video', 'carousel', 'text'].includes(input.kind) ? input.kind : ['instagram', 'pinterest'].includes(canonical.platform) ? 'image' : 'text',
    tags: tags(input.tags), topics: typeof input.topicsCurated === 'boolean' && Array.isArray(input.topics) ? [...new Set(input.topics.filter(t => typeof t === 'string' && t.trim() && t.trim().length <= 80 && !/[\p{Cc}]/u.test(t)).map(t => t.normalize('NFKC').trim()))].slice(0, 50) : topicsFor(`${title} ${caption} ${text(input.bookmarkTitle, 1000)} ${(Array.isArray(input.folders) ? input.folders : []).join(" ")}`),
    sourceAccount: text(input.sourceAccount, 100), accounts: Array.isArray(input.accounts) ? input.accounts.map(a => text(a, 100)).filter(Boolean).slice(0, 50) : [],
    notes: noteText(input.notes), favorite: input.favorite === true, archived: input.archived === true,
    savedAt: Number.isFinite(Date.parse(input.savedAt)) ? new Date(input.savedAt).toISOString() : null,
    addedAt: input.addedAt === null ? null : Number.isFinite(Date.parse(input.addedAt)) ? new Date(input.addedAt).toISOString() : undefined,
    publishedAt: Number.isFinite(Date.parse(input.publishedAt)) ? new Date(input.publishedAt).toISOString() : null
  };
}


export function canonicalBookmark(input) {
  let url;
  try { url = new URL(String(input)); } catch { throw new HttpError(400, 'Invalid bookmark URL.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.href.length > 12000) throw new HttpError(400, 'Only HTTP and HTTPS bookmarks are supported.');
  return { platform: 'chrome', externalId: createHash('sha256').update(url.href).digest('hex'), url: url.href };
}
