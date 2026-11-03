// Only uses the rendered account switcher. No cookies, credentials or hidden APIs.
(() => {
  if (globalThis.SaveXAccounts) return;
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const handle = value => /^@?[A-Za-z0-9_]{1,30}$/.test(value || '') ? `@${value.replace(/^@/, '')}` : '';
  const current = () => handle(document.querySelector('a[data-testid="AppTabBar_Profile_Link"]')?.getAttribute('href')?.match(/^\/([\w]+)\/?$/)?.[1]);
  const trigger = () => document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"]');
  // Switcher entries are UserCells outside the timeline and sidebar; that holds
  // in every site language. The English label is a fallback for older layouts.
  const switcher = el => el.getAttribute('data-testid') === 'UserCell' && !el.closest('main,[data-testid="sidebarColumn"]') && (el.getAttribute('aria-label') || '').match(/@[A-Za-z0-9_]+/g)?.length === 1;
  const buttons = () => [...document.querySelectorAll('button[aria-label],[role="button"][aria-label]')].filter(el => !el.closest('[hidden],[aria-hidden="true"]') && (switcher(el) || /^Switch to @[A-Za-z0-9_]+$/i.test(el.getAttribute('aria-label'))));
  const targetOf = el => handle(el.getAttribute('aria-label').match(/@([A-Za-z0-9_]+)/)?.[1]);
  function menuOpen() {
    return buttons().length > 0 || [...document.querySelectorAll('a[href="/logout"]')].some(el => !el.closest('[hidden],[aria-hidden="true"]')) || [...document.querySelectorAll('a,button,[role="menuitem"]')].some(el => !el.closest('[hidden],[aria-hidden="true"]') && /^(Add an existing account|Manage accounts|Log out @\w+)$/i.test((el.innerText || el.textContent || '').trim()));
  }
  async function open() {
    const end = Date.now() + 12000;
    while (!current() || !trigger()) { if (Date.now() > end) throw new Error('Sign in to X in Chrome, then try again.'); await delay(250); }
    if (!menuOpen()) trigger().click();
    const deadline = Date.now() + 6000;
    while (!menuOpen()) { if (Date.now() > deadline) throw new Error('Couldn’t read X’s account switcher. Refresh accounts and try again.'); await delay(200); }
    await delay(250);
  }
  async function discover() {
    await open();
    const active = current(), found = new Map([[active.toLowerCase(), { handle: active, name: '' }]]);
    for (const button of buttons()) {
      const h = targetOf(button), name = (button.innerText || button.textContent || '').split(/\n|@/)[0].trim();
      found.set(h.toLowerCase(), { handle: h, name: name.slice(0, 80) });
    }
    trigger()?.click();
    return { active, accounts: [...found.values()] };
  }
  async function choose(value) {
    const target = handle(value); if (!target) throw new Error('Choose a valid X account.');
    if (current().toLowerCase() === target.toLowerCase()) return { requested: false };
    await open();
    const button = buttons().find(el => targetOf(el).toLowerCase() === target.toLowerCase());
    if (!button) throw new Error(`${target} is not signed in to X in this Chrome profile.`);
    button.click(); return { requested: true };
  }
  globalThis.SaveXAccounts = { current, discover, choose };
})();
