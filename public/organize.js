import { dotLoader } from './dot-loader.js';
// Organize on the Topics page: the button grows into one box where you type what you want, and the AI that's on does it to your topics.
const PLACEHOLDER = 'Describe how you want your saves organized into topics. For example, make a topic for using AI in After Effects.';
// Many changes of one kind read as one line, and the full list stays one click away.
const KINDS = [
  [/^Deleted the topic /, count => `Deleted ${count} topics. Their saves are still in your library`],
  [/^Created /, count => `Created ${count} topics`],
  [/^Renamed /, count => `Renamed ${count} topics`],
  [/^Merged /, count => `Did ${count} topic merges`],
  [/^Moved \d+ saves? from /, count => `Moved saves between topics ${count} times`],
  [/^Moved /, count => `Moved ${count} topics`],
  [/^Added /, count => `Added saves to ${count} topics`],
  [/^Took /, count => `Took saves out of ${count} topics`],
];
export function shortSummary(lines) {
  const kind = line => KINDS.find(([pattern]) => pattern.test(line));
  const counts = new Map();
  for (const line of lines) { const found = kind(line); if (found) counts.set(found, (counts.get(found) || 0) + 1); }
  const done = new Set(), short = [];
  for (const line of lines) {
    const found = kind(line);
    if (!found || counts.get(found) < 3) short.push(line);
    else if (!done.has(found)) { done.add(found); short.push(found[1](counts.get(found))); }
  }
  return short;
}
export function organizeTopics({ modal, showModal, api, toast, esc, icon, model, refresh, openTopic, askToScanImages }) {
  const showing = () => modal.open && !!modal.querySelector('.organize-dialog');
  const show = body => showModal(`<div class="organize-dialog"><h2 class="sr-only">Organize topics</h2>${body}</div>`);
  const progress = job => job.phase === 'planning' ? 'Working out what to do…' : job.phase === 'applying' ? 'Making the changes…' : `Reading your saves${job.steps > 1 ? ` (${job.step} of ${job.steps})` : ''}${job.total ? `: ${Math.round(job.done / job.total * 100)}%` : '…'}`;
  // The button says how a run is going, because it carries on after the box closes.
  // A result stays until someone presses Okay on it, however often the box is closed, and no new request can start before that.
  let pending = null;
  const ACKNOWLEDGED = 'savex-organize-acknowledged';
  const jobKey = job => `${job.id}:${job.request}`;
  const mark = value => { if (value) document.documentElement.dataset.organize = value; else delete document.documentElement.dataset.organize; };
  function acknowledge(job) { pending = null; mark(''); try { sessionStorage.setItem(ACKNOWLEDGED, jobKey(job)); } catch { /* Only matters across a reload. */ } }
  function hold(job) { pending = job; mark(job.state === 'failed' ? 'failed' : 'done'); }
  const ended = job => { if (job.state === 'failed') didNotFinish(job); else finished(job); };
  function didNotFinish(job) {
    show(`<p class="organize-request-shown">${esc(job.request)}</p><p class="organize-error" role="alert">${esc(job.error)}</p><div class="button-row"><button class="primary" type="button" data-organize-okay>Okay</button></div>`);
    const okay = modal.querySelector('[data-organize-okay]'); okay.focus();
    okay.onclick = () => { acknowledge(job); ask(job.request); };
  }
  function ask(request = '') {
    show(`<label class="sr-only" for="organize-request">What should change?</label><textarea id="organize-request" class="organize-request" rows="3" maxlength="500" placeholder="${esc(PLACEHOLDER)}">${esc(request)}</textarea><div class="organize-foot"><button class="primary" type="button" data-organize-start>${icon('sparkle')} Organize with ${esc(model())}</button></div>`);
    const input = modal.querySelector('#organize-request'), start = modal.querySelector('[data-organize-start]');
    input.focus();
    const go = async () => {
      const request = input.value.trim(); if (request.length < 3) { input.focus(); return; }
      start.disabled = true;
      try { const { job } = await api('/organize', { method: 'POST', body: { request } }); mark('running'); running(job); void follow(job.id); }
      catch (error) { start.disabled = false; toast(error.message, true, 'bottom-center'); }
    };
    start.onclick = go;
    input.onkeydown = event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); void go(); } };
  }
  function running(job) {
    show(`<p class="organize-request-shown">${esc(job.request)}</p><div class="organize-foot"><div class="organize-progress" role="status">${dotLoader('organize')}<span class="organize-progress-text">${esc(progress(job))}</span></div><button class="organize-stop" type="button" data-organize-stop>Stop</button></div>`);
    modal.querySelector('[data-organize-stop]').onclick = async event => { event.currentTarget.disabled = true; try { await api('/organize', { method: 'DELETE', body: {} }); } catch (error) { toast(error.message, true, 'bottom-center'); } };
  }
  function finished(job) {
    const list = items => items.map(line => `<li>${esc(line)}</li>`).join(''), short = shortSummary(job.summary);
    const all = short.length < job.summary.length ? `<details class="organize-all"><summary>Show all ${job.summary.length} changes</summary><ul class="organize-summary">${list(job.summary)}</ul></details>` : '';
    const lines = job.summary.length ? `<ul class="organize-summary">${list(short)}</ul>${all}` : `<p class="organize-message">${esc(job.message || 'Nothing needed changing.')}</p>`;
    if (job.undone) {
      show('<p class="organize-message">Undone. Your topics are back as they were.</p><div class="button-row"><button class="primary" type="button" data-organize-okay>Okay</button></div>');
    } else {
      show(`${lines}${job.note ? `<p class="fine-print">${esc(job.note)}</p>` : ''}<div class="button-row"><button class="primary" type="button" data-organize-okay>Okay</button>${job.open ? `<button class="secondary" type="button" data-organize-open>Open ${esc(job.open)}</button>` : ''}${job.changeId ? '<button class="secondary" type="button" data-organize-undo>Undo</button>' : ''}</div>`);
    }
    const okay = modal.querySelector('[data-organize-okay]'), open = modal.querySelector('[data-organize-open]'), undo = modal.querySelector('[data-organize-undo]');
    okay.focus();
    okay.onclick = () => { acknowledge(job); shrink(); };
    if (open) open.onclick = () => { acknowledge(job); modal.close(); openTopic(job.open); };
    if (undo) undo.onclick = async () => {
      undo.disabled = true;
      try { await api('/organize/undo', { method: 'POST', body: { changeId: job.changeId } }); job.undone = true; await refresh(); finished(job); }
      catch (error) { undo.disabled = false; toast(error.message, true, 'bottom-center'); }
    };
  }
  // The box opens from the button and goes back into it.
  const button = () => { const item = document.querySelector('.organize-button'); return item?.offsetParent ? item : null; };
  const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Real radii at both ends, so the corners change evenly with the size. A pill's huge radius would stay clamped, then snap at the end.
  const pill = rect => ({ left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px`, borderRadius: `${rect.height / 2}px`, boxShadow: '0 2px 10px #00000014' });
  const opened = rect => ({ left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px`, borderRadius: '20px', boxShadow: '0 18px 60px #00000033' });
  const MOTION = { duration: 440, easing: 'cubic-bezier(.45,.05,.15,1)' };
  function place() {
    const from = button()?.getBoundingClientRect(); if (!from) return null;
    const width = Math.min(480, innerWidth - 32);
    modal.style.setProperty('--organize-left', `${Math.max(16, Math.min(from.left, innerWidth - width - 16))}px`);
    // It sits at the bottom of the sidebar, so the box opens upwards from it.
    modal.style.setProperty('--organize-bottom', `${Math.max(16, innerHeight - from.bottom)}px`);
    return from;
  }
  function grow(from) {
    const content = modal.querySelector('.organize-dialog');
    if (!from || !content || still()) return;
    modal.dataset.settling = 'true';
    const to = modal.getBoundingClientRect();
    modal.animate([pill(from), opened(to)], MOTION).finished.catch(() => {}).finally(() => { delete modal.dataset.settling; });
    modal.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 440, easing: 'ease-out', pseudoElement: '::backdrop' });
    content.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 240, delay: 180, easing: 'ease-out', fill: 'backwards' });
  }
  let shrinking = false;
  function shrink() {
    if (shrinking) return;
    const to = button()?.getBoundingClientRect(), content = modal.querySelector('.organize-dialog');
    if (!to || !content || still()) { modal.close(); return; }
    shrinking = true; modal.dataset.settling = 'true';
    content.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 110, easing: 'ease-in', fill: 'forwards' });
    modal.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, easing: 'ease-in', fill: 'forwards', pseudoElement: '::backdrop' });
    modal.animate([opened(modal.getBoundingClientRect()), pill(to)], { ...MOTION, duration: 320, fill: 'forwards' }).finished.catch(() => {}).finally(() => { shrinking = false; delete modal.dataset.settling; modal.getAnimations({ subtree: true }).forEach(item => item.cancel()); modal.close(); });
  }
  modal.addEventListener('cancel', event => { if (showing()) { event.preventDefault(); shrink(); } });
  modal.addEventListener('click', event => {
    if (!showing() || event.target !== modal) return;
    const rect = modal.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) { event.stopImmediatePropagation(); shrink(); }
  }, true);
  let following = 0;
  async function follow(id) {
    following = id;
    let asked = false;
    while (following === id) {
      let job = null;
      try { ({ job } = await api('/organize')); } catch { /* Tried again below. */ }
      if (job?.id === id) {
        const stillHere = showing();
        if (job.state === 'running') {
          // It's the person's plan, so a lot of images are only read if they say so.
          if (job.askImages && !asked) {
            asked = true;
            const approve = await askToScanImages(job.askImages);
            try { await api('/ai-search/images', { method: 'POST', body: { job: job.searchJob, approve } }); } catch { /* It has moved on. */ }
            if (stillHere) running(job);
            continue;
          }
          if (!job.askImages) asked = false;
          const text = modal.querySelector('.organize-progress-text');
          if (stillHere && text) text.textContent = progress(job);
        } else {
          following = 0;
          if (job.state === 'done' && job.changeId) await refresh();
          if (job.state === 'cancelled') { acknowledge(job); if (showing()) ask(job.request); return; }
          hold(job);
          if (showing()) { ended(job); return; }
          if (job.state === 'failed') toast(job.error, true, 'bottom-center'); else toast(job.summary[0] || job.message || 'Done.');
          return;
        }
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  async function open() {
    let job = null;
    try { ({ job } = await api('/organize')); } catch { /* Open it anyway. */ }
    const from = place();
    if (job?.state === 'running') { mark('running'); running(job); if (following !== job.id) void follow(job.id); }
    else if (pending) ended(pending);
    else ask();
    grow(from);
  }
  // After a reload: pick a running job back up, or show the button's state for one that ended unseen.
  open.resume = async () => {
    if (following || pending) return;
    const { job } = await api('/organize');
    if (job?.state === 'running') { mark('running'); void follow(job.id); return; }
    let last = '';
    try { last = sessionStorage.getItem(ACKNOWLEDGED) || ''; } catch { /* Treated as not yet acknowledged. */ }
    if (job && ['done', 'failed'].includes(job.state) && jobKey(job) !== last) hold(job);
  };
  return open;
}
