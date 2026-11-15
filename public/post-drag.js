// Dragging a post card by an empty part of it onto a topic adds the post to that topic.
// It drops on a topic in the sidebar or on a folder tile. Hovering the sidebar's Topics tab
// for a moment shows the topics in the sidebar for the rest of the drag, while the posts stay put.
// Buttons, links, text, pictures and the note keep their own behaviour.
const THRESHOLD = 6, EDGE = 48, SPRING = 350;
const NOT_EMPTY = 'button, a, input, textarea, select, label, video, iframe, img, [contenteditable], .card-note, .embed-capture-text, .embed-capture-author, .embed-capture-link, .tag-pill, .topic-drop-overlay';
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

export function enablePostDrag({ post, topic, add, enabled = () => true }) {
  let pending = null, drag = null, suppressClick = false, lastPointer = null, scrollFrame = 0, spring = null, peeked = null;
  // Only the sidebar changes: its topics panel shows in place of the accounts, without switching the app's view.
  function peek(show) {
    const accounts = document.querySelector('#sidebar-accounts-panel'), topics = document.querySelector('#sidebar-collections-panel');
    const tabs = [document.querySelector('#sidebar-accounts-tab'), document.querySelector('#sidebar-collections-tab')];
    if (show && !peeked && accounts && topics) { peeked = { accounts, topics, tabs }; accounts.hidden = true; topics.hidden = false; tabs[0]?.setAttribute('aria-selected', 'false'); tabs[1]?.setAttribute('aria-selected', 'true'); }
    if (!show && peeked) { peeked.accounts.hidden = false; peeked.topics.hidden = true; peeked.tabs[0]?.setAttribute('aria-selected', 'true'); peeked.tabs[1]?.setAttribute('aria-selected', 'false'); peeked = null; }
  }
  const clear = () => document.querySelectorAll('.post-drop-target').forEach(el => el.classList.remove('is-drop-target', 'post-drop-target'));
  function start() {
    const { card, postId } = pending, saved = post(postId);
    pending = null;
    if (!saved) return;
    const ghost = document.createElement('div');
    ghost.className = 'topic-drag-ghost post-drag-ghost'; ghost.setAttribute('aria-hidden', 'true');
    ghost.innerHTML = '<span class="topic-drag-name"></span><span class="topic-drag-hint">Drop on a topic</span>';
    ghost.querySelector('.topic-drag-name').textContent = saved.authorName || (saved.author ? `@${String(saved.author).replace(/^@+/, '')}` : '') || saved.bookmarkTitle || 'This post';
    document.body.append(ghost);
    drag = { card, postId, ghost, origin: card.getBoundingClientRect(), action: null };
    card.classList.add('is-drag-source'); document.body.classList.add('post-dragging');
    if (!reducedMotion.matches) ghost.animate([{ opacity: 0, scale: .92 }, { opacity: 1, scale: 1 }], { duration: 140, easing: 'ease-out' });
    scrollFrame = requestAnimationFrame(autoScroll);
  }
  function target(event) {
    const { ghost } = drag;
    lastPointer = { clientX: event.clientX, clientY: event.clientY };
    ghost.style.translate = `${event.clientX + 14}px ${event.clientY + 10}px`;
    const under = document.elementFromPoint(event.clientX, event.clientY);
    clear(); drag.action = null;
    // The Topics tab opens after a short hover, the way folders spring open on a Mac.
    const tab = under?.closest('#sidebar-collections-tab');
    if (tab && tab.getAttribute('aria-selected') !== 'true') { if (!spring) spring = setTimeout(() => { spring = null; if (drag) { peek(true); target(lastPointer); } }, SPRING); }
    else { clearTimeout(spring); spring = null; }
    const drop = under?.closest('#topic-navigation [data-topic-row], .collection-folders [data-drop-topic]');
    const id = drop && (drop.dataset.topicRow || drop.dataset.dropTopic), name = id && topic(id)?.name;
    let hint = tab && !peeked && tab.getAttribute('aria-selected') !== 'true' ? 'Showing topics…' : 'Drop on a topic';
    if (name) {
      const already = (post(drag.postId)?.topics || []).includes(name);
      hint = already ? `Already in “${name}”` : `Add to “${name}”`;
      if (!already) { drop.classList.add('is-drop-target', 'post-drop-target'); drag.action = { id, name, element: drop }; }
    }
    ghost.querySelector('.topic-drag-hint').textContent = hint; ghost.classList.toggle('has-target', !!drag.action);
  }
  // Near the top or bottom of the sidebar, the list scrolls so any topic can be reached.
  function autoScroll() {
    if (!drag) return;
    const nav = document.querySelector('.sidebar nav'), tabs = document.querySelector('.sidebar-tabs-bar');
    if (nav && lastPointer) {
      const rect = nav.getBoundingClientRect(), top = Math.max(rect.top, tabs?.getBoundingClientRect().bottom ?? rect.top);
      const inside = lastPointer.clientX >= rect.left && lastPointer.clientX <= rect.right;
      const speed = !inside ? 0 : lastPointer.clientY < top + EDGE ? -Math.ceil((top + EDGE - lastPointer.clientY) / 4) : lastPointer.clientY > rect.bottom - EDGE ? Math.ceil((lastPointer.clientY - rect.bottom + EDGE) / 4) : 0;
      if (speed) { nav.scrollTop += speed; target(lastPointer); }
    }
    scrollFrame = requestAnimationFrame(autoScroll);
  }
  function finish(commit) {
    const { ghost, card, postId, origin, action } = drag; drag = null;
    cancelAnimationFrame(scrollFrame); clearTimeout(spring); spring = null;
    clear(); card.classList.remove('is-drag-source'); document.body.classList.remove('post-dragging');
    // The topics stay a moment after a drop, so the post can be seen landing in one.
    if (peeked) setTimeout(() => { if (!drag) peek(false); }, commit && action ? 700 : 0);
    suppressClick = true; setTimeout(() => { suppressClick = false; }, 0);
    const done = commit && action, to = done ? action.element.getBoundingClientRect() : origin, from = ghost.getBoundingClientRect();
    const remove = () => ghost.remove();
    // Settle into the topic, or glide back to the post.
    if (reducedMotion.matches) remove();
    else ghost.animate([{ opacity: 1, scale: 1 }, { opacity: 0, scale: done ? .7 : .95, translate: `${to.left + 12}px ${to.top + to.height / 2 - from.height / 2}px` }], { duration: done ? 220 : 200, easing: 'cubic-bezier(.22,.68,.2,1)', fill: 'forwards' }).onfinish = remove;
    if (done) void add(postId, [action.id]);
  }
  document.addEventListener('pointerdown', event => {
    const card = event.button === 0 && enabled() && event.target.closest?.('.save-card[data-post-id]');
    pending = card && !event.target.closest(NOT_EMPTY) ? { card, postId: Number(card.dataset.postId), x: event.clientX, y: event.clientY } : null;
  });
  document.addEventListener('pointermove', event => {
    if (pending && Math.hypot(event.clientX - pending.x, event.clientY - pending.y) >= THRESHOLD) start();
    if (drag) { event.preventDefault(); target(event); }
  });
  document.addEventListener('pointerup', () => { pending = null; if (drag) finish(true); });
  document.addEventListener('pointercancel', () => { pending = null; if (drag) finish(false); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && drag) { event.preventDefault(); event.stopPropagation(); finish(false); } }, true);
  // The click that ends a drag must not also open anything.
  document.addEventListener('click', event => { if (suppressClick) { event.preventDefault(); event.stopImmediatePropagation(); suppressClick = false; } }, true);
}
