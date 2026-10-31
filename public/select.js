// Custom select-only comboboxes. Native selects retain form/reset semantics.
const controls = new WeakMap();
let current = null, nextId = 0;
const svg = (path, className = '') => `<svg class="${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
const chevron = svg('<path d="m6 9 6 6 6-6"/>', 'select-chevron');
const check = svg('<path d="m5 12 4 4L19 6"/>');

export function closeSelect(restoreFocus = false) {
  if (!current) return;
  const { button, panel } = current;
  current = null;
  button.setAttribute('aria-expanded', 'false');
  button.removeAttribute('aria-activedescendant');
  panel.remove();
  if (restoreFocus && button.isConnected) button.focus({ preventScroll: true });
}

export function enhanceSelects(root = document, { optionIcon = () => '' } = {}) {
  root.querySelectorAll('select').forEach(select => {
    let control = controls.get(select);
    if (!control) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'select-trigger';
      button.id = `${select.id || `select-${++nextId}`}-trigger`;
      button.setAttribute('role', 'combobox');
      button.setAttribute('aria-label', select.getAttribute('aria-label') || select.name);
      button.setAttribute('aria-haspopup', 'listbox');
      button.setAttribute('aria-expanded', 'false');
      const panelId = `${button.id}-options`;
      button.setAttribute('aria-controls', panelId);
      select.hidden = true; select.tabIndex = -1; select.setAttribute('aria-hidden', 'true');
      select.insertAdjacentElement('afterend', button);
      control = { select, button, panelId, optionIcon };
      controls.set(select, control);
      button.addEventListener('click', () => current?.button === button ? closeSelect() : open(control));
      button.addEventListener('keydown', event => keyboard(event, control));
      select.addEventListener('change', () => update(control));
      select.form?.addEventListener('reset', () => queueMicrotask(() => update(control)));
    }
    update(control);
  });
}

function update(control) {
  const { select, button, optionIcon } = control;
  const option = select.selectedOptions[0];
  button.replaceChildren();
  const mark = optionIcon(select, option?.value);
  if (mark) button.insertAdjacentHTML('beforeend', mark);
  const label = document.createElement('span'); label.className = 'select-value';
  label.textContent = option?.label || ''; button.append(label);
  button.insertAdjacentHTML('beforeend', chevron);
  button.disabled = select.disabled; button.title = select.title;
  if (current?.button === button) {
    const signature = JSON.stringify([...select.options].map(o => [o.value, o.label, o.disabled]));
    if (select.disabled || signature !== current.signature || !button.getClientRects().length) closeSelect();
  }
}

function open(control, initial) {
  closeSelect();
  const { select, button, panelId, optionIcon } = control;
  if (select.disabled || !select.options.length) return;
  const panel = document.createElement('div'); panel.id = panelId;
  panel.className = 'select-menu'; panel.setAttribute('role', 'listbox');
  panel.setAttribute('aria-label', button.getAttribute('aria-label'));
  const options = [...select.options];
  options.forEach((option, index) => {
    const row = document.createElement('div'); row.className = 'select-option';
    row.id = `${panelId}-${index}`; row.setAttribute('role', 'option');
    row.setAttribute('aria-selected', String(option.selected));
    if (option.disabled) row.setAttribute('aria-disabled', 'true');
    const mark = optionIcon(select, option.value);
    if (mark) row.insertAdjacentHTML('beforeend', mark);
    const label = document.createElement('span'); label.textContent = option.label; row.append(label);
    row.insertAdjacentHTML('beforeend', check);
    row.addEventListener('pointermove', () => activate(index));
    row.addEventListener('pointerdown', event => event.preventDefault());
    row.addEventListener('click', () => choose(control, index));
    panel.append(row);
  });
  const dialog = button.closest('dialog[open]');
  (dialog || document.body).append(panel);
  current = { ...control, panel, options, active: -1, signature: JSON.stringify(options.map(o => [o.value, o.label, o.disabled])), typed: '', typedAt: 0 };
  button.setAttribute('aria-expanded', 'true');
  positionMenu();
  activate(initial ?? select.selectedIndex);
}

function positionMenu() {
  if (!current) return;
  const { button, panel } = current;
  if (!button.isConnected) return closeSelect();
  const dialog = button.closest('dialog[open]');
  // Keep modal menus within the dialog, and all other menus within the viewport.
  const bounds = dialog?.getBoundingClientRect() || { left: 0, right: innerWidth, top: 0, bottom: innerHeight };
  const anchor = button.getBoundingClientRect(), gap = 6, inset = 8;
  const clip = button.closest('.filter-fields')?.getBoundingClientRect() || bounds;
  if (anchor.bottom <= Math.max(bounds.top, clip.top) || anchor.top >= Math.min(bounds.bottom, clip.bottom)) return closeSelect();
  const below = bounds.bottom - anchor.bottom - gap - inset, above = anchor.top - bounds.top - gap - inset;
  const up = below < Math.min(240, panel.scrollHeight) && above > below;
  panel.style.maxHeight = `${Math.max(40, Math.min(320, up ? above : below))}px`;
  panel.style.width = `${Math.min(Math.max(anchor.width, 224), bounds.right - bounds.left - inset * 2)}px`;
  panel.style.left = `${Math.max(bounds.left + inset, Math.min(anchor.left, bounds.right - panel.offsetWidth - inset))}px`;
  panel.style.top = `${up ? anchor.top - gap - panel.offsetHeight : anchor.bottom + gap}px`;
}

function activate(index) {
  if (!current || current.options[index]?.disabled || !current.options[index]) return;
  current.active = index;
  [...current.panel.children].forEach((row, i) => row.classList.toggle('is-active', i === index));
  const row = current.panel.children[index];
  current.button.setAttribute('aria-activedescendant', row.id);
  row.scrollIntoView({ block: 'nearest' });
}

function choose(control, index) {
  if (control.select.options[index]?.disabled) return;
  closeSelect(true);
  control.select.selectedIndex = index; update(control);
  control.select.dispatchEvent(new Event('input', { bubbles: true }));
  control.select.dispatchEvent(new Event('change', { bubbles: true }));
}

function keyboard(event, control) {
  const opened = current?.button === control.button;
  if (event.key === 'Tab') { closeSelect(); return; }
  if (event.key === 'Escape' && opened) { event.preventDefault(); event.stopPropagation(); closeSelect(true); return; }
  if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' '].includes(event.key)) {
    event.preventDefault();
    if (!opened) { open(control, event.key === 'Home' ? 0 : event.key === 'End' ? control.select.options.length - 1 : undefined); return; }
    if (event.key === 'Enter' || event.key === ' ') { choose(control, current.active); return; }
    const direction = event.key === 'ArrowUp' || event.key === 'End' ? -1 : 1;
    let next = event.key === 'Home' ? 0 : event.key === 'End' ? current.options.length - 1 : current.active + direction;
    while (current.options[next]?.disabled) next += direction;
    activate(Math.max(0, Math.min(current.options.length - 1, next)));
  } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
    event.preventDefault(); if (!opened) open(control);
    const now = Date.now(); current.typed = (now - current.typedAt < 700 ? current.typed : '') + event.key.toLowerCase(); current.typedAt = now;
    const index = current.options.findIndex(o => !o.disabled && o.label.toLowerCase().startsWith(current.typed));
    if (index >= 0) activate(index);
  }
}

document.addEventListener('pointerdown', event => { if (current && !current.button.contains(event.target) && !current.panel.contains(event.target)) closeSelect(); });
document.addEventListener('focusin', event => { if (current && event.target !== current.button && !current.panel.contains(event.target)) closeSelect(); });
// Background layout and unrelated sidebar scrolling should not dismiss a menu
// between pressing its trigger and choosing an option.
document.addEventListener('scroll', event => {
  if (!current || event.target === current.panel || current.panel.contains(event.target)) return;
  if (event.target === document || event.target instanceof Element && event.target.contains(current.button)) positionMenu();
}, true);
window.addEventListener('resize', positionMenu);
