const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const pendingCards = new Set(), entrances = new Map(), stages = new Map(), noteAnimations = new Map();
const timing = { duration: 320, easing: 'cubic-bezier(.22,.68,.2,1)' };
// A view switch moves every card in one motion. Embed heights that change
// during it join that motion instead of growing on a separate curve.
let embedHoldUntil = 0;
export function holdEmbedMotion(ms) { embedHoldUntil = performance.now() + ms; }
function clearStage(stage) {
  const animation = stages.get(stage);
  stages.delete(stage); delete stage.dataset.layoutHeight;
  if (animation) { animation.onfinish = null; animation.oncancel = null; animation.cancel(); }
}
export function animateEmbedStage(holder, update) {
  const stage = holder.querySelector('.embed-stage');
  if (!stage) { update(); return; }
  const before = stage.offsetHeight;
  clearStage(stage); update();
  const after = stage.offsetHeight;
  if (reducedMotion.matches || performance.now() < embedHoldUntil || !holder.isConnected || !before || before === after) return;
  const rect = holder.getBoundingClientRect();
  if (rect.bottom < -innerHeight || rect.top > innerHeight * 2) return;
  // Masonry uses the destination height while the viewport clips/reveals the
  // actual post. Neighbors move to that destination on the same duration.
  stage.dataset.layoutHeight = String(after);
  const animation = stage.animate([{ height: `${before}px` }, { height: `${after}px` }], timing);
  stages.set(stage, animation);
  animation.onfinish = () => { if (stages.get(stage) === animation) clearStage(stage); };
  animation.oncancel = () => { if (stages.get(stage) === animation) { stages.delete(stage); delete stage.dataset.layoutHeight; } };
}
export function finishNoteAnimation(section) {
  const current = noteAnimations.get(section);
  if (!current) return;
  noteAnimations.delete(section); delete section.dataset.layoutHeight;
  current.animation.onfinish = null; current.animation.oncancel = null;
  section.hidden = !current.open; current.animation.cancel();
}
export function setNoteVisibility(section, open, prepare) {
  const current = noteAnimations.get(section);
  if (current?.open === open || (!current && section.hidden === !open)) { section.dataset.noteOpen = String(open); prepare?.(); return; }
  const style = getComputedStyle(section), hidden = section.hidden;
  const offset = section.closest('.cards')?.dataset.sideNotes === 'true' ? 'translateX(-8px)' : 'translateY(-8px)';
  const from = { height: `${hidden ? 0 : section.getBoundingClientRect().height}px`, paddingTop: hidden ? '0px' : style.paddingTop, paddingBottom: hidden ? '0px' : style.paddingBottom, borderBottomWidth: hidden ? '0px' : style.borderBottomWidth, opacity: hidden ? 0 : style.opacity, transform: hidden ? offset : style.transform };
  finishNoteAnimation(section); section.dataset.noteOpen = String(open); section.hidden = false; prepare?.();
  const full = getComputedStyle(section), height = section.offsetHeight;
  const to = { height: `${open ? height : 0}px`, paddingTop: open ? full.paddingTop : '0px', paddingBottom: open ? full.paddingBottom : '0px', borderBottomWidth: open ? full.borderBottomWidth : '0px', opacity: open ? 1 : 0, transform: open ? 'translate(0)' : offset };
  const rect = section.getBoundingClientRect();
  if (reducedMotion.matches || !section.isConnected || rect.bottom < 0 || rect.top > innerHeight) { section.hidden = !open; return; }
  section.dataset.layoutHeight = String(open ? height : 0);
  const animation = section.animate([from, to], timing);
  noteAnimations.set(section, { animation, open });
  animation.onfinish = () => { if (noteAnimations.get(section)?.animation === animation) finishNoteAnimation(section); };
  animation.oncancel = () => { if (noteAnimations.get(section)?.animation === animation) finishNoteAnimation(section); };
}
function reveal(card, delay = 0) {
  pendingCards.delete(card); entranceObserver.unobserve(card); card.classList.remove('awaiting-reveal');
  const content = card.querySelector('.card-content');
  if (!content || reducedMotion.matches || !card.isConnected) return;
  const animation = content.animate([
    { opacity: 0, transform: 'translateY(12px) scale(.98)' },
    { opacity: 1, transform: 'translateY(0) scale(1)' }
  ], { ...timing, delay, fill: 'backwards' });
  entrances.set(card, animation);
  const clear = () => { if (entrances.get(card) === animation) entrances.delete(card); };
  animation.onfinish = clear; animation.oncancel = clear;
}
const entranceObserver = new IntersectionObserver(entries => {
  let order = 0;
  for (const entry of entries) if (entry.isIntersecting) reveal(entry.target, Math.min(order++ * 30, 120));
}, { rootMargin: '24px 0px' });
const seenCards = new WeakSet();
export function mountCardMotion(cards) {
  for (const card of pendingCards) if (!card.isConnected) { pendingCards.delete(card); entranceObserver.unobserve(card); }
  for (const card of cards) {
    if (seenCards.has(card)) continue;
    seenCards.add(card);
    if (reducedMotion.matches) continue;
    card.classList.add('awaiting-reveal'); pendingCards.add(card); entranceObserver.observe(card);
    card.addEventListener('focusin', () => { if (pendingCards.has(card)) reveal(card); });
  }
}
function finishMotion() {
  for (const stage of stages.keys()) clearStage(stage);
  for (const section of noteAnimations.keys()) finishNoteAnimation(section);
  for (const card of [...pendingCards]) { pendingCards.delete(card); entranceObserver.unobserve(card); card.classList.remove('awaiting-reveal'); }
  for (const animation of entrances.values()) animation.cancel();
  entrances.clear();
}
reducedMotion.addEventListener('change', () => { if (reducedMotion.matches) finishMotion(); });
window.addEventListener('resize', () => { for (const stage of stages.keys()) clearStage(stage); for (const section of noteAnimations.keys()) finishNoteAnimation(section); }, { passive: true });

// Lets a surface glide to its new size whenever its content changes it, instead of jumping.
// The observer pauses during a glide so its own frames don't count as changes; resuming
// re-checks the size, so content that changed mid-glide gets a follow-up.
export function glideSize(element, { enabled = () => true, duration = 260 } = {}) {
  let last = null, running = null;
  const size = () => { const { width, height } = element.getBoundingClientRect(); return { width, height }; };
  const start = (from, to) => {
    const overflow = element.style.overflow; element.style.overflow = 'hidden';
    observer.unobserve(element);
    running = element.animate([{ width: `${from.width}px`, height: `${from.height}px` }, { width: `${to.width}px`, height: `${to.height}px` }], { duration, easing: timing.easing });
    running.onfinish = running.oncancel = () => { running = null; element.style.overflow = overflow; observer.observe(element); };
    last = to;
  };
  const differs = (a, b) => Math.abs(a.width - b.width) > 1 || Math.abs(a.height - b.height) > 1;
  const observer = new ResizeObserver(() => {
    const now = size();
    if (!now.height) { last = null; return; }
    if (last && differs(last, now) && enabled() && !reducedMotion.matches) start(last, now);
    else last = now;
  });
  observer.observe(element);
  return {
    // Reverses a glide already under way (hovering off mid-expand) from where it has got to.
    change(update) {
      if (!running) { update(); return; }
      const from = size(), active = running;
      active.onfinish = active.oncancel = null; active.cancel(); running = null; element.style.overflow = '';
      update();
      const to = size();
      if (differs(from, to) && to.height) start(from, to); else { last = to; observer.observe(element); }
    }
  };
}
