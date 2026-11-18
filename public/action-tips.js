// Icon-only buttons across the app get the app's own tooltip in place of the system one, which is slow and plain (user's
// decision, 2026-11-18). It shows after a short pause, to the left of a column of icons, like a card's actions in one-column
// view, and above a button anywhere else. The label is the button's title, held aside while it shows so the system one stays
// away. Buttons with words on them need no tooltip and keep their own.
// So the system tooltip can never show as well, an icon button's title moves to data-tip as soon as it's on the page, or set
// again later, and becomes its aria-label if it has none, so screen readers still have the name.
const SHOW_AFTER = 250, GAP = 8, EDGE = 8;
const iconOnly = el => el.matches?.('button, a, [role="button"]') && !el.textContent.trim() && !!el.querySelector('svg');
const tipped = node => { const el = node?.closest?.('button[data-tip], a[data-tip], [role="button"][data-tip]'); return el && iconOnly(el) ? el : null; };
function adopt(el) {
  const title = el.getAttribute?.('title');
  if (!title || !iconOnly(el)) return;
  el.dataset.tip = title; if (!el.hasAttribute('aria-label')) el.setAttribute('aria-label', title);
  el.removeAttribute('title');
}
export function enableActionTips() {
  const tip = document.createElement('div');
  // A popover sits above everything, open dialogs included, which a plain element on the page can't.
  tip.className = 'action-tip'; tip.setAttribute('role', 'tooltip'); tip.popover = 'manual';
  document.body.append(tip);
  let target = null, timer = 0;
  const label = el => el.dataset.tip || '';
  document.querySelectorAll('[title]').forEach(adopt);
  new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'attributes') { adopt(record.target); continue; }
      for (const node of record.addedNodes) if (node.nodeType === 1) { adopt(node); node.querySelectorAll('[title]').forEach(adopt); }
    }
  }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['title'] });
  function place() {
    if (!target?.isConnected) return hide();
    const box = target.getBoundingClientRect(), size = tip.getBoundingClientRect();
    const rail = target.parentElement, column = !!rail && getComputedStyle(rail).display.includes('flex') && getComputedStyle(rail).flexDirection === 'column' && rail.children.length > 1;
    let left, top, side;
    if (column && box.left - GAP - size.width >= EDGE) { left = box.left - GAP - size.width; top = box.top + box.height / 2 - size.height / 2; side = 'left'; }
    else if (column) { left = box.right + GAP; top = box.top + box.height / 2 - size.height / 2; side = 'right'; }
    else { left = Math.min(Math.max(EDGE, box.left + box.width / 2 - size.width / 2), innerWidth - size.width - EDGE); top = box.top - GAP - size.height; side = 'above'; if (top < EDGE) { top = box.bottom + GAP; side = 'below'; } }
    tip.style.left = `${Math.round(left)}px`; tip.style.top = `${Math.round(top)}px`; tip.dataset.side = side;
  }
  // Once a tooltip shows, the next icon reached soon after reuses it: the same tooltip slides over with the new label
  // (user's decision). Crossing the gap between icons doesn't drop it, and one reached just after it went away shows at once.
  // Leaving, it waits 100ms, then fades out over 100ms rather than vanishing (user's decision).
  const LINGER = 100, FADE = 100, WARM = 450;
  let leaveTimer = 0, closeTimer = 0, warmUntil = 0;
  const open = () => tip.matches(':popover-open');
  function show() {
    const text = target && label(target); if (!text) return;
    clearTimeout(closeTimer);
    const moving = open() && tip.classList.contains('is-shown');
    tip.classList.toggle('is-moving', moving);
    tip.textContent = text;
    if (!open()) { tip.classList.remove('is-shown'); tip.showPopover(); }
    place();
    if (!moving) requestAnimationFrame(() => tip.classList.add('is-shown'));
  }
  function drop() { clearTimeout(timer); target = null; }
  function hide() {
    drop(); clearTimeout(leaveTimer);
    if (!open()) return;
    warmUntil = Date.now() + WARM;
    tip.classList.remove('is-shown', 'is-moving');
    clearTimeout(closeTimer); closeTimer = setTimeout(() => { if (!tip.classList.contains('is-shown') && open()) tip.hidePopover(); }, FADE);
  }
  function enter(el) {
    clearTimeout(leaveTimer);
    if (el === target) return;
    drop(); target = el;
    if (open() || Date.now() < warmUntil) show(); else timer = setTimeout(show, SHOW_AFTER);
  }
  document.addEventListener('pointerover', event => { const el = tipped(event.target); if (el && event.pointerType !== 'touch') enter(el); });
  document.addEventListener('pointerout', event => {
    if (!target || target.contains(event.relatedTarget) || tipped(event.relatedTarget)) return;
    if (!open()) { drop(); return; }
    clearTimeout(leaveTimer); leaveTimer = setTimeout(hide, LINGER);
  });
  for (const type of ['pointerdown', 'scroll', 'keydown', 'blur']) addEventListener(type, () => { if (target) hide(); }, { capture: true, passive: true });
  // Keyboard users get it on focus too, at once.
  document.addEventListener('focusin', event => { const el = tipped(event.target); if (!el || !el.matches(':focus-visible')) return; clearTimeout(leaveTimer); drop(); target = el; show(); });
  document.addEventListener('focusout', event => { if (event.target === target) hide(); });
}
