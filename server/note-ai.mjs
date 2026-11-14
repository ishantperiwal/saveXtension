import { randomUUID } from 'node:crypto';
import { HttpError } from './domain.mjs';
import { readNote, runNoteTool, signedOutMessage } from './ai-search.mjs';

const REQUEST_LIMIT = 2000, NOTE_LIMIT = 10000;
// What the AI adds keeps only lines the note doesn't already have, and says nothing twice itself.
// Unless the request asks for a copy, it also leaves out lines taken straight from the post's own text, which sits beside the note,
// including a line that's only a link the post already shows. Lines are compared ignoring case, spacing, list markers and end punctuation.
// Very short lines, like a "Links:" heading, always stay.
const lineKey = line => line.toLowerCase().replace(/\s+/g, ' ').replace(/^[\s\-–—•*·>]+|^\d+[.)]\s*/g, '').replace(/[\s.,;:!?]+$/, '').trim();
const linkKey = link => link.toLowerCase().replace(/^https?:\/\/(www\.)?/, '').replace(/[\/.,;:!?)]+$/, '');
export const asksForCopy = request => /\b(links?|urls?|list|extract|copy|repos?|keep|save|verbatim|full text)\b/i.test(request);
export function withoutRepeats(before, note, postText = '') {
  const seen = new Set(`${before}\n${postText}`.split('\n').map(lineKey).filter(key => key.length >= 12));
  const links = new Set((postText.match(/https?:\/\/\S+|\b[\w-]+(\.[\w-]+)+\/\S+/gi) || []).map(linkKey));
  const kept = note.split('\n').filter(line => {
    const key = lineKey(line);
    if (/^\S+$/.test(key) && /[./]/.test(key) && links.has(linkKey(key))) return false;
    if (key.length < 12) return true;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
  return kept.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
// Someone asks for something on one post's note, and the AI inspects that post through tools tied to it.
// One at a time. The AI only returns text: this adds it below the note, or replaces the note if the person asked for a rewrite. Undo in the app puts it back.
export function noteAi({ store, tool, visiblePost, mcp, baseUrl, run = runNoteTool }) {
  let job = null, lastId = 0;
  const view = current => current && { id: current.id, post: current.post, request: current.request, state: current.state, step: current.step, error: current.error, notes: current.notes, before: current.before, updatedAt: current.updatedAt, model: current.model };
  async function work(current, chosen) {
    const url = `${baseUrl}/mcp/note/${current.token}`;
    try {
      const existing = store.post(current.post)?.notes || '';
      const { note, problem, replaces } = readNote(await run(chosen, url, `What I want in this note: ${JSON.stringify(current.request)}\n\nThe note so far: ${JSON.stringify(existing)}`, current.controller.signal, current.modelId, current.handler));
      if (current.state !== 'running') return;
      // An empty reply only clears the note if that's what the person asked for. Otherwise it means the AI came back with nothing.
      if (!note && (!replaces || problem || !/\b(delete|remove|clear|erase|wipe|empty)\b/i.test(current.request))) throw new HttpError(422, problem || 'The AI didn’t find anything to add.');
      if (!visiblePost(current.post)) throw new HttpError(404, 'That save isn’t in your library any more.');
      const post = store.post(current.post), before = post.notes || '';
      const added = withoutRepeats(replaces ? '' : before, note, replaces || asksForCopy(current.request) ? '' : [post.title, post.bookmarkTitle, post.text].filter(Boolean).join('\n'));
      if (!replaces && !added) throw new HttpError(422, 'That’s already in the post or its note.');
      const notes = replaces || !before ? added : `${before}\n\n${added}`;
      if (notes.length > NOTE_LIMIT) throw new HttpError(422, 'That’s more than a note can hold.');
      const saved = store.updatePost(current.post, { notes });
      Object.assign(current, { state: 'done', before, notes, updatedAt: saved.updatedAt });
    } catch (error) {
      if (current.state !== 'running') return;
      const signedOut = error.message === 'signed-out';
      if (!(error instanceof HttpError)) console.error(`Note AI: ${error.message}`);
      Object.assign(current, { state: 'failed', error: signedOut ? (chosen.usesKey ? signedOutMessage(chosen) : `Sign in to ${chosen.name} in Settings, then try again.`) : /out of credit/.test(error.message) ? `Your ${chosen.name} account is out of credit.` : error instanceof HttpError ? error.message : 'The AI couldn’t finish that. Try again.' });
    } finally {
      const handler = current.handler; current.handler = null; current.token = '';
      await handler?.close().catch(() => {});
    }
  }
  return {
    current: () => view(job),
    job: id => (job?.id === id ? view(job) : null),
    mcpFor: token => (job?.handler && job.token === token ? job.handler : null),
    start(post, request, model = null) {
      if (job?.state === 'running') throw new HttpError(409, 'Another note is still being filled. Wait for it, or cancel it.');
      request = typeof request === 'string' ? request.trim() : '';
      if (!request || request.length > REQUEST_LIMIT) throw new HttpError(400, 'Say what you want in this note.');
      if (!visiblePost(post)) throw new HttpError(404, 'That save isn’t in your library.');
      const chosen = tool();
      if (!chosen) throw new HttpError(409, 'Turn on Claude Code, Codex or DeepSeek in Settings first.');
      const current = { id: ++lastId, post, request, state: 'running', step: 'Starting', error: '', notes: '', before: '', model: model?.name || chosen.model, modelId: model?.id, token: randomUUID(), controller: new AbortController() };
      current.handler = mcp.forNote(post, step => { current.step = step; }, { imagesAsFiles: !!chosen.noteImagesAsFiles });
      job = current;
      current.finished = work(current, chosen);
      return view(current);
    },
    cancel() { if (job?.state === 'running') { job.state = 'cancelled'; job.controller.abort(); } return view(job); },
    close() { if (job?.state === 'running') job.controller.abort(); },
    idle: () => job?.finished,
  };
}
