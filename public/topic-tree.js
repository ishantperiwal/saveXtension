// Topic folders nest one level deep. The hierarchy only organizes folders: a
// post keeps exactly the topics it was given, never its parent's implicitly.
const parentOf = (topics, topic) => {
  const parent = topic.parentId && topics.find(t => t.id === topic.parentId);
  return parent && !parent.parentId ? parent : null;
};

// Keeps the catalog's saved order at both levels.
export function topicTree(topics) {
  return topics.filter(topic => !parentOf(topics, topic)).map(topic => ({ ...topic, children: topics.filter(child => parentOf(topics, child)?.id === topic.id) }));
}

// Opening a parent shows its own posts and every subfolder's posts.
export function topicScope(topics, name) {
  const topic = topics.find(t => t.name === name);
  return topic?.id ? [name, ...topics.filter(child => parentOf(topics, child)?.id === topic.id).map(child => child.name)] : [name];
}

export function canNest(topics, id, parentId) {
  const topic = topics.find(t => t.id === id), parent = topics.find(t => t.id === parentId);
  return !!topic && !!parent && topic.id !== parent.id && !parent.parentId && topic.parentId !== parent.id && !topics.some(t => t.parentId === topic.id);
}

// The full order after dropping one or several folders into a parent, beside
// another folder, or at the top level. Moved folders keep their relative order.
export function arrangedLayout(topics, ids, action) {
  ids = [].concat(ids);
  const tree = topicTree(topics.filter(t => t.id)).map(t => ({ id: t.id, children: t.children.map(c => c.id) }));
  const order = new Map(topics.map((t, index) => [t.id, index])); ids.sort((a, b) => order.get(a) - order.get(b));
  const moving = ids.map(id => tree.find(node => node.id === id) || { id, children: [] });
  for (const node of tree) node.children = node.children.filter(child => !ids.includes(child));
  const roots = tree.filter(node => !ids.includes(node.id));
  if (action.type === 'into') roots.find(node => node.id === action.parentId)?.children.push(...ids);
  else if (action.type === 'top') roots.push(...moving);
  else {
    const list = action.parentId ? roots.find(node => node.id === action.parentId)?.children : roots;
    const index = list.findIndex(item => (item.id ?? item) === action.referenceId);
    list.splice(index < 0 ? list.length : index + (action.after ? 1 : 0), 0, ...(action.parentId ? ids : moving));
  }
  return roots.flatMap(node => [{ id: node.id, parentId: null }, ...node.children.map(child => ({ id: child, parentId: node.id }))]);
}

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const THRESHOLD = 6, EDGE = 48, GAP = 14;

// Pointer-driven drag and drop for [data-drag-topic] grips and folder tiles.
// Sidebar rows ([data-topic-row]) take a drop above or below them to reorder,
// or in the middle of a top-level folder to nest. Folder tiles take
// [data-drop-topic] drops to nest. The list scrolls near its edges.
export function enableTopicDrag({ topics, move, arrange, describe, selection = () => [], tag = null }) {
  let pending = null, drag = null, suppressClick = false, lastPointer = null, scrollFrame = 0;
  const line = () => document.querySelector('.topic-drop-line') || document.body.appendChild(Object.assign(document.createElement('div'), { className: 'topic-drop-line', ariaHidden: 'true' }));
  const clear = () => {
    document.querySelectorAll('.is-drop-target, .is-drop-root').forEach(el => el.classList.remove('is-drop-target', 'is-drop-root'));
    document.querySelector('.topic-drop-line')?.classList.remove('is-visible');
  };
  // A post under a dragged topic is veiled with a badge naming what the drop will do.
  const FOLDER = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8V7a2 2 0 0 1 2-2h4.5l2 2.5H19a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/></svg>';
  function veil(card, text, ready) {
    const host = card.querySelector('.card-content') || card;
    let el = host.querySelector(':scope > .topic-drop-overlay');
    if (!el) { el = Object.assign(document.createElement('div'), { className: 'topic-drop-overlay', ariaHidden: 'true' }); el.innerHTML = `<span class="topic-drop-badge">${FOLDER}<span class="topic-drop-text"></span></span>`; host.append(el); }
    el.classList.toggle('is-ready', ready); el.querySelector('.topic-drop-text').textContent = text;
    return el;
  }
  function unveil(keep = null, done = '') {
    for (const el of document.querySelectorAll('.topic-drop-overlay')) {
      if (el === keep || el.dataset.leaving) continue;
      el.dataset.leaving = '';
      if (done) el.querySelector('.topic-drop-text').textContent = done;
      if (reducedMotion.matches) { el.remove(); continue; }
      el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: done ? 220 : 120, delay: done ? 380 : 0, easing: 'ease-out', fill: 'forwards' }).onfinish = () => el.remove();
    }
  }
  // Rows after the insertion point slide down to open a gap where the folder will land.
  function openGap(boundary) {
    const moved = new Set();
    for (const [index, { row }] of (drag?.rows || []).entries()) {
      if (index < boundary) continue;
      const block = row.closest('li') || row.closest('.topic-group') || row;
      moved.add(block.matches('li') && moved.has(block.closest('.topic-group')) ? null : block);
    }
    for (const block of document.querySelectorAll('[data-gap-shift]')) if (!moved.has(block)) { block.style.translate = ''; delete block.dataset.gapShift; }
    for (const block of moved) if (block && !block.dataset.gapShift) { block.dataset.gapShift = ''; block.style.translate = `0 ${GAP}px`; }
  }
  function start(event) {
    const { source, id } = pending, row = source.closest('[data-topic-row]') || source, rect = row.getBoundingClientRect();
    const ghost = document.createElement('div');
    ghost.className = 'topic-drag-ghost'; ghost.setAttribute('aria-hidden', 'true');
    ghost.innerHTML = '<span class="topic-drag-name"></span><span class="topic-drag-hint"></span>';
    const selected = selection(), ids = selected.length > 1 && selected.includes(id) ? selected : [id];
    ghost.querySelector('.topic-drag-name').textContent = ids.length > 1 ? `${ids.length} folders` : describe(id)?.name || '';
    if (ids.length > 1) ghost.classList.add('is-group');
    document.body.append(ghost);
    // Row geometry is measured once, relative to the list, so rows that slide
    // aside for the gap never change which gap the pointer is over.
    const list = document.querySelector('#topic-navigation'), listTop = list?.getBoundingClientRect().top ?? 0;
    const rows = list ? [...list.querySelectorAll('[data-topic-row]')].filter(item => item.getClientRects().length).map(item => { const r = item.getBoundingClientRect(); return { row: item, top: r.top - listTop, height: r.height, left: r.left, width: r.width }; }) : [];
    const sources = ids.map(item => rows.find(info => info.row.dataset.topicRow === item)?.row).filter(Boolean);
    drag = { ...pending, ids, row, sources: sources.length ? sources : [row], ghost, origin: rect, action: null, offsetX: -18, offsetY: -14, list, rows };
    pending = null;
    drag.sources.forEach(item => item.classList.add('is-drag-source')); document.body.classList.add('topic-dragging');
    if (!reducedMotion.matches) ghost.animate([{ opacity: 0, scale: .92 }, { opacity: 1, scale: 1 }], { duration: 140, easing: 'ease-out' });
    scrollFrame = requestAnimationFrame(autoScroll);
  }
  // The sidebar row nearest the pointer, so the gaps between rows never flicker.
  function nearestRow(y) {
    const listTop = drag.list.getBoundingClientRect().top;
    let best = null, distance = Infinity;
    for (const [index, info] of drag.rows.entries()) {
      const top = listTop + info.top, bottom = top + info.height, d = y < top ? top - y : y > bottom ? y - bottom : 0;
      if (d < distance) { best = { ...info, index, top, bottom }; distance = d; }
    }
    return best;
  }
  function rowAction(info, y) {
    const { row } = info, all = topics(), { ids } = drag, targetId = row.dataset.topicRow;
    const parentId = row.dataset.parentId || null, offset = (y - info.top) / info.height;
    const expandedParent = !parentId && row.closest('.topic-group')?.querySelector('.topic-children:not([hidden])');
    const fits = parent => ids.every(id => describe(id)?.parentId === parent || canNest(all, id, parent));
    if (ids.includes(targetId) || parentId && ids.includes(parentId)) return null;
    // The middle of a top-level folder (or the lower part of an open one) nests into it.
    if (!parentId && (offset > .3 && offset < .7 || expandedParent && offset >= .7) && ids.every(id => canNest(all, id, targetId))) return { type: 'into', parentId: targetId, element: row };
    if (parentId && !fits(parentId)) return null;
    const after = offset >= .5;
    return { type: 'place', parentId, referenceId: targetId, after, boundary: info.index + (after ? 1 : 0), element: row };
  }
  function target(event) {
    const { ghost, id } = drag, topic = describe(id);
    lastPointer = { clientX: event.clientX, clientY: event.clientY };
    ghost.style.translate = `${event.clientX - drag.offsetX}px ${event.clientY - drag.offsetY}px`;
    const under = document.elementFromPoint(event.clientX, event.clientY);
    const list = under?.closest('#topic-navigation');
    // The floating label guides moves within the sidebar; over posts the card's own overlay speaks instead.
    ghost.classList.toggle('is-away', !under?.closest('.sidebar'));
    clear(); drag.action = null;
    if (list && drag.rows.length && !drag.tagOnly) {
      unveil();
      const info = nearestRow(event.clientY), action = info && rowAction(info, event.clientY);
      if (action?.type === 'into') action.element.classList.add('is-drop-target');
      if (action?.type === 'place') {
        // The line sits in the middle of the opened gap.
        const listTop = drag.list.getBoundingClientRect().top, rows = drag.rows, before = rows[action.boundary - 1], next = rows[action.boundary];
        const y = before && next ? (listTop + before.top + before.height + listTop + next.top + GAP) / 2 : before ? listTop + before.top + before.height + GAP / 2 : listTop + next.top + GAP / 2;
        const indicator = line();
        Object.assign(indicator.style, { left: `${info.left + (action.parentId ? 6 : 10)}px`, width: `${info.width - (action.parentId ? 12 : 20)}px`, top: `${y - 1}px` });
        indicator.classList.add('is-visible');
      }
      openGap(action?.type === 'place' ? action.boundary : Infinity);
      drag.action = action;
    } else {
      openGap(Infinity);
      // A post card takes the dragged topics as tags instead of moving them.
      const card = tag && under?.closest('.save-card[data-post-id]'), folder = under?.closest('[data-drop-topic]'), root = under?.closest('[data-drop-root]');
      if (card) {
        const postId = Number(card.dataset.postId), fresh = drag.ids.filter(item => !tag.has(postId, item));
        const named = list => list.length === 1 ? `“${describe(list[0])?.name || 'this topic'}”` : `${list.length} topics`;
        const overlay = veil(card, fresh.length ? `Add ${named(fresh)} to this post` : `Already in ${named(drag.ids)}`, !!fresh.length);
        if (fresh.length) { card.classList.add('is-drop-target'); drag.action = { type: 'tag', postId, ids: fresh, element: card.querySelector('.card-footer') || card, overlay, label: named(fresh) }; }
        ghost.querySelector('.topic-drag-hint').textContent = fresh.length ? 'Add to this post' : 'Already on this post'; ghost.classList.toggle('has-target', !!fresh.length);
        unveil(overlay);
        return;
      }
      unveil();
      if (!drag.tagOnly && folder && drag.ids.every(item => canNest(topics(), item, folder.dataset.dropTopic))) { folder.classList.add('is-drop-target'); drag.action = { type: 'into', parentId: folder.dataset.dropTopic, element: folder }; }
      else if (!drag.tagOnly && !folder && root && drag.ids.some(item => describe(item)?.parentId)) { root.classList.add('is-drop-root'); drag.action = { type: 'top', element: root }; }
    }
    const action = drag.action, into = action?.type === 'into' ? describe(action.parentId)?.name : '';
    const hint = !action ? drag.tagOnly ? 'Drop on a post to add it' : '' : into ? `Move into ${into}` : action.type === 'top' || action.type === 'place' && !action.parentId && drag.ids.some(item => describe(item)?.parentId) ? 'Move to top level' : 'Move here';
    ghost.querySelector('.topic-drag-hint').textContent = hint; ghost.classList.toggle('has-target', !!action);
  }
  // Dragging near the top or bottom of the sidebar list scrolls it, so far-apart
  // folders can be brought together in one drag.
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
    openGap(Infinity);
    const { ghost, sources, id, ids, origin, action } = drag; drag = null; cancelAnimationFrame(scrollFrame);
    clear(); sources.forEach(item => item.classList.remove('is-drag-source')); document.body.classList.remove('topic-dragging');
    unveil(null, commit && action?.type === 'tag' ? `Added ${action.label}` : '');
    suppressClick = true; setTimeout(() => { suppressClick = false; }, 0);
    const done = commit && action, to = done ? action.element.getBoundingClientRect() : origin, from = ghost.getBoundingClientRect();
    const remove = () => ghost.remove();
    if (reducedMotion.matches || ghost.classList.contains('is-away')) remove();
    // Settle into the new place, or glide back to where the drag began.
    else ghost.animate([{ opacity: 1, scale: 1 }, { opacity: 0, scale: done ? .7 : .95, translate: `${to.left + 12}px ${to.top + to.height / 2 - from.height / 2}px` }], { duration: done ? 220 : 200, easing: 'cubic-bezier(.22,.68,.2,1)', fill: 'forwards' }).onfinish = remove;
    if (!done) return;
    if (action.type === 'tag') void tag.add(action.postId, action.ids);
    else if (ids.length === 1 && action.type === 'top') void move(id, null);
    else if (ids.length === 1 && action.type === 'into' && !action.element.matches('[data-topic-row]')) void move(id, action.parentId);
    else void arrange(arrangedLayout(topics(), ids, action), ids, action);
  }
  document.addEventListener('pointerdown', event => {
    // A sidebar topic reorders from the left end of its row, up to its icon. From anywhere else it only tags posts,
    // so reaching for a post can't reshuffle the list. A click that barely moves still opens it.
    const source = event.button === 0 && event.target.closest('[data-drag-topic], #topic-navigation [data-topic-row]');
    const row = source && source.closest('#topic-navigation [data-topic-row]'), icon = row?.querySelector('svg[data-drag-topic]');
    const tagOnly = !!row && !!icon && event.clientX > icon.getBoundingClientRect().right + 2;
    pending = source ? { source, tagOnly, id: source.dataset.dragTopic || source.dataset.topicRow, x: event.clientX, y: event.clientY } : null;
  });
  document.addEventListener('pointermove', event => {
    if (pending && Math.hypot(event.clientX - pending.x, event.clientY - pending.y) >= THRESHOLD) start(event);
    if (drag) { event.preventDefault(); target(event); }
  });
  document.addEventListener('pointerup', () => { pending = null; if (drag) finish(true); });
  document.addEventListener('pointercancel', () => { pending = null; if (drag) finish(false); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && drag) { event.preventDefault(); finish(false); } }, true);
  // The click that ends a drag must not also open the folder.
  document.addEventListener('click', event => { if (suppressClick) { event.preventDefault(); event.stopImmediatePropagation(); suppressClick = false; } }, true);
  document.addEventListener('dragstart', event => { if (event.target.closest?.('[data-drag-topic]')) event.preventDefault(); });
}
