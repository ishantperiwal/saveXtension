// Read MCP_CONNECTION.md before changing this prompt. Carry the runtime gates
// here too: the receiving client may not have access to this repository.
export function connectionPrompt(url) {
  return `Connect this AI app to my local saveXtension MCP server on this computer.

Server name: savextension
Transport: Streamable HTTP
URL: ${url}
Authentication: none. Do not add OAuth, passwords or API keys for this server.

Proceed with connecting this client now. Client configuration edits are authorized; "do not modify my saves" below applies to library data, not to completing setup. Continue authorized setup unless I explicitly stop you, a required client approval is pending, or a concrete blocker prevents progress. Respect the client's approval requirements.

Use these gates in order. Do not skip a gate because the server is reachable.

1. Identify the client. Determine the actual AI app/harness and installed version from its executable or application metadata, not from the model/provider name. This may be DeepSeek Harness (DSH), OpenCode, Codex, Claude Code, or another client; my selected model does not need to change. Locate its intended config path and scope. If the target is ambiguous, ask one precise question before editing.

2. Establish the schema before writing. Timebox discovery to two minutes: open one authoritative installed schema/reference or official documentation page matching this client's version, and extract its minimal remote Streamable HTTP MCP example. Allow one focused follow-up only if the version or required shape is still unclear. Classify the actual config shape (for example, an object map, wrapped object map, or patch-operation list), including any different structure the client's schema requires. Identify the actual wrapper, operation path, required fields, enable settings and scope precedence. A bare server object is not a valid patch-file entry without evidence from that client's schema. Record the reference and minimal example you will mirror. If the schema remains unverified, write nothing and report the unresolved fact; do not guess configuration fields or continue an open-ended search.

3. Make the minimal change. Mirror that client's minimal working example, adapting only the server name, URL and documented no-auth behavior. Do not invent an authentication switch. Add or update only the savextension entry, preserving all other MCP servers and my existing model/provider configuration (including DeepSeek, if configured), credentials and unrelated settings. Reuse an already-correct entry without rewriting it. Keep the server local. Preserve a local rollback copy or minimal diff without exposing credentials or committing backups. If you cannot edit its configuration, give me the exact minimal setup steps for this app and state that verification is pending.

4. Validate the saved configuration. Re-read what was written and use the client's supported validator or configuration/status command. Confirm the entry was parsed from the intended file and scope. Valid JSON/TOML syntax or a successful file write alone does not validate the client's schema. Diagnose validation errors from the actual output; correct only using verified schema evidence. If unresolved, revert only this attempt's changes without overwriting concurrent edits and report the exact redacted error.

5. Verify registration. Use the client's documented reload/reconnect procedure once per evidenced configuration change. Within 60 seconds, check the client's server status, warnings and tool registry: savextension must be loaded and library_overview registered. A missing tool is a registration failure, not a reason to keep saying "still loading." Do not repeat reloads or waits without new evidence. If an explicit restart or approval cannot be completed in this session, report "Configured; verification pending" with the exact remaining action.

6. Verify through this client. Invoke library_overview using the target client's MCP tooling in the active session, with a 60-second wait budget, and inspect the result for tool/protocol errors. It is read-only. A direct HTTP request, curl check, separate SDK connection or config command succeeding does not prove that this client session can use the server. Do not modify my saves, topics or notes during setup. saveXtension must remain running.

7. Report evidence, not a success assumption. Say "Connected and verified" only after a successful in-client library_overview result. Otherwise use "Configured; verification pending" or "Failed." Include the client/version, reference, config shape and scope/path, validation and registration evidence, elapsed time, exact redacted failure details and the next action. Do not expose credentials or saved-post contents. Do not claim this session is connected until you have verified it.`;
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
