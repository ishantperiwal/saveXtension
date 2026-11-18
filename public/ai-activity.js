const ITEMS_KEY = 'savex-ai-activity';
const DISMISSED_KEY = 'savex-ai-dismissed';
const MAX_PERSISTED = 40;
const MAX_DISMISSED = 120;

const isActive = state => state === 'running' || state === 'waiting';

function readStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch { /* Persistence is best-effort. */ }
}

/**
 * Manages the bottom-right AI activity nudge card, tracking active and finished
 * AI tasks as persistent list items until the user explicitly dismisses them.
 */
// Leaving slides right, like the sync notifications, and arriving slides in from the right.
const OUT = [{ transform: 'none', opacity: 1 }, { transform: 'translateX(calc(100% + 32px))', opacity: 0 }];
const OUT_TIMING = { duration: 240, easing: 'cubic-bezier(.4,0,.8,.6)', fill: 'forwards' };
const settle = animation => animation.finished.catch(() => {});

export function createAiActivity({ container, esc, icon, dotLoader, resolvePostLabel, onAction, isDialogOpen, onChange, onDismiss }) {
  const items = new Map();
  const dismissedRefs = new Set();
  const pendingAnnouncements = [];
  let lastRenderKey = '';
  let lastOutsideFocus = null;
  // Collapsed until the mouse comes near it or it gets focus, and collapsed again when it leaves (user's decision), like the
  // sync notification. The area that counts as near reaches past its edges, so it's easy to open.
  let expanded = false, hovered = false;
  let activeAnimations = [];
  let toggling = false, leaving = 0, cardOut = null;
  const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  function stopAnimations() {
    for (const anim of activeAnimations) {
      anim.onfinish = null;
      anim.oncancel = null;
      anim.cancel();
    }
    activeAnimations = [];
    if (container) delete container.dataset.collapsing;
  }

  function animateToggle(opening) {
    if (!container || container.hidden || reducedMotion()) return;
    stopAnimations();
    const from = container.getBoundingClientRect();
    if (!from.width || !from.height) return;
    expanded = opening;
    toggling = true; render(); toggling = false;
    const panel = container.querySelector('#ai-toast-panel');
    const to = container.getBoundingClientRect();
    if (!to.width || !to.height) return;
    const stillPill = rect => `${Math.round(rect.height / 2)}px`;
    const fromRadius = opening ? stillPill(from) : '18px';
    const toRadius = opening ? '18px' : stillPill(to);
    const motion = { duration: opening ? 280 : 240, easing: 'cubic-bezier(.22, .68, .2, 1)' };

    if (!opening && panel) {
      container.dataset.collapsing = 'true';
      panel.hidden = false;
    }

    const boxAnim = container.animate(
      [
        { width: `${from.width}px`, height: `${from.height}px`, borderRadius: fromRadius },
        { width: `${to.width}px`, height: `${to.height}px`, borderRadius: toRadius },
      ],
      motion,
    );
    activeAnimations.push(boxAnim);

    if (panel) {
      const panelAnim = panel.animate(
        opening
          ? [{ opacity: 0, transform: 'translateY(-6px)' }, { opacity: 1, transform: 'translateY(0)' }]
          : [{ opacity: 1, transform: 'translateY(0)' }, { opacity: 0, transform: 'translateY(-4px)' }],
        opening
          ? { duration: 190, delay: 75, easing: 'ease-out', fill: 'backwards' }
          : { duration: 120, easing: 'ease-in', fill: 'forwards' },
      );
      activeAnimations.push(panelAnim);
    }

    const finish = () => {
      for (const anim of activeAnimations) { anim.onfinish = null; anim.oncancel = null; anim.cancel(); }
      activeAnimations = [];
      if (container) delete container.dataset.collapsing;
      if (!opening && panel?.isConnected) panel.hidden = true;
    };
    boxAnim.onfinish = finish;
    boxAnim.oncancel = () => {
      activeAnimations = [];
      if (container) delete container.dataset.collapsing;
    };
  }

  for (const ref of readStorage(DISMISSED_KEY, [])) {
    if (typeof ref === 'string' && ref) dismissedRefs.add(ref);
  }
  for (const saved of readStorage(ITEMS_KEY, [])) {
    if (!saved || typeof saved.key !== 'string' || !['done', 'failed'].includes(saved.state)) continue;
    if (saved.serverRef && dismissedRefs.has(saved.serverRef)) continue;
    items.set(saved.key, { ...saved, persisted: true });
  }

  function persist() {
    const finished = [...items.values()]
      .filter(item => item.state === 'done' || item.state === 'failed')
      .slice(-MAX_PERSISTED)
      .map(({ key, serverRef, kind, state, loaderKind, title, detail, postId, documentId, documentTitle, changeId, canUndo, undone, searchQuery, createdAt }) => ({
        key, serverRef, kind, state, loaderKind, title, detail, postId, documentId, documentTitle, changeId, canUndo: !!canUndo, undone: !!undone, searchQuery, createdAt,
      }));
    writeStorage(ITEMS_KEY, finished);
    writeStorage(DISMISSED_KEY, [...dismissedRefs].slice(-MAX_DISMISSED));
  }

  function announce(text, hasActions) {
    if (!text) return;
    if (isDialogOpen?.()) {
      pendingAnnouncements.push({ text, hasActions });
      return;
    }
    if (typeof document.ariaNotify === 'function') {
      document.ariaNotify(hasActions ? `${text}. Actions available` : text);
    }
    const live = container?.querySelector('.ai-toast-live');
    if (live) live.textContent = hasActions ? `${text}. Actions available` : text;
  }

  function flushAnnouncements() {
    if (!pendingAnnouncements.length || isDialogOpen?.()) return;
    const latest = pendingAnnouncements.pop();
    pendingAnnouncements.length = 0;
    announce(latest.text, latest.hasActions);
  }

  function itemActions(item) {
    const actions = [];
    if (isActive(item.state)) {
      if (item.postId) actions.push({ id: 'show-post', label: 'Show post' });
      else if (item.documentId) actions.push({ id: 'open-document', label: 'Open document' });
      else if (item.kind === 'organize') actions.push({ id: 'open-organize', label: 'Open' });
      else if (item.kind === 'search') actions.push({ id: 'show-search', label: 'Show' });
      if (item.cancellable) actions.push({ id: 'cancel', label: item.kind === 'search' || item.kind === 'organize' ? 'Stop' : 'Cancel' });
      return actions;
    }
    if (item.state === 'done') {
      if (item.documentId) actions.push({ id: 'open-document', label: 'Open document', primary: true });
      if (item.postId) actions.push({ id: 'show-post', label: 'Show post' });
      if (item.kind === 'organize') actions.push({ id: 'open-organize', label: 'Open' });
      if (item.kind === 'search') actions.push({ id: 'show-search', label: 'Show' });
      // Undo is hidden here for now (user's decision, 2026-11-18). It's still on the note itself and in the document's history.
      return actions;
    }
    if (item.documentId && item.kind !== 'document') actions.push({ id: 'open-document', label: 'Open document' });
    if (item.postId) actions.push({ id: 'show-post', label: 'Show post' });
    if (item.kind === 'organize') actions.push({ id: 'open-organize', label: 'Open' });
    return actions;
  }

  function itemIcon(item) {
    if (item.state === 'running') return dotLoader(item.loaderKind || 'write', 'tiny');
    if (item.state === 'waiting') return icon('clock');
    if (item.state === 'done') return icon('check');
    return icon('warning');
  }

  function itemMarkup(item) {
    const active = isActive(item.state);
    const actions = itemActions(item);
    const postLabel = item.postId ? resolvePostLabel?.(item.postId) || '' : '';
    const detail = item.detail || postLabel;
    const subline = item.detail && postLabel && item.detail !== postLabel ? postLabel : '';
    const actionButtons = actions.map(action => `<button type="button" class="ai-toast-btn${action.primary ? ' is-primary' : ''}" data-ai-action="${action.id}">${esc(action.label)}</button>`).join('');
    const dismissButton = active ? '' : `<button type="button" class="icon-button ai-toast-dismiss" data-ai-dismiss aria-label="Dismiss ${esc(item.title)}" title="Dismiss">${icon('close')}</button>`;
    return `<li class="ai-toast-item" data-ai-key="${esc(item.key)}" data-state="${esc(item.state)}" data-tone="${item.state === 'failed' ? 'warning' : active ? 'active' : 'success'}">
      <div class="ai-toast-icon" aria-hidden="true">${itemIcon(item)}</div>
      <div class="ai-toast-body">
        <div class="ai-toast-top"><strong class="ai-toast-title">${esc(item.title)}</strong>${dismissButton}</div>
        ${detail ? `<p class="ai-toast-detail">${esc(detail)}</p>` : ''}
        ${subline ? `<p class="ai-toast-subline">${esc(subline)}</p>` : ''}
        ${actionButtons ? `<div class="ai-toast-actions">${actionButtons}</div>` : ''}
      </div>
    </li>`;
  }

  const sorted = () => [...items.values()].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  // Every change also reaches onChange, so the sidebar's AI activity list stays the same as this card.
  function render() {
    renderCard();
    onChange?.(sorted());
  }

  function renderCard() {
    // While rows slide out, the card waits and is redrawn once they're gone.
    if (!container || leaving) return;
    const list = sorted();
    if (!list.length) {
      stopAnimations();
      expanded = false;
      if (!container.hidden) {
        container.hidden = true;
        container.dataset.expanded = 'false';
        container.replaceChildren();
        lastRenderKey = '';
      }
      expanded = false; hovered = false;
      container.getAnimations().forEach(animation => animation.cancel());
      return;
    }
    const activeCount = list.filter(item => isActive(item.state)).length;
    const failedCount = list.filter(item => item.state === 'failed').length;
    const doneCount = list.length - activeCount - failedCount;
    const dismissibleCount = list.length - activeCount;
    const summaryParts = [];
    if (activeCount) summaryParts.push(`${activeCount} running`);
    if (doneCount) summaryParts.push(`${doneCount} done`);
    if (failedCount) summaryParts.push(`${failedCount} failed`);
    const headLead = activeCount ? dotLoader('write', 'tiny') : failedCount ? icon('warning') : icon('sparkle');
    const summaryText = summaryParts.join(' · ');
    const toggleAria = `AI activity: ${summaryText}. ${expanded ? 'Collapse' : 'Expand'}`;
    // Only once it's open: on the collapsed pill it would move away as the hover opens it.
    const clearButton = expanded && dismissibleCount > 0
      ? '<button type="button" class="ai-toast-clear" data-ai-clear title="Clear finished notifications">Clear done</button>'
      : '';
    const markup = `<div class="ai-toast-head"><button type="button" class="ai-toast-toggle" data-ai-toggle aria-expanded="${expanded}" aria-controls="ai-toast-panel" aria-label="${esc(toggleAria)}"><span class="ai-toast-brand" aria-hidden="true">${headLead}</span><strong class="ai-toast-heading">AI</strong><span class="ai-toast-summary">${esc(summaryText)}</span><span class="ai-toast-chevron" aria-hidden="true">${icon('chevron')}</span></button>${clearButton}</div><div id="ai-toast-panel" class="ai-toast-panel"${expanded ? '' : ' hidden'}><ul class="ai-toast-list" role="list">${list.map(itemMarkup).join('')}</ul></div><span class="sr-only ai-toast-live" aria-live="polite"></span>`;
    const arriving = container.hidden;
    const from = arriving || toggling || reducedMotion() ? null : container.getBoundingClientRect();
    container.hidden = false;
    container.dataset.expanded = String(expanded);
    container.dataset.state = activeCount ? 'active' : failedCount ? 'warning' : 'done';
    if (markup === lastRenderKey) return;
    if (!toggling) stopAnimations();
    lastRenderKey = markup;

    const focused = container.contains(document.activeElement) ? document.activeElement : null;
    const focusKey = focused?.closest?.('[data-ai-key]')?.dataset.aiKey || '';
    const focusAttr = focused?.dataset.aiAction ? `[data-ai-action="${focused.dataset.aiAction}"]`
      : focused?.hasAttribute('data-ai-dismiss') ? '[data-ai-dismiss]'
      : focused?.hasAttribute('data-ai-toggle') ? '[data-ai-toggle]'
      : focused?.hasAttribute('data-ai-clear') ? '[data-ai-clear]' : '';

    container.innerHTML = markup;

    if (arriving && !reducedMotion()) container.animate([{ opacity: 0, transform: 'translateX(calc(100% + 32px))' }, { opacity: 1, transform: 'none' }], { duration: 320, easing: 'cubic-bezier(.22,.68,.2,1)' });
    // A row arriving, leaving or growing changes the card's size, so it eases to the new one instead of jumping.
    const to = from && container.getBoundingClientRect();
    if (to && from.width && (Math.abs(to.height - from.height) > 1 || Math.abs(to.width - from.width) > 1)) {
      const resize = container.animate([{ width: `${from.width}px`, height: `${from.height}px` }, { width: `${to.width}px`, height: `${to.height}px` }], { duration: 240, easing: 'cubic-bezier(.22,.68,.2,1)' });
      activeAnimations.push(resize);
      const panel = container.querySelector('#ai-toast-panel');
      if (panel && to.height > from.height) activeAnimations.push(panel.animate([{ opacity: .4 }, { opacity: 1 }], { duration: 200, easing: 'ease-out' }));
    }

    if (focusAttr) {
      const target = focusKey
        ? container.querySelector(`[data-ai-key="${CSS.escape(focusKey)}"] ${focusAttr}`)
        : container.querySelector(focusAttr);
      target?.focus({ preventScroll: true });
    }
  }

  function upsert(entry) {
    if (!entry?.key) return null;
    if (entry.serverRef && dismissedRefs.has(entry.serverRef)) {
      if (!isActive(entry.state)) return null;
      // Server job IDs restart from low counters or may be reused across sessions; an active job is always new work.
      dismissedRefs.delete(entry.serverRef);
    }
    if (entry.serverRef) {
      const existing = [...items.values()].find(item => item.serverRef === entry.serverRef && item.key !== entry.key);
      if (existing) {
        items.set(existing.key, { ...existing, ...entry, key: existing.key });
        persist();
        render();
        return items.get(existing.key);
      }
    }
    const prev = items.get(entry.key);
    const next = {
      createdAt: prev?.createdAt || Date.now(),
      ...prev,
      ...entry,
      persisted: false,
    };
    items.set(next.key, next);
    if (!isActive(next.state) && (!prev || isActive(prev.state))) {
      announce(next.detail ? `${next.title}: ${next.detail}` : next.title, itemActions(next).length > 0);
    }
    persist();
    render();
    return next;
  }

  // Dismissed items leave the data at once, so the sidebar and cards update straight away, and slide out of the card
  // first: one row on its own, or the whole card when nothing would be left. The card is redrawn once they're gone.
  async function slideOut(keys) {
    if (!container || container.hidden || reducedMotion()) return;
    if (!items.size) { cardOut = container.animate(OUT, OUT_TIMING); await settle(cardOut); return; }
    if (!expanded) return;
    const rows = keys.map(key => container.querySelector(`[data-ai-key="${CSS.escape(key)}"]`)).filter(Boolean);
    await Promise.all(rows.map(row => settle(row.animate(OUT, { ...OUT_TIMING, duration: 220 }))));
  }
  function take(keys, { rememberDismissal = true, focus = null } = {}) {
    const gone = [];
    for (const key of keys) {
      const item = items.get(key);
      if (!item) continue;
      if (rememberDismissal && (item.serverRef || item.key)) dismissedRefs.add(item.serverRef || item.key);
      items.delete(key);
      gone.push(item);
    }
    if (!gone.length) return;
    // What's ticked off moves to Processed today.
    if (rememberDismissal) onDismiss?.(gone.filter(item => item.state === 'done'));
    persist();
    onChange?.(sorted());
    leaving++;
    void slideOut(gone.map(item => item.key)).then(() => {
      leaving--;
      if (leaving) return;
      renderCard();
      // If something arrived while the card slid away, it comes back in place.
      cardOut?.cancel(); cardOut = null;
      focus?.();
    });
  }

  function remove(key, { rememberDismissal = true } = {}) {
    const existing = items.get(key);
    if (!existing) return;
    const focusInside = container?.contains(document.activeElement);
    const row = focusInside ? document.activeElement.closest('[data-ai-key]') : null;
    const siblingKey = row?.dataset.aiKey === key
      ? (row.nextElementSibling?.dataset.aiKey || row.previousElementSibling?.dataset.aiKey || '')
      : '';
    take([key], { rememberDismissal, focus: focusInside ? () => {
      const nextTarget = siblingKey
        ? container.querySelector(`[data-ai-key="${CSS.escape(siblingKey)}"] :is([data-ai-dismiss], .ai-toast-btn)`)
        : container.querySelector('[data-ai-clear], [data-ai-toggle], .ai-toast-btn, [data-ai-dismiss]');
      if (nextTarget) nextTarget.focus({ preventScroll: true });
      else if (lastOutsideFocus?.isConnected) lastOutsideFocus.focus({ preventScroll: true });
    } : null });
  }

  function clearFinished() {
    const focusInside = container?.contains(document.activeElement);
    take([...items.values()].filter(item => !isActive(item.state)).map(item => item.key), { focus: focusInside ? () => {
      const remaining = container.querySelector('.ai-toast-btn, [data-ai-toggle]');
      if (remaining) remaining.focus({ preventScroll: true });
      else if (lastOutsideFocus?.isConnected) lastOutsideFocus.focus({ preventScroll: true });
    } : null });
  }

  function dismissAll() {
    const focusInside = container?.contains(document.activeElement);
    take([...items.keys()], { focus: focusInside ? () => { if (lastOutsideFocus?.isConnected) lastOutsideFocus.focus({ preventScroll: true }); } : null });
  }

  function removeMatching(predicate, options) {
    for (const [key, item] of items) {
      if (predicate(item)) remove(key, options);
    }
  }

  function isDismissed(serverRef) {
    return Boolean(serverRef && dismissedRefs.has(serverRef));
  }

  document.addEventListener('focusin', event => {
    if (container && !container.contains(event.target)) lastOutsideFocus = event.target;
  });

  const NEAR = { left: 32, top: 24, right: 24, bottom: 24 };
  function setOpen(open) {
    if (open === expanded || !container || container.hidden) return;
    if (reducedMotion()) { expanded = open; render(); } else animateToggle(open);
  }
  function near(x, y) {
    if (!container || container.hidden) return false;
    const box = container.getBoundingClientRect();
    return x >= box.left - NEAR.left && x <= box.right + NEAR.right && y >= box.top - NEAR.top && y <= box.bottom + NEAR.bottom;
  }
  // Opening waits a moment and closing waits longer, so passing the mouse across it, or slipping out and back, doesn't flicker it.
  const OPEN_DELAY = 80, CLOSE_DELAY = 100;
  let settleTimer = 0;
  function pointerAt(x, y) {
    const now = near(x, y);
    if (now === hovered) return;
    hovered = now;
    clearTimeout(settleTimer);
    settleTimer = setTimeout(() => {
      if (hovered) setOpen(true);
      else if (!container.contains(document.activeElement)) setOpen(false);
    }, now ? OPEN_DELAY : CLOSE_DELAY);
  }
  let frame = 0, point = null;
  document.addEventListener('pointermove', event => {
    if (event.pointerType !== 'mouse') return;
    point = event;
    if (!frame) frame = requestAnimationFrame(() => { frame = 0; pointerAt(point.clientX, point.clientY); });
  }, { passive: true });
  document.documentElement.addEventListener('mouseleave', () => pointerAt(-1e5, -1e5));
  container?.addEventListener('focusin', () => setOpen(true));
  container?.addEventListener('focusout', () => queueMicrotask(() => { if (!hovered && !container.contains(document.activeElement)) setOpen(false); }));
  document.addEventListener('pointerdown', event => { if (container && !hovered && !container.contains(event.target)) setOpen(false); }, { passive: true });

  container?.addEventListener('click', event => {
    const toggle = event.target.closest?.('[data-ai-toggle]');
    if (toggle) {
      event.preventDefault();
      if (reducedMotion()) {
        expanded = !expanded;
        render();
      } else {
        animateToggle(!expanded);
      }
      return;
    }
    const clear = event.target.closest?.('[data-ai-clear]');
    if (clear) {
      event.preventDefault();
      clearFinished();
      return;
    }
    const row = event.target.closest?.('[data-ai-key]');
    if (!row) return;
    const item = items.get(row.dataset.aiKey);
    if (!item) return;
    if (event.target.closest?.('[data-ai-dismiss]')) {
      event.preventDefault();
      remove(item.key);
      return;
    }
    const action = event.target.closest?.('[data-ai-action]');
    if (action) {
      event.preventDefault();
      void onAction?.(action.dataset.aiAction, item, action);
    }
  });

  container?.addEventListener('keydown', event => {
    if (event.key === 'Escape' && expanded) {
      event.preventDefault();
      event.stopPropagation();
      if (reducedMotion()) {
        expanded = false;
        render();
      } else {
        animateToggle(false);
      }
      container.querySelector('[data-ai-toggle]')?.focus({ preventScroll: true });
    }
  });

  render();

  return {
    upsert,
    remove,
    removeMatching,
    clearFinished,
    dismissAll,
    isDismissed,
    render,
    flushAnnouncements,
    list: sorted,
    has: key => items.has(key),
    get: key => items.get(key),
    isExpanded: () => expanded,
    setExpanded: value => { expanded = Boolean(value); render(); },
  };
}
