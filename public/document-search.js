// Searching documents, shared by the app and MCP so both find the same sections (user's decision, 2026-11-18).
// A document is split at its headings, so a result points at the part that matched, and each document shows once,
// at its best section. Typed words match only the document's name and its headings, as whole words; a section's body is
// found by meaning, through the local model's scores (user's decision), since common words would match every long prompt.
// An exact name that's only in a body is left to AI search, which reads every section in full.
import { searchTerms } from './search-terms.js';

const FENCE = /^\s*(```|~~~)/, HEADING = /^#{1,3}\s+\S/;
const PICTURE = /!\[[^\]\n]*\]\((images\/[a-f0-9]{32}\.(?:png|jpg|gif|webp)(?:#[^)\s]*)?)/;

// Markdown as plain reading text, for matching and for the lines a card shows.
export function plainMarkdown(markdown) {
  return String(markdown || '')
    .replace(/^\s*(```|~~~).*$/gm, '')
    .replace(/!\[[^\]\n]*\]\([^)\n]*\)/g, ' ')
    .replace(/\[([^\]\n]*)\]\([^)\n]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/^\s*(?:[-*+]|\d+\.)\s+(?:\[[ xX]\]\s+)?/gm, '')
    .replace(/\*\*|__|~~|`/g, '')
    .replace(/^\s*\|?[\s:|-]+\|[\s:|-]*$/gm, '')
    .replace(/\s*\|\s*/g, ' · ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// The document's sections: what comes before the first heading, then one per heading (levels 1 to 3), never inside code.
// `nth` counts headings with the same text, so the page can find the right one again.
export function documentSections(body) {
  const sections = [], seen = new Map();
  let current = { heading: '', lines: [] }, fenced = false;
  const close = () => {
    const markdown = current.lines.join('\n');
    if (current.heading || markdown.trim()) {
      const heading = plainMarkdown(current.heading), nth = seen.get(heading) || 0;
      if (heading) seen.set(heading, nth + 1);
      sections.push({ index: sections.length, heading, nth, markdown, text: plainMarkdown(markdown), picture: markdown.match(PICTURE)?.[1] || '' });
    }
  };
  for (const line of String(body || '').split('\n')) {
    if (FENCE.test(line)) fenced = !fenced;
    if (!fenced && HEADING.test(line)) { close(); current = { heading: line.replace(/^#+\s+/, '').trim(), lines: [] }; }
    else current.lines.push(line);
  }
  close();
  return sections;
}

export const sectionKey = (documentId, index) => `doc:${documentId}:${index}`;
// A word on its own, not inside a longer one: "ai" finds "AI tools" but not "detail". An added s or es still counts.
const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const wordPattern = term => new RegExp(`(?<![\\p{L}\\p{N}_])${escape(term)}(?:e?s)?(?![\\p{L}\\p{N}_])`, 'giu');
export const hasWord = (text, term) => wordPattern(term).test(text);

// A few lines from the section around the first searched word, so the card shows why it matched.
export function sectionSnippet(text, terms, size = 260) {
  const flat = String(text || '').replace(/\s+/g, ' ').trim(), lower = flat.toLowerCase();
  const at = terms.map(term => lower.search(wordPattern(term))).filter(index => index >= 0).sort((a, b) => a - b)[0] ?? 0;
  let start = Math.max(0, at - 70);
  if (start) { const space = flat.indexOf(' ', start); start = space >= 0 && space < at ? space + 1 : start; }
  const end = Math.min(flat.length, start + size);
  return `${start ? '…' : ''}${flat.slice(start, end).trim()}${end < flat.length ? '…' : ''}`;
}

// The best section of each document for a search, most likely first. `scores` can hold search by meaning's and an AI's
// picks by section key: under 1 for the local model, over 100 for an AI, the same scale saves use.
export function searchDocuments(documents, query, { scores = null } = {}) {
  const terms = searchTerms(query), phrase = terms.length > 1 ? terms.join(' ') : '';
  if (!terms.length) return [];
  const results = [];
  for (const doc of documents || []) {
    const title = String(doc.title || ''), found = [];
    for (const section of documentSections(doc.body)) {
      const named = `${title} ${section.heading}`.replace(/\s+/g, ' ');
      const words = terms.every(term => hasWord(named, term)) ? phrase && hasWord(named, phrase) ? 2 : 1 : 0;
      const picked = scores?.get(sectionKey(doc.id, section.index)) || 0;
      if (!words && !picked) continue;
      found.push({ section, score: (words ? 1000 : 0) + (words === 2 ? 50 : 0) + picked });
    }
    if (!found.length) continue;
    found.sort((a, b) => b.score - a.score);
    const { section, score } = found[0];
    results.push({
      documentId: doc.id, title, icon: doc.icon || '', updatedAt: doc.updatedAt || '',
      section: section.index, heading: section.heading, nth: section.nth, picture: section.picture,
      snippet: sectionSnippet(section.text, terms), terms, score, more: found.length - 1,
    });
  }
  return results.sort((a, b) => b.score - a.score || String(b.updatedAt).localeCompare(String(a.updatedAt)));
}
