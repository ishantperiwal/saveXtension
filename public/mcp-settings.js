export function connectionPrompt(url) {
  return `Connect this AI app to my local saveXtension MCP server on this computer.

Server name: savextension
Transport: Streamable HTTP
URL: ${url}
Authentication: none. Do not add OAuth, passwords or API keys for this server.

Identify the AI app or harness you are running in and its installed version. Use its supported MCP settings or CLI, checking its current documentation rather than guessing configuration fields. The harness connects to MCP; my selected model does not need to change. If this app cannot connect to a local Streamable HTTP MCP server, explain that limitation. If you cannot edit its configuration, give me the exact minimal setup steps for this app.

Add or update only the savextension entry, preserving all other MCP servers and my existing model/provider configuration (including DeepSeek, if configured). Keep the server local. Verify the connection by discovering its tools and calling library_overview, which is read-only. Do not modify my saves, topics or notes during setup. If configuration changes require a reconnect or restart, tell me the exact remaining step; do not claim this session is connected until you have verified it. saveXtension must remain running.`;
}
export async function mountMcpSettings(root, { api, toast, esc, icon }) {
  root.innerHTML = '<h3>MCP</h3><p class="muted" role="status">Loading…</p>';
  let status;
  try { status = await api('/mcp'); } catch (error) { root.innerHTML = `<h3>MCP</h3><p role="alert">${esc(error.message)}</p>`; return; }
  if (!root.isConnected) return;
  if (!status.available) { root.hidden = true; return; }
  root.innerHTML = `<div class="mcp-setting-heading"><div><h3>MCP</h3><p class="muted">Use your saves in your AI app.</p></div><label class="mcp-switch"><input id="mcp-enabled" type="checkbox" role="switch" aria-label="Enable MCP server" ${status.enabled ? 'checked' : ''}><span aria-hidden="true"></span></label></div><div id="mcp-details" ${status.enabled ? '' : 'hidden'}><div role="group" aria-label="Copy a connection prompt"><button type="button" class="mcp-copy-prompt" data-copy-mcp-prompt><span>Copy connection prompt</span>${icon('copy')}</button></div></div><p class="form-error" id="mcp-error" role="alert"></p>`;
  const find = s => root.querySelector(s), toggle = find('#mcp-enabled');
  toggle.onchange = async () => {
    const requested = toggle.checked; toggle.disabled = true; find('#mcp-error').textContent = '';
    try { status = await api('/mcp', { method:'POST',body:{enabled:requested} }); find('#mcp-details').hidden = !status.enabled; toggle.checked = status.enabled; }
    catch(error) { toggle.checked = status.enabled; find('#mcp-error').textContent = error.message; }
    finally { toggle.disabled = false; }
  };
  async function copy(value) {
    const focused = document.activeElement;
    try {
      try {
        if (window.saveXDesktop?.copyText) await window.saveXDesktop.copyText(value);
        else await navigator.clipboard.writeText(value);
      } catch {
        const field = document.createElement('textarea');
        field.value = value; field.tabIndex = -1; field.setAttribute('aria-hidden', 'true');
        field.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
        // A modal makes outside fields inert; keep the temporary copy field
        // inside the active dialog and restore the button's focus afterward.
        root.append(field);
        try { field.select(); if (!document.execCommand('copy')) throw new Error('Copy unavailable'); }
        finally { field.remove(); focused?.focus({preventScroll:true}); }
      }
      toast('Connection copied', false, 'bottom-center', 'Paste into any MCP-compatible AI app on this computer.');
    } catch { toast('Couldn’t copy. Try again.', true, 'bottom-center'); }
  }
  for (const button of root.querySelectorAll('[data-copy-mcp-prompt]')) {
    button.onclick = async () => {
      const focused = document.activeElement === button;
      button.disabled = true;
      try { await copy(connectionPrompt(status.url)); }
      finally { button.disabled = false; if (focused && document.activeElement === document.body) button.focus({preventScroll:true}); }
    };
  }
}
