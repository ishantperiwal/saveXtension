// Keep cards in chronological DOM order and move them without reparenting the
// embedded players. ResizeObserver handles widgets, notes, and window resizing.
let active;
const GAP = 20, MIN_WIDTH = 340;

export function disposeCardLayout() {
  if (!active) return;
  active.observer.disconnect(); cancelAnimationFrame(active.frame); active = null;
}

export function layoutCards(grid) {
  if (active?.grid !== grid) {
    disposeCardLayout();
    const state = { grid, cards: new Set(), frame: 0, width: grid.clientWidth };
    const schedule = () => {
      if (state.frame) return;
      state.frame = requestAnimationFrame(() => { state.frame = 0; arrange(state); });
    };
    state.observer = new ResizeObserver(entries => {
      if (entries.some(entry => entry.target !== grid || entry.contentRect.width !== state.width)) schedule();
    });
    state.observer.observe(grid); active = state;
  }
  const cards = new Set(grid.children);
  for (const card of active.cards) if (!cards.has(card)) active.observer.unobserve(card);
  for (const card of cards) if (!active.cards.has(card)) active.observer.observe(card);
  active.cards = cards;
  // Position new cards before attaching the lazy embed observer, so it does not
  // mistake every new card for a post at the top of the viewport.
  arrange(active);
}

function arrange(state) {
  const { grid, cards } = state;
  if (!grid.isConnected || !cards.size || !grid.clientWidth) return;
  state.width = grid.clientWidth;
  // Keep the same column width for sparse archives and filtered results.
  const columns = Math.max(1, Math.floor((state.width + GAP) / (MIN_WIDTH + GAP)));
  const width = (state.width - (columns - 1) * GAP) / columns;
  grid.classList.add('is-masonry');
  // Write all widths before reading heights, avoiding a layout flush per card.
  for (const card of cards) if (card.style.width !== `${width}px`) card.style.width = `${width}px`;
  const sizes = [...cards].map(card => [card, card.getBoundingClientRect().height]);
  const bottoms = Array(columns).fill(0);
  for (const [card, height] of sizes) {
    const column = bottoms.indexOf(Math.min(...bottoms));
    const position = `translate(${column * (width + GAP)}px, ${bottoms[column]}px)`;
    if (card.style.transform !== position) card.style.transform = position;
    bottoms[column] += height + GAP;
  }
  const height = `${Math.max(...bottoms) - GAP}px`;
  if (grid.style.height !== height) grid.style.height = height;
}
