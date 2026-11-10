import { HttpError } from './domain.mjs';
import { ensureTopic, topicKey } from './topics.mjs';
import { readStructured, runPlanTool, signedOutMessage } from './ai-search.mjs';

// Two separate jobs, on purpose. The model that plans sees only the request and the topic list, never a post, so text
// in a post can't steer what happens to topics. Finding saves goes through AI search, where a model can only score IDs.
const PLAN_PROMPT = `You organize the topics in a person's library of saved posts. You get their request and their topics, and you reply with the steps that carry out the request, in order. You can't see the saves themselves.

Steps:
- create_topic: make a topic called name, inside parent if they ask for that.
- rename_topic: give topic the new name.
- move_topic: put topic inside parent, or at the top level when parent is null. A topic inside another can't hold topics itself.
- merge_topics: merge the topics in sources into topic.
- delete_topic: delete topic. Its saves stay in the library.
- add_saves: find saves that match find and add them to topic. Set within to a topic's name to only look inside it.
- move_saves: find saves in the within topic that match find, add them to topic and take them out of within.
- remove_saves: find saves in topic that match find and take them out of topic.

find is a plain description of what the saves are about, as specific as the request. A step that adds to a new topic needs a create_topic step before it. When asked to choose a name, use a short clear one of 2 to 4 words. Use existing topic names exactly as listed. Do only what was asked.

Saves can never be deleted. If asked to delete saves, or if the request isn't about organizing topics, reply with no steps and say why in message. Otherwise message is empty. Set every field a step doesn't use to null.`;
const TYPES = ['create_topic', 'rename_topic', 'move_topic', 'merge_topics', 'delete_topic', 'add_saves', 'move_saves', 'remove_saves'];
const text = { type: ['string', 'null'] };
const PLAN_SCHEMA = JSON.stringify({ type: 'object', additionalProperties: false, properties: { message: { type: 'string' }, steps: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { type: { type: 'string', enum: TYPES }, topic: text, name: text, parent: text, sources: { type: ['array', 'null'], items: { type: 'string' } }, find: text, within: text }, required: ['type', 'topic', 'name', 'parent', 'sources', 'find', 'within'] } } }, required: ['message', 'steps'] });
const FINDS = new Set(['add_saves', 'move_saves', 'remove_saves']);
// Each of these reads the whole library, about the same as one AI search.
const LIBRARY_READS = 5, MAX_STEPS = 40, POLL = 400, RETRY_AFTER = 1500, ASSIGN_AT_ONCE = 200;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const saves = count => `${count} ${count === 1 ? 'save' : 'saves'}`;

export function planPrompt(request, topics) {
  return `Request: ${JSON.stringify(request)}\n\nTopics: ${JSON.stringify(topics.map(topic => ({ name: topic.name, saves: topic.count, ...(topic.parent ? { inside: topic.parent } : {}), ...(topic.description ? { description: topic.description } : {}) })))}`;
}
// Only well-formed steps get through, and anything unclear stops the whole request.
export function readPlan(output) {
  const plan = readStructured(output);
  if (!Array.isArray(plan?.steps)) throw new Error('no steps in the reply');
  if (plan.steps.some(step => !TYPES.includes(step?.type))) throw new Error('a step in the reply isn’t one this can do');
  return { message: String(plan.message || '').trim(), steps: plan.steps };
}

export function aiOrganize({ search, topics, visibleIds, run = runPlanTool }) {
  const db = topics.db;
  let job = null, lastId = 0;
  const find = name => db.prepare('SELECT t.id,t.name FROM topics t LEFT JOIN topic_aliases a ON a.topic_id=t.id WHERE t.name_key=? OR a.name_key=?').get(topicKey(String(name || '')), topicKey(String(name || '')));
  const need = name => { const topic = find(name); if (!topic) throw new HttpError(409, `The AI named a topic that doesn’t exist: ${String(name).slice(0, 80)}`); return topic; };
  const members = id => { const visible = new Set(visibleIds()); return db.prepare('SELECT post_id FROM post_topics WHERE topic_id=?').all(id).map(row => row.post_id).filter(post => visible.has(post)); };
  const view = current => current && { id: current.id, request: current.request, state: current.state, phase: current.phase, step: current.step, steps: current.steps, find: current.find, done: current.done, total: current.total, askImages: current.askImages, searchJob: current.searchJob, error: current.error, note: current.note, message: current.message, summary: current.summary, changeId: current.changeId, open: current.open, model: current.model };

  async function plan(current, tool) {
    // The topics the app shows, with the counts it shows. A topic whose saves are all in unticked collections still appears there, at 0.
    const catalog = topics.catalog().map(topic => ({ ...topic, count: members(topic.id).length })), names = new Map(catalog.map(topic => [topic.id, topic.name]));
    const prompt = planPrompt(current.request, catalog.map(topic => ({ ...topic, parent: names.get(topic.parentId) || '' })));
    for (let attempt = 1; ; attempt++) {
      try { return readPlan(await run(tool, { system: PLAN_PROMPT, schema: PLAN_SCHEMA, prompt }, current.controller.signal)); }
      catch (failure) {
        if (current.state !== 'running') throw failure;
        console.error(`AI organize: planning failed on try ${attempt} with ${tool.name}: ${failure.message}`);
        if (failure.message === 'signed-out') throw new HttpError(409, signedOutMessage(tool));
        if (attempt === 2) throw new HttpError(409, `${tool.name} couldn’t work out what to do. Try again.`);
        await wait(RETRY_AFTER);
      }
    }
  }
  // Runs one find through AI search and waits for it, passing on its question about reading a lot of images.
  async function findSaves(current, query, postIds) {
    if (!postIds.length) return [];
    const started = search.start(query, postIds);
    current.searchJob = started.id;
    for (;;) {
      if (current.state !== 'running') { search.cancel(); throw new Error('stopped'); }
      const seen = search.job(started.id);
      if (!seen || seen.state === 'cancelled') throw new Error('stopped');
      Object.assign(current, { done: seen.phase === 'text' ? seen.done : seen.total, total: seen.total, askImages: seen.askImages || 0 });
      if (seen.state === 'failed') throw new HttpError(409, seen.error || 'The AI couldn’t read your saves. Try again.');
      if (seen.state === 'done') { if (seen.note) current.note = seen.note; return seen.matches.map(([id]) => id); }
      await wait(POLL);
    }
  }
  // Everything happens in one change, so one Undo takes it all back, and a step that fails changes nothing.
  function apply(steps, found) {
    const summary = []; let open = '';
    const assign = (postIds, topicId, mode) => { for (let index = 0; index < postIds.length; index += ASSIGN_AT_ONCE) topics.assign({ postIds: postIds.slice(index, index + ASSIGN_AT_ONCE), topicIds: [topicId], mode }); };
    const { changeId } = topics.batch('ai_organize', () => {
      for (const step of steps) {
        if (step.type === 'create_topic') {
          const existed = find(step.name), id = ensureTopic(db, step.name, true);
          if (step.parent) topics.move({ topicId: id, parentId: need(step.parent).id });
          if (!existed) summary.push(`Created ${step.name}`);
          open ||= step.name;
        } else if (step.type === 'rename_topic') {
          const topic = need(step.topic); topics.update({ topicId: topic.id, name: step.name }); summary.push(`Renamed ${topic.name} to ${step.name}`); open ||= step.name;
        } else if (step.type === 'move_topic') {
          const topic = need(step.topic), parent = step.parent ? need(step.parent) : null;
          topics.move({ topicId: topic.id, parentId: parent?.id ?? null }); summary.push(parent ? `Moved ${topic.name} into ${parent.name}` : `Moved ${topic.name} to the top level`);
        } else if (step.type === 'merge_topics') {
          const target = need(step.topic), sources = (step.sources || []).map(need);
          topics.merge({ sourceIds: sources.map(source => source.id), targetId: target.id }); summary.push(`Merged ${sources.map(source => source.name).join(', ')} into ${target.name}`); open ||= target.name;
        } else if (step.type === 'delete_topic') {
          const topic = need(step.topic); topics.delete({ topicId: topic.id }, { removeMemberships: true }); summary.push(`Deleted the topic ${topic.name}. Its saves are still in your library`);
        } else {
          const topic = need(step.topic), ids = found.get(step) || [];
          if (step.type === 'add_saves') { assign(ids, topic.id, 'add'); summary.push(`Added ${saves(ids.length)} to ${topic.name}`); open ||= topic.name; }
          if (step.type === 'remove_saves') { assign(ids, topic.id, 'remove'); summary.push(`Took ${saves(ids.length)} out of ${topic.name}`); open ||= topic.name; }
          if (step.type === 'move_saves') { const from = need(step.within); assign(ids, topic.id, 'add'); assign(ids, from.id, 'remove'); summary.push(`Moved ${saves(ids.length)} from ${from.name} to ${topic.name}`); open ||= topic.name; }
        }
      }
      return {};
    });
    return { summary, open, changeId };
  }
  async function work(current, tool) {
    const { steps, message } = await plan(current, tool);
    if (current.state !== 'running') return;
    current.message = message;
    if (!steps.length) { current.state = 'done'; return; }
    if (steps.length > MAX_STEPS) throw new HttpError(409, 'That’s too many changes for one request. Ask for part of it first.');
    const finding = steps.filter(step => FINDS.has(step.type));
    for (const step of finding) if (!String(step.find || '').trim() || !step.topic) throw new HttpError(409, 'The AI’s answer wasn’t clear. Try wording it differently.');
    const reads = new Set(finding.filter(step => step.type === 'add_saves' && !step.within).map(step => step.find)).size;
    if (reads > LIBRARY_READS) throw new HttpError(409, `That would read your whole library ${reads} times. Ask for ${LIBRARY_READS} or fewer topics at a time.`);
    current.phase = 'finding'; current.steps = finding.length;
    const found = new Map(), asked = new Map(), all = visibleIds();
    for (const step of finding) {
      current.step++; current.find = step.find; current.done = 0; current.total = 0;
      // A topic made earlier in this request has nothing in it yet.
      const scope = step.type === 'remove_saves' ? (find(step.topic) ? members(find(step.topic).id) : []) : step.within ? members(need(step.within).id) : all;
      const key = `${step.find}\n${[...scope].join()}`;
      if (!asked.has(key)) asked.set(key, await findSaves(current, step.find, scope));
      found.set(step, asked.get(key));
    }
    if (current.state !== 'running') return;
    // A new topic that nothing fits would only be an empty folder, so it isn't made.
    const empty = new Set(steps.filter(step => step.type === 'create_topic' && !find(step.name) && finding.some(other => topicKey(String(other.topic)) === topicKey(String(step.name)))).filter(step => finding.filter(other => topicKey(String(other.topic)) === topicKey(String(step.name))).every(other => !found.get(other).length)).map(step => topicKey(String(step.name))));
    const kept = steps.filter(step => !(step.type === 'create_topic' && empty.has(topicKey(String(step.name)))) && !(FINDS.has(step.type) && empty.has(topicKey(String(step.topic)))) && !(FINDS.has(step.type) && !found.get(step).length));
    current.phase = 'applying';
    if (!kept.length) { current.state = 'done'; current.message = 'No saves matched that, so nothing changed.'; return; }
    Object.assign(current, apply(kept, found));
    if (empty.size) current.note = [current.note, 'A topic nothing matched wasn’t created.'].filter(Boolean).join(' ');
    current.state = 'done';
  }
  return {
    start(request) {
      const tool = search.tool(); if (!tool) throw new HttpError(409, 'Choose an AI tool in Settings first.');
      if (job?.state === 'running') throw new HttpError(409, 'Still working on your last request.');
      const current = job = { id: ++lastId, request, state: 'running', phase: 'planning', step: 0, steps: 0, find: '', done: 0, total: 0, askImages: 0, searchJob: 0, error: '', note: '', message: '', summary: [], changeId: null, open: '', model: tool.model, controller: new AbortController() };
      void work(current, tool).catch(failure => {
        if (current.state !== 'running') return;
        if (failure.message === 'stopped') { current.state = 'cancelled'; return; }
        current.state = 'failed'; current.error = failure instanceof HttpError ? failure.message : 'That didn’t work, and nothing was changed. Try again.';
        if (!(failure instanceof HttpError)) console.error(`AI organize: ${failure.message}`);
      });
      return view(current);
    },
    current: () => view(job),
    cancel() { if (job?.state === 'running') { job.state = 'cancelled'; job.controller.abort(); search.cancel(); } return view(job); },
    undo(changeId) { const result = topics.undo(changeId, { everything: true }); if (job?.changeId === changeId) job.changeId = null; return result; },
  };
}
