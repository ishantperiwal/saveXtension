import { enhanceSelects } from './select.js';
export function clientSetup(client, url) {
  if (client === 'claude-code') return `claude mcp add --transport http --scope user savextension ${url}`;
  if (client === 'codex') return `codex mcp add savextension --url ${url}`;
  if (client === 'vscode') return JSON.stringify({ servers: { savextension: { type: 'http', url } } }, null, 2);
  if (client === 'opencode-v2') return JSON.stringify({ $schema: 'https://opencode.ai/config.json', mcp: { servers: { savextension: { type: 'remote', url, oauth: false } } } }, null, 2);
  return JSON.stringify({ $schema: 'https://opencode.ai/config.json', mcp: { savextension: { type: 'remote', url, enabled: true, oauth: false } } }, null, 2);
}
export async function mountMcpSettings(root, { api, toast, esc, icon }) {
  root.innerHTML = '<h3>MCP</h3><p class="muted" role="status">Loading…</p>';
  let status;
  try { status = await api('/mcp'); } catch (error) { root.innerHTML = `<h3>MCP</h3><p role="alert">${esc(error.message)}</p>`; return; }
  if (!root.isConnected) return;
  if (!status.available) { root.hidden = true; return; }
  root.innerHTML = `<div class="mcp-setting-heading"><div><h3>MCP</h3><p class="muted">Let your LLM read saves and organize topics.</p></div><label class="mcp-switch"><input id="mcp-enabled" type="checkbox" role="switch" aria-label="Enable MCP server" ${status.enabled ? 'checked' : ''}><span aria-hidden="true"></span></label></div><div id="mcp-details" ${status.enabled ? '' : 'hidden'}><div class="mcp-url-row"><input type="text" id="mcp-url" aria-label="MCP server URL" readonly value="${esc(status.url)}"><button type="button" class="secondary" id="copy-mcp-url">Copy URL</button></div><p class="fine-print">Local to this computer. Keep saveXtension running. Archived saves are excluded.</p><details class="mcp-setup"><summary>Connect a client</summary><label class="sr-only" for="mcp-client">MCP client</label><select id="mcp-client" aria-label="MCP client"><option value="opencode">OpenCode v1</option><option value="opencode-v2">OpenCode v2</option><option value="claude-code">Claude Code</option><option value="codex">Codex</option><option value="vscode">VS Code</option></select><p class="fine-print" id="mcp-setup-hint"></p><pre id="mcp-client-config" tabindex="0"></pre><button type="button" class="secondary" id="copy-mcp-config">${icon('file')} Copy setup</button><p class="fine-print">The client discovers the tools when it connects. Reads, topic edits and note edits are available; no model API key is needed here.</p></details></div><p class="form-error" id="mcp-error" role="alert"></p>`;
  const find = s => root.querySelector(s), toggle = find('#mcp-enabled');
  toggle.onchange = async () => {
    const requested = toggle.checked; toggle.disabled = true; find('#mcp-error').textContent = '';
    try { status = await api('/mcp', { method:'POST',body:{enabled:requested} }); find('#mcp-details').hidden = !status.enabled; toggle.checked = status.enabled; }
    catch(error) { toggle.checked = status.enabled; find('#mcp-error').textContent = error.message; }
    finally { toggle.disabled = false; }
  };
  async function copy(value, message) { try { await navigator.clipboard.writeText(value); toast(message); } catch { find('#mcp-error').textContent = 'Copy was unavailable. Select and copy the text above.'; } }
  find('#copy-mcp-url').onclick = () => copy(status.url,'MCP URL copied.');
  const hints = { opencode:'Merge this into your opencode.json (OpenCode v1).', 'opencode-v2':'Merge this into your opencode.json (OpenCode v2).', 'claude-code':'Run this once in your terminal.', codex:'Run this once in your terminal.', vscode:'Merge this into .vscode/mcp.json.' };
  function update() { const client=find('#mcp-client').value; find('#mcp-client-config').textContent=clientSetup(client,status.url); find('#mcp-setup-hint').textContent=hints[client]; }
  find('#mcp-client').onchange=update; update(); enhanceSelects(root);
  find('#copy-mcp-config').onclick=()=>copy(find('#mcp-client-config').textContent,'MCP setup copied.');
}
