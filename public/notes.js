const DRAFT_KEY = 'savex-note-drafts';

// One write at a time per save. Drafts survive a closed dialog, reload or outage.
export function createNoteAutosave({ save, storage, delay = 350, retryDelay = 2000, onState = () => {}, onSaved = () => {} }) {
  const drafts = new Map();
  const keyFor = post => `${post.id}:${post.url}`;
  try {
    for (const draft of JSON.parse(storage.getItem(DRAFT_KEY) || '[]')) {
      if (Number.isInteger(draft.id) && typeof draft.url === 'string' && typeof draft.notes === 'string') {
        drafts.set(keyFor(draft), { id: draft.id, url: draft.url, notes: draft.notes.slice(0, 10000), revision: 1, timer: null, flight: null, attempts: 0, verified: false });
      }
    }
  } catch { /* A missing or invalid draft file must not prevent opening the library. */ }
  function persist() {
    try { storage.setItem(DRAFT_KEY, JSON.stringify([...drafts.values()].map(({ id, url, notes }) => ({ id, url, notes })))); }
    catch { /* Network saving remains available when browser storage is full. */ }
  }
  function schedule(draft, wait) {
    clearTimeout(draft.timer);
    draft.timer = setTimeout(() => { void flush(draft); }, wait);
  }
  async function flush(post) {
    const key = keyFor(post), draft = drafts.get(key);
    if (!draft?.verified) return;
    clearTimeout(draft.timer); draft.timer = null;
    if (draft.flight) return draft.flight;
    draft.flight = (async () => {
      while (drafts.get(key) === draft) {
        const notes = draft.notes, revision = draft.revision;
        onState(draft, 'saving');
        let saved;
        try { saved = await save(draft.id, notes); }
        catch (error) {
          draft.attempts++;
          onState(draft, 'error', error);
          schedule(draft, Math.min(15000, retryDelay * 2 ** Math.min(draft.attempts - 1, 3)));
          return;
        }
        draft.attempts = 0;
        if (draft.revision === revision) {
          drafts.delete(key); clearTimeout(draft.timer); persist();
          onSaved(saved); onState(draft, 'saved');
          return;
        }
        onSaved(saved); // The overlay below retains edits made during this request.
      }
    })();
    try { await draft.flight; } finally { draft.flight = null; }
  }
  return {
    value(post) { return drafts.get(keyFor(post))?.notes ?? post.notes ?? ''; },
    overlay(posts) { return posts.map(p => drafts.has(keyFor(p)) ? { ...p, notes: drafts.get(keyFor(p)).notes } : p); },
    edit(post, notes) {
      const key = keyFor(post), draft = drafts.get(key) || { id: post.id, url: post.url, revision: 0, timer: null, flight: null, attempts: 0 };
      draft.notes = notes.slice(0, 10000); draft.revision++; draft.verified = true;
      drafts.set(key, draft); persist(); onState(draft, 'pending'); schedule(draft, delay);
    },
    flush,
    flushAll() { return Promise.allSettled([...drafts.values()].map(flush)); },
    resume(posts) {
      const matching = posts.filter(p => drafts.has(keyFor(p)));
      for (const post of matching) drafts.get(keyFor(post)).verified = true;
      return Promise.allSettled(matching.map(flush));
    },
    forget(post) { const key = keyFor(post), draft = drafts.get(key); if (draft) clearTimeout(draft.timer); drafts.delete(key); persist(); },
    dispose() { for (const draft of drafts.values()) clearTimeout(draft.timer); }
  };
}
