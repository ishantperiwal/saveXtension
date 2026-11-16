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
export function createAiActivity({ container, esc, icon, dotLoader, resolvePostLabel, onAction, isDialogOpen, onChange }) {
  const items = new Map();
  const dismissedRefs = new Set();
  const pendingAnnouncements = [];
  let lastRenderKey = '';
  let lastOutsideFocus = null;
  let expanded = false;
  let activeAnimations = [];
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
    render();
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
      if (item.canUndo && !item.undone) actions.push({ id: 'undo', label: 'Undo' });
      return actions;
    }
    if (item.documentId && item.kind !== 'document') actions.push({ id: 'open-document', label: 'Open document' });
    if (item.postId) actions.push({ id: 'show-post', label: 'Show post' });
    if (item.kind === 'organize') actions.push({ id: 'open-organize', label: 'Open' });
    return actions;
  }

  function itemIcon(item) {
    if (item.state === 'running') return dotLoader(item.loaderKind || 'write');
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
    if (!container) return;
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
    const headLead = activeCount ? dotLoader('write') : failedCount ? icon('warning') : icon('sparkle');
    const summaryText = summaryParts.join(' · ');
    const toggleAria = `AI activity: ${summaryText}. ${expanded ? 'Collapse' : 'Expand'}`;
    const clearButton = dismissibleCount > 0
      ? '<button type="button" class="ai-toast-clear" data-ai-clear title="Clear finished notifications">Clear done</button>'
      : '';
    const markup = `<div class="ai-toast-head"><button type="button" class="ai-toast-toggle" data-ai-toggle aria-expanded="${expanded}" aria-controls="ai-toast-panel" aria-label="${esc(toggleAria)}"><span class="ai-toast-brand" aria-hidden="true">${headLead}</span><strong class="ai-toast-heading">AI</strong><span class="ai-toast-summary">${esc(summaryText)}</span><span class="ai-toast-chevron" aria-hidden="true">${icon('chevron')}</span></button>${clearButton}</div><div id="ai-toast-panel" class="ai-toast-panel"${expanded ? '' : ' hidden'}><ul class="ai-toast-list" role="list">${list.map(itemMarkup).join('')}</ul></div><span class="sr-only ai-toast-live" aria-live="polite"></span>`;
    container.hidden = false;
    container.dataset.expanded = String(expanded);
    container.dataset.state = activeCount ? 'active' : failedCount ? 'warning' : 'done';
    if (markup === lastRenderKey) return;
    stopAnimations();
    lastRenderKey = markup;

    const focused = container.contains(document.activeElement) ? document.activeElement : null;
    const focusKey = focused?.closest?.('[data-ai-key]')?.dataset.aiKey || '';
    const focusAttr = focused?.dataset.aiAction ? `[data-ai-action="${focused.dataset.aiAction}"]`
      : focused?.hasAttribute('data-ai-dismiss') ? '[data-ai-dismiss]'
      : focused?.hasAttribute('data-ai-toggle') ? '[data-ai-toggle]'
      : focused?.hasAttribute('data-ai-clear') ? '[data-ai-clear]' : '';

    container.innerHTML = markup;

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

  function remove(key, { rememberDismissal = true } = {}) {
    const existing = items.get(key);
    if (!existing) return;
    if (rememberDismissal && existing.serverRef) dismissedRefs.add(existing.serverRef);
    const focusInside = container?.contains(document.activeElement);
    const row = focusInside ? document.activeElement.closest('[data-ai-key]') : null;
    const siblingKey = row?.dataset.aiKey === key
      ? (row.nextElementSibling?.dataset.aiKey || row.previousElementSibling?.dataset.aiKey || '')
      : '';
    items.delete(key);
    persist();
    render();
    if (focusInside) {
      const nextTarget = siblingKey
        ? container.querySelector(`[data-ai-key="${CSS.escape(siblingKey)}"] :is([data-ai-dismiss], .ai-toast-btn)`)
        : container.querySelector('[data-ai-clear], [data-ai-toggle], .ai-toast-btn, [data-ai-dismiss]');
      if (nextTarget) nextTarget.focus({ preventScroll: true });
      else if (lastOutsideFocus?.isConnected) lastOutsideFocus.focus({ preventScroll: true });
    }
  }

  function clearFinished() {
    const focusInside = container?.contains(document.activeElement);
    for (const [key, item] of items) {
      if (isActive(item.state)) continue;
      if (item.serverRef) dismissedRefs.add(item.serverRef);
      items.delete(key);
    }
    if (!items.size) expanded = false;
    persist();
    render();
    if (focusInside) {
      const remaining = container.querySelector('.ai-toast-btn, [data-ai-toggle]');
      if (remaining) remaining.focus({ preventScroll: true });
      else if (lastOutsideFocus?.isConnected) lastOutsideFocus.focus({ preventScroll: true });
    }
  }

  function dismissAll() {
    const focusInside = container?.contains(document.activeElement);
    for (const item of items.values()) {
      const ref = item.serverRef || item.key;
      if (ref) dismissedRefs.add(ref);
    }
    items.clear();
    expanded = false;
    persist();
    render();
    if (focusInside && lastOutsideFocus?.isConnected) {
      lastOutsideFocus.focus({ preventScroll: true });
    }
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
