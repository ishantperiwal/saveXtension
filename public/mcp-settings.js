import { enhanceSelects } from './select.js';
export function clientSetup(client, url) {
  if (client === 'claude-code') return `claude mcp add --transport http --scope user savextension ${url}`;
  if (client === 'codex') return `codex mcp add savextension --url ${url}`;
  if (client === 'vscode') return JSON.stringify({ servers: { savextension: { type: 'http', url } } }, null, 2);
  if (client === 'opencode-v2') return JSON.stringify({ $schema: 'https://opencode.ai/config.json', mcp: { servers: { savextension: { type: 'remote', url, oauth: false } } } }, null, 2);
  return JSON.stringify({ $schema: 'https://opencode.ai/config.json', mcp: { savextension: { type: 'remote', url, enabled: true, oauth: false } } }, null, 2);
}
const promptClients = [
  { id: 'opencode', label: 'OpenCode' },
  { id: 'claude-code', label: 'Claude Code' },
  { id: 'codex', label: 'Codex' },
  { id: 'vscode', label: 'VS Code' }
];
export function connectionPrompt(client, url) {
  const label = promptClients.find(item => item.id === client)?.label || client;
  const setup = {
    opencode: 'Detect my OpenCode version before editing its configuration. For v1, use mcp.savextension with type "remote", url, enabled: true and oauth: false. For v2, use mcp.servers.savextension with type "remote", url and oauth: false; do not add the v1 enabled field.',
    'claude-code': `Use Claude Code’s MCP configuration. The CLI setup command is: ${clientSetup(client, url)}`,
    codex: `Use Codex’s MCP configuration. The CLI setup command is: ${clientSetup(client, url)}`,
    vscode: 'Use VS Code’s MCP configuration, with servers.savextension set to type "http" and the URL above.'
  }[client] || '';
  return `Connect ${label} to my local saveXtension MCP server on this computer.

Server name: savextension
Transport: Streamable HTTP
URL: ${url}
Authentication: none. Do not add OAuth, passwords or API keys for this server.

${setup}

Add or update only the savextension entry, preserving all other MCP servers and my existing model/provider configuration (including DeepSeek, if configured). Keep the server local. Verify the connection by discovering its tools and calling library_overview, which is read-only. Do not modify my saves, topics or notes during setup. If configuration changes require a reconnect or restart, tell me the exact remaining step; do not claim this session is connected until you have verified it. saveXtension must remain running.`;
}
export async function mountMcpSettings(root, { api, toast, esc, icon }) {
  root.innerHTML = '<h3>MCP</h3><p class="muted" role="status">Loading…</p>';
  let status;
  try { status = await api('/mcp'); } catch (error) { root.innerHTML = `<h3>MCP</h3><p role="alert">${esc(error.message)}</p>`; return; }
  if (!root.isConnected) return;
  if (!status.available) { root.hidden = true; return; }
  root.innerHTML = `<div class="mcp-setting-heading"><div><h3>MCP</h3><p class="muted">Let your LLM read saves and organize topics.</p></div><label class="mcp-switch"><input id="mcp-enabled" type="checkbox" role="switch" aria-label="Enable MCP server" ${status.enabled ? 'checked' : ''}><span aria-hidden="true"></span></label></div><div id="mcp-details" ${status.enabled ? '' : 'hidden'}><div class="mcp-url-row"><input type="text" id="mcp-url" aria-label="MCP server URL" readonly value="${esc(status.url)}"><button type="button" class="secondary" id="copy-mcp-url">Copy URL</button></div><p class="fine-print">Local to this computer. Keep saveXtension running. Archived saves are excluded.</p><div class="mcp-prompt-shortcuts"><p class="mcp-prompt-label">Copy a connection prompt</p><div class="mcp-client-chips" role="group" aria-label="Copy a connection prompt">${promptClients.map(client => `<button type="button" class="mcp-client-chip" data-copy-mcp-prompt="${client.id}" aria-label="Copy ${client.label} connection prompt" title="Copy ${client.label} connection prompt"><span>${client.label}</span>${icon('copy')}</button>`).join('')}</div><p class="fine-print mcp-prompt-hint">Paste into your AI app’s agent chat.</p></div><div id="mcp-prompt-fallback" hidden><label for="mcp-connection-prompt">Connection prompt</label><textarea id="mcp-connection-prompt" rows="7" spellcheck="false" readonly></textarea></div><details class="mcp-setup"><summary>Manual setup</summary><label class="sr-only" for="mcp-client">MCP client</label><select id="mcp-client" aria-label="MCP client"><option value="opencode">OpenCode v1</option><option value="opencode-v2">OpenCode v2</option><option value="claude-code">Claude Code</option><option value="codex">Codex</option><option value="vscode">VS Code</option></select><p class="fine-print" id="mcp-setup-hint"></p><pre id="mcp-client-config" tabindex="0"></pre><button type="button" class="secondary" id="copy-mcp-config">${icon('file')} Copy setup</button><p class="fine-print">The client discovers the tools when it connects. Reads, topic edits and note edits are available; no model API key is needed here.</p></details></div><p class="form-error" id="mcp-error" role="alert"></p>`;
  const find = s => root.querySelector(s), toggle = find('#mcp-enabled');
  toggle.onchange = async () => {
    const requested = toggle.checked; toggle.disabled = true; find('#mcp-error').textContent = '';
    try { status = await api('/mcp', { method:'POST',body:{enabled:requested} }); find('#mcp-details').hidden = !status.enabled; toggle.checked = status.enabled; }
    catch(error) { toggle.checked = status.enabled; find('#mcp-error').textContent = error.message; }
    finally { toggle.disabled = false; }
  };
  async function copy(value, message, prompt = false) {
    find('#mcp-error').textContent = '';
    try { await navigator.clipboard.writeText(value); find('#mcp-prompt-fallback').hidden = true; toast(message); return true; }
    catch {
      if (prompt) {
        const field = find('#mcp-connection-prompt'); field.value = value; find('#mcp-prompt-fallback').hidden = false; field.focus(); field.select();
        find('#mcp-error').textContent = 'Clipboard unavailable. Copy the selected prompt.';
      } else find('#mcp-error').textContent = 'Copy was unavailable. Select and copy the text above.';
      return false;
    }
  }
  for (const button of root.querySelectorAll('[data-copy-mcp-prompt]')) {
    button.onclick = async () => {
      const client = promptClients.find(item => item.id === button.dataset.copyMcpPrompt);
      button.disabled = true;
      try {
        if (await copy(connectionPrompt(client.id, status.url), `${client.label} prompt copied. Paste it into ${client.label}.`, true)) {
          button.classList.add('is-copied'); button.innerHTML = `<span>${client.label}</span>${icon('check')}`;
          setTimeout(() => { if (button.isConnected) { button.classList.remove('is-copied'); button.innerHTML = `<span>${client.label}</span>${icon('copy')}`; } }, 2000);
        }
      } finally { button.disabled = false; }
    };
  }
  find('#copy-mcp-url').onclick = () => copy(status.url,'MCP URL copied.');
  const hints = { opencode:'Merge this into your opencode.json (OpenCode v1).', 'opencode-v2':'Merge this into your opencode.json (OpenCode v2).', 'claude-code':'Run this once in your terminal.', codex:'Run this once in your terminal.', vscode:'Merge this into .vscode/mcp.json.' };
  function update() { const client=find('#mcp-client').value; find('#mcp-client-config').textContent=clientSetup(client,status.url); find('#mcp-setup-hint').textContent=hints[client]; }
  find('#mcp-client').onchange=update; update(); enhanceSelects(root);
  find('#copy-mcp-config').onclick=()=>copy(find('#mcp-client-config').textContent,'MCP setup copied.');
}
