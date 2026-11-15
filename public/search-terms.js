// How a typed search is read, shared by the app's word search and MCP's so they find the same saves.
// Every word must appear, in any order. Words inside double quotes stay together as one phrase.
export function searchTerms(query) {
  const terms = [];
  for (const [, phrase, word] of String(query || '').toLowerCase().matchAll(/["“”]([^"“”]*)["“”]?|(\S+)/g)) {
    const term = (phrase ?? word).trim().replace(/\s+/g, ' ');
    if (term && !terms.includes(term)) terms.push(term);
  }
  return terms;
}
// A social post's address only says which site it's on, so "status" or "reel" would match nearly everything.
// It's searched for Chrome bookmarks, where the address means something, or when the search looks like a link.
export const searchesAddress = (platform, term) => platform === 'chrome' || term.includes('/');
