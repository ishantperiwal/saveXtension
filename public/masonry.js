import { mountCardMotion } from './motion.js';
// Keep cards in chronological DOM order and move them without reparenting the
// embedded players. ResizeObserver handles widgets, notes, and window resizing.
let active;
const GAP = 16, MIN_WIDTH = 280;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

function stopMovement(state) {
  for (const animation of state.movements.values()) { animation.onfinish = null; animation.cancel(); }
  state.movements.clear();
}

export function setCardView(grid, view, prepare) {
  if (active?.grid !== grid) layoutCards(grid);
  // Toggling straight back should return to the same post, even when several
  // equally visible grid neighbors could otherwise become the new anchor.
  const previous = grid.dataset.view === 'grid' && active.focus && Math.abs(scrollY - active.focus.scrollY) <= 2 ? active.focus.preview : null;
  const anchor = visiblePost(active.cards, previous);
  const before = new Map([...active.items].map(item => [item, item.getBoundingClientRect()]));
  stopMovement(active);
  grid.dataset.view = view; prepare?.();
  active.columns.clear();
  active.moveUntil = reducedMotion.matches ? 0 : performance.now() + 380;
  active.anchor = anchor;
  grid.classList.add('switching-view');
  arrange(active, before);
}

function visiblePost(cards, preferred) {
  let best;
  for (const card of cards) {
    const preview = card.querySelector('.card-preview') || card, rect = preview.getBoundingClientRect();
    const top = Math.max(0, rect.top), bottom = Math.min(innerHeight, rect.bottom);
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

export function disposeCardLayout() {
  if (!active) return;
  active.observer.disconnect(); cancelAnimationFrame(active.frame); stopMovement(active); active = null;
}

export function layoutCards(grid) {
  if (active?.grid !== grid) {
    disposeCardLayout();
    const state = { grid, cards: new Set(), items: new Set(), order: [], frame: 0, width: grid.clientWidth, columns: new Map(), columnCount: 0, positioned: new Set(), movements: new Map(), moveUntil: 0 };
    const schedule = () => {
      if (state.frame) return;
      state.frame = requestAnimationFrame(() => { state.frame = 0; arrange(state); });
    };
    state.observer = new ResizeObserver(entries => {
      if (entries.some(entry => entry.target !== grid || entry.contentRect.width !== state.width)) schedule();
    });
    state.observer.observe(grid); active = state;
  }
  const items = new Set([...grid.children].filter(item => !item.hidden)), cards = new Set([...items].filter(item => item.matches('.save-card')));
  const previous = active.order, next = [...cards].map(card => `${card.dataset.postId}:${card.dataset.savedGroup}`);
  if (!previous.every((card, index) => next[index] === card)) active.columns.clear();
  for (const item of active.items) if (!items.has(item)) { active.observer.unobserve(item); active.columns.delete(item); active.positioned.delete(item); }
  for (const item of items) if (!active.items.has(item)) active.observer.observe(item);
  active.cards = cards; active.items = items; active.order = next;
  // Position new cards before attaching the lazy embed observer, so it does not
  // mistake every new card for a post at the top of the viewport.
  mountCardMotion(cards); arrange(active);
}

function arrange(state, before) {
  const { grid, items } = state;
  if (!grid.isConnected || !items.size || !grid.clientWidth) return;
  // Only hold the reading position through this view transition. Subsequent
  // browsing, including a manual scroll, must remain under the reader's control.
  if (state.anchor && !state.anchor.pending && (performance.now() > state.moveUntil || Math.abs(scrollY - state.anchor.scrollY) > 2)) state.anchor = null;
  // Retarget from the current visual position if native players report a new
  // height during a view change. The original deadline prevents endless motion.
  if (!before && state.movements.size) before = new Map([...items].map(item => [item, item.getBoundingClientRect()]));
  if (before) stopMovement(state);
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
      const noteHeight = note.hidden ? 0 : Number(note.dataset.layoutHeight ?? note.offsetHeight);
      return [card, Math.max(postHeight, noteHeight + 10 + footer.offsetHeight)];
    }
    const growing = card.querySelectorAll('.embed-stage[data-layout-height], .card-note[data-layout-height]');
    const change = [...growing].reduce((sum,section) => sum + Number(section.dataset.layoutHeight) - section.offsetHeight, 0);
    return [card, card.offsetHeight + change];
  });
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
  if (state.anchor) {
    const anchor = state.anchor, rect = anchor.preview.getBoundingClientRect();
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
    const duration = state.moveUntil - performance.now();
    const origin = grid.getBoundingClientRect();
    if (!reducedMotion.matches && duration > 20) for (const item of items) {
      const from = before.get(item), to = item.getBoundingClientRect();
      if (!from?.width || !to.width || !to.height || (Math.max(from.bottom, to.bottom) < -innerHeight || Math.min(from.top, to.top) > innerHeight * 2)) continue;
      const animation = item.animate([
        { transform: `translate(${from.left - origin.left}px, ${from.top - origin.top}px) scale(${from.width / to.width}, ${from.height / to.height})` },
        { transform: item.style.transform }
      ], { duration, easing: 'cubic-bezier(.22,.68,.2,1)' });
      state.movements.set(item, animation);
      animation.onfinish = () => {
        state.movements.delete(item);
        if (!state.movements.size) grid.classList.remove('switching-view');
      };
    }
    if (!state.movements.size) grid.classList.remove('switching-view');
  }
}

reducedMotion.addEventListener('change', () => {
  if (active && reducedMotion.matches) { stopMovement(active); active.moveUntil = 0; active.grid.classList.remove('switching-view'); }
});
