// Account passwords stay on the platform's own page. This panel handles only
// public handles and connection state returned by the desktop process.
export function mountSocialAccounts(root, { esc, icon, sourceIcon, onChange = () => {}, platforms = ['x', 'instagram'], expected = {} }) {
  let signature = '', loading = false, timer;
  const name = platform => platform === 'x' ? 'X' : 'Instagram';
  const error = document.createElement('p'); error.className = 'form-error'; error.setAttribute('role', 'alert');
  const content = document.createElement('div'); root.replaceChildren(content, error);
  async function refresh() {
    if (loading || !root.isConnected || root.closest('dialog')?.open === false) return;
    loading = true;
    try {
      const accounts = await window.saveXDesktop.socialAccounts(), next = JSON.stringify(accounts);
      if (next !== signature) {
        signature = next;
        const accountList = `<div class="native-account-list">${accounts.filter(account => platforms.includes(account.platform)).map(account => `<div class="native-account-row">${sourceIcon(account.platform)}<span class="native-account-label"><strong>${esc(account.handle || name(account.platform))}</strong><small>${account.status === 'connected' ? 'Connected' : 'Sign in needed'}</small></span><button class="text-button" data-reconnect="${esc(account.id)}" data-platform="${account.platform}">${account.status === 'connected' ? 'Reconnect' : 'Sign in'}</button><button class="icon-button" data-disconnect="${esc(account.id)}" aria-label="Disconnect ${esc(account.handle || name(account.platform))}">${icon('close')}</button></div>`).join('')}</div>`;
        content.innerHTML = `<div class="button-row native-connect-actions">${platforms.flatMap(platform => {
          const missing = (expected[platform] || []).filter(handle => !accounts.some(account => account.platform === platform && account.handle.toLowerCase() === handle.toLowerCase()));
          return (missing.length ? missing : ['']).map(handle => `<button class="secondary" data-connect="${platform}"${handle ? ` data-expected="${esc(handle)}"` : ''}>${sourceIcon(platform)}${handle ? `Connect ${esc(handle)}` : `Add ${name(platform)} account`}</button>`);
        }).join('')}</div>${accountList}`;
        onChange(accounts);
      }
    } catch (failure) { error.textContent = failure.message; }
    finally { loading = false; clearTimeout(timer); if (root.isConnected && root.closest('dialog')?.open !== false) timer = setTimeout(refresh, 1500); }
  }
  content.addEventListener('click', async event => {
    const button = event.target.closest('button'); if (!button || button.disabled) return;
    button.disabled = true; error.textContent = '';
    try {
      if (button.dataset.disconnect) await window.saveXDesktop.disconnectSocial(button.dataset.disconnect);
      else await window.saveXDesktop.connectSocial({ platform: button.dataset.connect || button.dataset.platform, id: button.dataset.reconnect, expectedHandle: button.dataset.expected });
      await refresh();
    } catch (failure) { error.textContent = failure.message; }
    finally { if (button.isConnected) button.disabled = false; }
  });
  void refresh();
}
