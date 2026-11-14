let current;
export function closeAccountMenu(restoreFocus = false) {
  if (!current) return;
  const { menu, trigger } = current; current = null; menu.remove();
  if (restoreFocus && trigger.isConnected) trigger.focus({ preventScroll: true });
}
// host is where the menu goes: inside a modal dialog, so it shows above the page rather than behind it.
export function openAccountMenu(trigger, items, point, label = 'Account options', host = document.body) {
  closeAccountMenu();
  const menu = document.createElement('div'); menu.className = 'select-menu account-menu';
  menu.setAttribute('role', 'menu'); menu.setAttribute('aria-label', label);
  for (const item of items) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'account-menu-item';
    if (item.danger) button.classList.add('danger');
    button.setAttribute('role', 'menuitem'); button.textContent = item.label; button.disabled = !!item.disabled;
    button.onclick = () => { closeAccountMenu(); item.run(); };
    menu.append(button);
  }
  host.append(menu); current = { menu, trigger };
  const rect = trigger.getBoundingClientRect(), box = menu.getBoundingClientRect();
  menu.style.left = `${Math.max(8, Math.min(point?.x ?? rect.left, innerWidth - box.width - 8))}px`;
  menu.style.top = `${Math.max(8, Math.min(point?.y ?? rect.bottom, innerHeight - box.height - 8))}px`;
  menu.tabIndex = -1; (menu.querySelector('button:not(:disabled)') || menu).focus({ preventScroll: true });
  menu.onkeydown = event => {
    const buttons = [...menu.querySelectorAll('button:not(:disabled)')], index = buttons.indexOf(document.activeElement);
    if (event.key === 'Escape' || event.key === 'Tab') { if (event.key === 'Escape') event.preventDefault(); event.stopPropagation(); closeAccountMenu(true); }
    else if (['ArrowDown','ArrowUp','Home','End'].includes(event.key)) {
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length-1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next]?.focus();
    }
  };
}
document.addEventListener('pointerdown', event => { if (current && !current.menu.contains(event.target)) closeAccountMenu(); }, true);
window.addEventListener('scroll', () => closeAccountMenu(), true);
window.addEventListener('resize', () => closeAccountMenu());
window.addEventListener('blur', () => closeAccountMenu());
