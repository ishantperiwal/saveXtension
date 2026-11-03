import { mountCardMotion, holdEmbedMotion } from './motion.js';
// Keep cards in chronological DOM order and move them without reparenting the
// embedded players. ResizeObserver handles widgets, notes, and window resizing.
let active;
const GAP = 16, MIN_WIDTH = 340;
// A view switch waits briefly for embeds to redraw at the new width, then moves.
const MOVE = 380, SETTLE_QUIET = 48, SETTLE_MAX = 160;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

function stopMovement(state) {
  for (const animation of state.movements.values()) { animation.onfinish = null; animation.cancel(); }
  for (const animation of state.corrections.values()) animation.cancel();
  state.movements.clear(); state.corrections.clear(); state.destinations.clear();
}
const offset = transform => { const [x = 0, y = 0] = transform.match(/-?[\d.]+(?=px)/g)?.map(Number) || []; return { x, y }; };

function stopReadingHold(state) {
  cancelAnimationFrame(state.readFrame); state.readFrame = 0; state.reading = null;
}

function readingPosition(state) {
  // Scrolls made by the reader (including keyboard and programmatic navigation)
  // immediately choose a new post. Our own compensation must not steal focus.
  if (!state.reading?.preview.isConnected || Math.abs(scrollY - state.reading.scrollY) > 1) {
    // A resized card above may already overlap the viewport before masonry
    // moves its neighbors. Judge visibility using its previous painted height,
    // so that expansion cannot make it steal the reader's focused post.
    const focused = visiblePost(state.cards, null, state.previewHeights);
    state.reading = focused ? { preview: focused.preview, top: focused.preview.getBoundingClientRect().top, scrollY } : null;
  }
  return state.reading;
}

function holdReadingPosition(state, checkScroll = true) {
  const anchor = checkScroll ? readingPosition(state) : state.reading;
  if (!anchor) return;
  const delta = anchor.preview.getBoundingClientRect().top - anchor.top;
  if (Math.abs(delta) > .5) {
    window.scrollTo({ left: scrollX, top: scrollY + delta, behavior: 'instant' });
    anchor.scrollY = scrollY;
    // At the document edges scrolling may clamp. Accept the reachable position
    // instead of repeatedly trying to scroll beyond the page.
    const actualTop = anchor.preview.getBoundingClientRect().top;
    if (Math.abs(actualTop - anchor.top) > 1) anchor.top = actualTop;
  }
  anchor.scrollY = scrollY;
}

function followReadingPosition(state) {
  if (state.readFrame) return;
  const tick = () => {
    state.readFrame = 0;
    if (active !== state || state.grid.dataset.view !== 'feed') { stopReadingHold(state); return; }
    holdReadingPosition(state);
    if (performance.now() < state.readUntil) state.readFrame = requestAnimationFrame(tick);
    else state.reading = null;
  };
  state.readFrame = requestAnimationFrame(tick);
}

export function setCardView(grid, view, prepare) {
  if (active?.grid !== grid) layoutCards(grid);
  stopReadingHold(active);
  // Toggling straight back should return to the same post, even when several
  // equally visible grid neighbors could otherwise become the new anchor.
  const previous = grid.dataset.view === 'grid' && active.focus && Math.abs(scrollY - active.focus.scrollY) <= 2 ? active.focus.preview : null;
  const anchor = visiblePost(active.cards, previous);
  const before = new Map([...active.items].map(item => [item, item.getBoundingClientRect()]));
  stopMovement(active); cancelAnimationFrame(active.settleFrame);
  if (document.startViewTransition && !reducedMotion.matches) { morphView(active, view, prepare, anchor, before); return; }
  grid.dataset.view = view; prepare?.();
  active.columns.clear();
  active.anchor = anchor;
  grid.classList.add('switching-view');
  if (reducedMotion.matches) { active.settling = false; active.moveUntil = 0; arrange(active, before); return; }
  // Hold every card where it was while embeds report their new heights, then
  // change position and size together in one motion to the final layout.
  const state = active, start = performance.now();
  holdEmbedMotion(SETTLE_MAX + MOVE);
  Object.assign(state, { switchBefore: before, settling: true, lastResize: start, moveUntil: start + SETTLE_MAX + MOVE });
  arrange(state, before);
  const wait = () => {
    if (active !== state) return;
    const now = performance.now();
    if (now - state.lastResize < SETTLE_QUIET && now - start < SETTLE_MAX) { state.settleFrame = requestAnimationFrame(wait); return; }
    state.settling = false; state.moveUntil = now + MOVE;
    arrange(state, state.switchBefore); state.switchBefore = null;
  };
  state.settleFrame = requestAnimationFrame(wait);
}

// The browser pictures each nearby card before and after the switch, then
// animates its box to the new size and place while crossfading the pictures.
// Reflowed text and embeds change during the movement instead of before it.
function morphView(state, view, prepare, anchor, before) {
  // Toolbars move with the page instead of fading as part of it.
  const { grid } = state, tools = [['.search-tools', 'savex-search-tools'], ['.browse-controls', 'savex-browse-controls']].map(([selector, name]) => [document.querySelector(selector), name]).filter(([el]) => el);
  state.transition?.skipTransition();
  const named = [...state.items].filter(item => { const rect = before.get(item); return rect && rect.bottom > -innerHeight / 2 && rect.top < innerHeight * 1.5; });
  for (const item of state.items) item.style.viewTransitionName = '';
  named.forEach((item, index) => { item.style.viewTransitionName = `savex-card-${index}`; });
  for (const [el, name] of tools) el.style.viewTransitionName = name;
  holdEmbedMotion(SETTLE_MAX + MOVE);
  grid.classList.add('switching-view');
  const transition = document.startViewTransition(async () => {
    grid.dataset.view = view; prepare?.();
    Object.assign(state, { anchor, moveUntil: performance.now() + SETTLE_MAX + MOVE });
    state.columns.clear(); arrange(state);
    // The old picture stays on screen while embeds report their new heights,
    // so the new picture is taken from the settled layout.
    const heights = () => [...state.items].map(item => item.offsetHeight).join();
    const start = performance.now(); let last = heights(), quiet = start;
    while (performance.now() - start < SETTLE_MAX && performance.now() - quiet < SETTLE_QUIET) {
      await new Promise(resolve => setTimeout(resolve, 16));
      const next = heights(); if (next !== last) { last = next; quiet = performance.now(); arrange(state); }
    }
  });
  state.transition = transition;
  transition.finished.finally(() => {
    if (state.transition !== transition) return;
    state.transition = null; grid.classList.remove('switching-view');
    for (const item of named) item.style.viewTransitionName = '';
    for (const [el] of tools) el.style.viewTransitionName = '';
  });
}

function visiblePost(cards, preferred, heights) {
  let best;
  for (const card of cards) {
    const preview = card.querySelector('.card-preview') || card, rect = preview.getBoundingClientRect();
    const height = heights?.get(preview) ?? rect.height;
    const top = Math.max(0, rect.top), bottom = Math.min(innerHeight, rect.top + height);
    const width = Math.max(0, Math.min(innerWidth, rect.right) - Math.max(0, rect.left));
    const area = width * Math.max(0, bottom - top);
    if (!area || !rect.height) continue;
    const screenY = (top + bottom) / 2, distance = Math.abs(screenY - innerHeight / 2);
    if (preview === preferred) return { preview, area, distance, ratio: (screenY - rect.top) / rect.height, screenY, scrollY, pending: true };
    if (!best || area > best.area || area === best.area && distance < best.distance) {
      best = { preview, area, distance, ratio: (screenY - rect.top) / rect.height, screenY, scrollY, pending: true };
    }
  }
  return best || null;
}

// Where a preview sits once its card's movement ends. Running animations
// would otherwise offset and scale the visual rectangle mid-switch.
function layoutRect(state, preview) {
  const card = preview.closest('.save-card') || preview;
  let top = Number(card.style.transform.match(/,\s*(-?[\d.]+)px\)/)?.[1] || 0);
  for (let el = preview; el && el !== card; el = el.offsetParent) top += el.offsetTop;
  return { top: state.grid.getBoundingClientRect().top + top, height: preview.offsetHeight };
}

const plannedHeights = card => [...card.querySelectorAll('[data-layout-height]')].map(section => section.dataset.layoutHeight).join();

export function disposeCardLayout() {
  if (!active) return;
  active.observer.disconnect(); cancelAnimationFrame(active.frame); cancelAnimationFrame(active.settleFrame); stopReadingHold(active); stopMovement(active); active = null;
}

export function layoutCards(grid) {
  if (active?.grid !== grid) {
    disposeCardLayout();
    const state = { grid, cards: new Set(), items: new Set(), order: [], frame: 0, width: grid.clientWidth, columns: new Map(), columnCount: 0, positioned: new Set(), movements: new Map(), corrections: new Map(), destinations: new Map(), moveUntil: 0, previewHeights: new Map(), plannedHeights: new WeakMap() };
    const schedule = () => {
      if (state.frame) return;
      state.frame = requestAnimationFrame(() => { state.frame = 0; arrange(state, undefined, true); });
    };
    // An animating embed or note already told the layout its final height, so
    // its frame-by-frame growth needs no new arrangement, except while a view
    // switch keeps the reader's post in place as it grows.
    const planned = card => { const key = plannedHeights(card); return !state.anchor && !!key && state.plannedHeights.get(card) === key; };
    state.observer = new ResizeObserver(entries => {
      if (state.settling) state.lastResize = performance.now();
      if (entries.some(entry => entry.target === grid ? entry.contentRect.width !== state.width : !planned(entry.target))) schedule();
    });
    state.observer.observe(grid); active = state;
  }
  const items = new Set([...grid.children].filter(item => !item.hidden)), cards = new Set([...items].filter(item => item.matches('.save-card')));
  const previous = active.order, next = [...cards].map(card => `${card.dataset.postId}:${card.dataset.savedGroup}`);
  if (!previous.every((card, index) => next[index] === card)) { active.columns.clear(); stopReadingHold(active); }
  for (const item of active.items) if (!items.has(item)) { active.observer.unobserve(item); active.columns.delete(item); active.positioned.delete(item); }
  for (const item of items) if (!active.items.has(item)) active.observer.observe(item);
  active.cards = cards; active.items = items; active.order = next;
  // Position new cards before attaching the lazy embed observer, so it does not
  // mistake every new card for a post at the top of the viewport.
  mountCardMotion(cards); arrange(active);
}

function arrange(state, before, resized = false) {
  const { grid, items } = state;
  if (!grid.isConnected || !items.size || !grid.clientWidth) return;
  // Release the view-switch anchor once that transition ends or the reader
  // scrolls; ordinary preview resizing uses the separate reading hold below.
  if (state.anchor && !state.anchor.pending && (performance.now() > state.moveUntil || Math.abs(scrollY - state.anchor.scrollY) > 2)) state.anchor = null;
  // Capture the most visible preview before moving any absolute-positioned
  // cards. Use a pixel offset, not a height ratio: growing the focused preview
  // should reveal more below it without moving the text already being read.
  const holdReading = resized && grid.dataset.view === 'feed' && !state.anchor && performance.now() > state.moveUntil;
  if (holdReading) readingPosition(state);
  // Retarget from the current visual position if native players report a new
  // height during a view change. The original deadline prevents endless motion.
  // Only cards whose destination changes restart; the rest keep their curve.
  // While a switch settles, every arrangement restarts from the pre-switch view.
  if (!before && state.settling) before = state.switchBefore;
  const retarget = !before && state.movements.size > 0;
  const targets = retarget ? new Map([...items].map(item => [item, item.style.transform])) : null;
  if (retarget) before = new Map([...items].map(item => [item, item.getBoundingClientRect()]));
  else if (before) stopMovement(state);
  state.width = grid.clientWidth;
  // Keep the same column width for sparse archives and filtered results.
  const feed = grid.dataset.view === 'feed';
  const sideNotes = feed && state.width >= 796;
  const rowGap = feed ? 24 : GAP;
  grid.dataset.sideNotes = String(sideNotes);
  const columns = feed ? 1 : Math.max(1, Math.floor((state.width + GAP) / (MIN_WIDTH + GAP)));
  if (state.columnCount !== columns) { state.columns.clear(); state.columnCount = columns; }
  const width = feed ? Math.min(state.width, sideNotes ? 796 : 540) : (state.width - (columns - 1) * GAP) / columns;
  const inset = feed ? (state.width - width) / 2 : 0;
  grid.classList.add('is-masonry');
  // Write all widths before reading heights, avoiding a layout flush per card.
  for (const item of items) {
    const itemWidth = feed || item.matches('.save-card') ? width : state.width;
    if (item.style.width !== `${itemWidth}px`) item.style.width = `${itemWidth}px`;
  }
  const sizes = [...items].map(card => {
    if (sideNotes && card.matches('.save-card')) {
      const note = card.querySelector('.card-note'), preview = card.querySelector('.card-preview'), footer = card.querySelector('.card-footer');
      const previewChange = [...card.querySelectorAll('.embed-stage[data-layout-height]')].reduce((sum, section) => sum + Number(section.dataset.layoutHeight) - section.offsetHeight, 0);
      const postHeight = preview.offsetHeight + previewChange;
      const noteHeight = note.hidden ? 0 : Number(note.dataset.layoutHeight ?? note.offsetHeight) + (parseFloat(getComputedStyle(note).marginTop) || 0);
      return [card, Math.max(postHeight, noteHeight + 10 + footer.offsetHeight)];
    }
    const growing = card.querySelectorAll('.embed-stage[data-layout-height], .card-note[data-layout-height]');
    const change = [...growing].reduce((sum,section) => sum + Number(section.dataset.layoutHeight) - section.offsetHeight, 0);
    return [card, card.offsetHeight + change];
  });
  for (const [card] of sizes) state.plannedHeights.set(card, plannedHeights(card));
  const bottoms = Array(columns).fill(0), added = [];
  for (const [card, height] of sizes) {
    if (!card.matches('.save-card')) {
      const top = Math.max(...bottoms);
      position(card, `translate(${inset}px, ${top}px)`);
      bottoms.fill(top + height + rowGap);
      continue;
    }
    let column = state.columns.get(card);
    if (column === undefined) { column = bottoms.indexOf(Math.min(...bottoms)); state.columns.set(card, column); }
    position(card, `translate(${inset + column * (width + GAP)}px, ${bottoms[column]}px)`);
    bottoms[column] += height + rowGap;
  }
  function position(item, transform) {
    if (!state.positioned.has(item)) { item.classList.remove('can-move'); state.positioned.add(item); added.push(item); }
    if (item.style.transform !== transform) item.style.transform = transform;
  }
  // Commit initial positions before enabling movement; new cards should never
  // travel across the grid from the origin on their first paint.
  for (const card of added) card.getBoundingClientRect();
  for (const card of added) card.classList.add('can-move');
  const height = `${Math.max(...bottoms) - rowGap}px`;
  if (grid.style.height !== height) grid.style.height = height;
  if (holdReading && state.reading) {
    holdReadingPosition(state, false);
    // Card transforms and embed heights animate for 320ms. Follow those visual
    // positions until they settle, including a second delayed preview above.
    state.readUntil = performance.now() + 360;
    followReadingPosition(state);
  }
  state.previewHeights = new Map([...state.cards].map(card => {
    const preview = card.querySelector('.card-preview') || card;
    return [preview, preview.offsetHeight];
  }));
  if (state.anchor) {
    const anchor = state.anchor, rect = layoutRect(state, anchor.preview);
    if (anchor.preview.isConnected && rect.height) {
      // Keep the same point within a tall post visible, rather than jumping to
      // its top. This also compensates for scroll clamping as a grid shrinks.
      window.scrollTo({ left: scrollX, top: scrollY + rect.top + rect.height * anchor.ratio - anchor.screenY, behavior: 'instant' });
      anchor.scrollY = scrollY; anchor.pending = false;
      state.focus = { preview: anchor.preview, scrollY };
    }
    if (reducedMotion.matches || !anchor.preview.isConnected) state.anchor = null;
  }
  if (before) {
    const duration = state.settling ? MOVE : state.moveUntil - performance.now();
    const origin = grid.getBoundingClientRect();
    if (!reducedMotion.matches && duration > 20) for (const item of items) {
      if (retarget && item.style.transform === targets.get(item)) continue;
      const running = state.movements.get(item);
      if (retarget && running && state.destinations.has(item)) {
        // A late embed height moved this card's destination. Bend the running
        // motion with an offset that eases in from rest and ends with it, so
        // the card never restarts or changes speed abruptly.
        const base = offset(state.destinations.get(item)), next = offset(item.style.transform);
        const correction = state.corrections.get(item), current = correction ? getComputedStyle(item).translate : 'none';
        correction?.cancel();
        state.corrections.set(item, item.animate([{ translate: current === 'none' ? '0px 0px' : current }, { translate: `${next.x - base.x}px ${next.y - base.y}px` }], { duration, easing: 'ease-in-out' }));
        continue;
      }
      if (running) { running.onfinish = null; running.cancel(); state.movements.delete(item); state.corrections.get(item)?.cancel(); state.corrections.delete(item); }
      const from = before.get(item), to = item.getBoundingClientRect();
      if (!from?.width || !to.width || !to.height || (Math.max(from.bottom, to.bottom) < -innerHeight || Math.min(from.top, to.top) > innerHeight * 2)) continue;
      // Scale evenly by width: the content reflows to its new width, and an
      // uneven scale would squash its text and images on the way.
      const animation = item.animate([
        { transform: `translate(${from.left - origin.left}px, ${from.top - origin.top}px) scale(${from.width / to.width})` },
        { transform: item.style.transform }
      ], { duration, easing: 'cubic-bezier(.22,.68,.2,1)' });
      // Held at its starting frame until the new layout settles.
      if (state.settling) animation.pause();
      state.movements.set(item, animation); state.destinations.set(item, item.style.transform);
      animation.onfinish = () => {
        state.movements.delete(item); state.corrections.delete(item); state.destinations.delete(item);
        if (!state.movements.size) grid.classList.remove('switching-view');
      };
    }
    if (!state.movements.size) grid.classList.remove('switching-view');
  }
}

reducedMotion.addEventListener('change', () => {
  if (active && reducedMotion.matches) { stopMovement(active); active.moveUntil = 0; active.grid.classList.remove('switching-view'); }
});
