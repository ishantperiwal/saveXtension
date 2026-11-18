import { openAccountMenu } from './account-menu.js';
import { storedMarkdown, editorMarkdown } from './document-markdown.js';
import { fontDecorations, loadStoredFonts } from './document-fonts.js';
import { longBlocks } from './document-long-blocks.js';
import { wordPattern } from './document-search.js';
import { dotLoader } from './dot-loader.js';

// Documents: the person's own pages beside their saves, for what they want to keep and come back to.
// A dark panel docked to the right edge lists them. Closed, only its notch shows; the notch opens and closes it.
// Each one opens in a window with a Word-like editor
// that saves Markdown as you type. The editor (Milkdown Crepe) only loads the first time a document opens.
const EDITOR = '/vendor/editor/editor.js', EDITOR_STYLE = '/vendor/editor/editor-style.css', IMAGE_LIMIT = 15 * 1024 * 1024;
// A filled document, for the notch and the list: the page with its lines cut out and a lighter folded corner.
const DOC_ICON = '<svg class="icon doc-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="M6.5 2H13v5a2.5 2.5 0 0 0 2.5 2.5H20v10A2.5 2.5 0 0 1 17.5 22h-11A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2ZM8 12.2v1.6h8v-1.6H8Zm0 3.8v1.6h5.5V16H8Z"/><path fill="currentColor" opacity=".5" d="M14.5 2.4 19.6 7.5h-4.1a1 1 0 0 1-1-1V2.4Z"/></svg>';
const REFINE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.5 13.9 9l5.6 2-5.6 2-1.9 5.5-1.9-5.5-5.6-2 5.6-2zM19 3v3.5M17.2 4.8h3.6"/></svg>';
const UP_ICON = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5.5 11.5 12 5l6.5 6.5"/></svg>';
const macKeyboard = /Mac|iPhone|iPad|iPod/i.test(navigator.userAgentData?.platform || navigator.platform || '');
let editorModule;
function loadEditor() {
  if (!document.querySelector(`link[href="${EDITOR_STYLE}"]`)) document.head.append(Object.assign(document.createElement('link'), { rel: 'stylesheet', href: EDITOR_STYLE }));
  return editorModule ||= import(EDITOR).catch(error => { editorModule = null; throw error; });
}
async function request(path, { method = 'GET', body, signal } = {}) {
  const res = await fetch(`/api${path}`, { method, signal, credentials: 'same-origin', headers: body === undefined ? {} : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const result = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(result.error || 'That didn’t work. Try again.'), { status: res.status });
  return result;
}
const asBase64 = file => new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1] || ''); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file); });
// The Markdown keeps images/<name>, the same way an exported folder would. Only the page shows it from the server.
// A picture taken from a saved post keeps that post's link after #post=, which stays on the page's address so a click can open the post.
const shownImage = src => { const [path, from] = String(src).split('#'); return /^images\/[a-f0-9]{32}\.(png|jpg|gif|webp)$/.test(path) ? `/api/documents/${path}${from ? `#${from}` : ''}` : src; };
const postOfPicture = img => { try { const link = decodeURIComponent(new URL(img.getAttribute('src') || '', location.href).hash.match(/^#post=(.+)$/)?.[1] || ''); return /^https:\/\//.test(link) ? link : ''; } catch { return ''; } };
const aboutText = description => description ? escapeText(description) : '<span class="document-description-empty">Add what belongs in this document, how entries should be formatted, and what to leave out.</span>';
const escapeText = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const graphemeSegmenter = typeof Intl?.Segmenter === 'function' ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;
const firstGrapheme = value => {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return '';
  return (graphemeSegmenter ? graphemeSegmenter.segment(trimmed)[Symbol.iterator]().next().value?.segment : Array.from(trimmed)[0]) || '';
};
const when = iso => {
  const then = Date.parse(iso), minutes = Math.round((Date.now() - then) / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 1440) return `${Math.round(minutes / 60)} h ago`;
  return new Date(then).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: new Date(then).getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
};

export function mountDocuments({ icon, esc, toast, onActivity, onDialogClose }) {
  // Clicking a picture taken from a saved post opens that post, the way the app opens any post link (user's decision).
  document.addEventListener('click', event => {
    const img = event.target.closest?.('.milkdown img'), link = img && postOfPicture(img);
    if (!link) return;
    event.preventDefault(); event.stopPropagation();
    window.open(link, '_blank', 'noopener');
  }, true);
  document.addEventListener('pointerover', event => {
    const img = event.target.closest?.('.milkdown img');
    if (img && !img.dataset.postChecked) { img.dataset.postChecked = 'true'; if (postOfPicture(img)) { img.classList.add('is-post-picture'); img.title = 'Open the original post'; } }
  });
  if (document.querySelector('.documents-notch')) return;
  const docIcon = doc => doc?.icon ? `<span class="documents-emoji" aria-hidden="true">${esc(doc.icon)}</span>` : DOC_ICON;
  const edge = document.createElement('aside');
  edge.className = 'documents-edge'; edge.dataset.open = 'false'; edge.setAttribute('aria-label', 'Documents');
  const notch = Object.assign(document.createElement('button'), { type: 'button', className: 'documents-notch', title: 'Documents' });
  notch.setAttribute('aria-label', 'Documents'); notch.setAttribute('aria-expanded', 'false');
  // A bump that leaves the edge tangentially at top and bottom, so it eases out of the panel rather than sitting on it.
  notch.innerHTML = `<svg class="documents-notch-shape" viewBox="0 0 26 92" preserveAspectRatio="none" aria-hidden="true"><path d="M26 0C26 24 1 26 1 46C1 66 26 68 26 92Z"/></svg>${DOC_ICON}`;
  const drawer = document.createElement('div');
  drawer.className = 'documents-drawer'; drawer.inert = true;
  drawer.innerHTML = `<header class="documents-drawer-head"><h2>Documents</h2><button class="documents-new-button" type="button" data-doc-action="new" aria-label="New document" title="New document">${icon('plus')}<span>New</span></button></header>
    <input class="documents-filter" type="search" placeholder="Find a document" aria-label="Find a document" autocomplete="off" spellcheck="false">
    <ul class="documents-list" role="list"></ul>`;
  const newModal = document.createElement('dialog');
  newModal.id = 'document-new'; newModal.setAttribute('aria-labelledby', 'document-new-title');
  newModal.innerHTML = `<button class="icon-button modal-close" type="button" data-doc-action="cancel-new" aria-label="Close dialog">${icon('close')}</button>
    <form class="documents-new" novalidate>
      <h2 id="document-new-title">New document</h2>
      <label>Name<input name="title" maxlength="120" autocomplete="off" spellcheck="false" placeholder="Fonts"></label>
      <div class="documents-new-scope">
        <label for="document-new-description">What belongs in it</label>
        <div class="document-scope-box">
          <textarea id="document-new-description" name="description" rows="3" maxlength="600" placeholder="e.g. Fonts worth trying: font name, foundry or creator, link and licence. Leave out general design posts that don’t name a typeface."></textarea>
          <div class="document-scope-foot">
            <button class="document-scope-ai" type="button" data-doc-action="ai-describe-new">${icon('sparkle')}<span>Draft from name</span></button>
          </div>
        </div>
      </div>
      <p class="documents-new-error" role="alert" hidden></p>
      <div class="documents-new-actions"><button class="secondary" type="button" data-doc-action="cancel-new">Cancel</button><button class="primary" type="submit">Create document</button></div>
    </form>`;
  const view = document.createElement('dialog');
  view.id = 'document-view'; view.setAttribute('aria-label', 'Document');
  edge.append(notch, drawer);
  document.body.append(edge, newModal, view);
  const list = drawer.querySelector('.documents-list'), filter = drawer.querySelector('.documents-filter'), form = newModal.querySelector('.documents-new'), newAiButton = form.querySelector('[data-doc-action="ai-describe-new"]');
  let docs = [], open = null, afterCreate = null;

  function syncNewAiLabel(generated = false) {
    if (!newAiButton || newAiButton.disabled) return;
    const hasText = !!form.elements.description.value.trim();
    newAiButton.dataset.generated = String(generated);
    newAiButton.innerHTML = `${icon('sparkle')}<span>${generated ? 'Redraft' : hasText ? 'Refine' : 'Draft from name'}</span>`;
  }
  function renderList() {
    const query = filter.value.trim().toLowerCase(), shown = docs.filter(d => d.title.toLowerCase().includes(query));
    list.innerHTML = shown.length
      ? shown.map(d => `<li class="documents-row"><button class="documents-icon" type="button" data-doc-icon="${d.id}" aria-label="Change icon for ${esc(d.title)}" title="Choose an emoji">${docIcon(d)}</button><button class="documents-item" type="button" data-doc-id="${d.id}"><span class="documents-item-text"><span class="documents-item-title">${esc(d.title)}</span><span class="documents-item-time">${when(d.updatedAt)}</span></span></button><button class="documents-copy" type="button" data-doc-copy="${d.id}" aria-label="Copy reference to ${esc(d.title)}" title="Copy reference for an AI">${icon('copy')}</button></li>`).join('')
      : `<li class="documents-empty">${docs.length ? 'No document has that name.' : 'Keep what you find worth coming back to: repos, fonts, prompts, ideas. Start one with +.'}</li>`;
  }
  async function setDocumentIcon(docId, nextIcon) {
    const listed = docs.find(d => d.id === docId), prevIcon = listed?.icon ?? (open?.id === docId ? open.icon : '') ?? '';
    if (nextIcon === prevIcon) return;
    if (listed) listed.icon = nextIcon;
    if (open?.id === docId) {
      open.icon = nextIcon;
      const headBtn = view.querySelector('.document-head-icon');
      if (headBtn) headBtn.innerHTML = docIcon(open);
    }
    const rowBtn = list.querySelector(`[data-doc-icon="${docId}"]`);
    if (rowBtn) rowBtn.innerHTML = docIcon({ icon: nextIcon });
    try {
      const saved = await request(`/documents/${docId}`, { method: 'PATCH', body: { icon: nextIcon } });
      if (listed) listed.icon = saved.icon || '';
      if (open?.id === docId) open.icon = saved.icon || '';
    } catch (error) {
      if (listed) listed.icon = prevIcon;
      if (open?.id === docId) {
        open.icon = prevIcon;
        const headBtn = view.querySelector('.document-head-icon');
        if (headBtn) headBtn.innerHTML = docIcon(open);
      }
      if (rowBtn) rowBtn.innerHTML = docIcon({ icon: prevIcon });
      toast(error.message, true, 'bottom-center');
    }
  }
  // An invisible text input inside the clicked icon button receives the emoji picked from the native OS emoji panel.
  function pickEmoji(button, docId) {
    let input = button.querySelector('.documents-emoji-input');
    if (!input) {
      input = Object.assign(document.createElement('input'), { type: 'text', className: 'documents-emoji-input', tabIndex: -1 });
      input.setAttribute('aria-hidden', 'true');
      let done = false;
      const closeInput = () => {
        if (done) return;
        done = true;
        input.remove();
      };
      input.addEventListener('input', () => {
        const chosen = firstGrapheme(input.value);
        closeInput();
        if (chosen) void setDocumentIcon(docId, chosen);
      });
      input.addEventListener('keydown', event => {
        if (event.key === 'Backspace' || event.key === 'Delete') {
          event.preventDefault(); event.stopPropagation();
          closeInput();
          void setDocumentIcon(docId, '');
        } else if (event.key === 'Escape') {
          event.preventDefault(); event.stopPropagation();
          closeInput();
          button.focus({ preventScroll: true });
        }
      });
      input.addEventListener('blur', () => closeInput());
      button.append(input);
    }
    input.value = '';
    input.focus({ preventScroll: true });
    void window.saveXDesktop?.showEmojiPanel?.();
  }
  async function refresh() {
    try { docs = (await request('/documents')).documents; renderList(); } catch (error) { list.innerHTML = `<li class="documents-empty">${esc(error.message)}</li>`; }
  }
  const isShown = () => edge.dataset.open === 'true';
  function showDrawer(show = !isShown()) {
    if (!show && drawer.contains(document.activeElement)) document.activeElement.blur();
    edge.dataset.open = String(show); drawer.inert = !show; notch.setAttribute('aria-expanded', String(show)); notch.tabIndex = show ? -1 : 0;
    if (show) void refresh();
  }
  // What to paste into an AI chat so it can find this document through MCP, like a post's Copy reference.
  async function copyReference(button) {
    const doc = docs.find(d => d.id === button.dataset.docCopy); if (!doc) return;
    const reference = `saveXtension document: ${doc.title}${doc.description ? `\nWhat belongs in it: ${doc.description}` : ''}\nRead it with saveXtension MCP read_document: ${JSON.stringify({ documentId: doc.id })}`;
    try {
      if (window.saveXDesktop?.copyText) await window.saveXDesktop.copyText(reference); else await navigator.clipboard.writeText(reference);
      button.innerHTML = icon('check'); button.classList.add('is-copied'); toast('Reference copied', false, 'bottom-center');
      clearTimeout(button.reset); button.reset = setTimeout(() => { button.innerHTML = icon('copy'); button.classList.remove('is-copied'); }, 1500);
    } catch { toast('Couldn’t copy the reference. Try again.', true, 'bottom-center'); }
  }
  function dismissDialog(dialog) {
    if (!dialog.open) return Promise.resolve();
    if (dialog.dataset.closing) return dialog._closingPromise || Promise.resolve();
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      dialog.close();
      return Promise.resolve();
    }
    dialog.dataset.closing = 'true';
    dialog.classList.add('is-closing');
    return (dialog._closingPromise = new Promise(resolve => {
      const finish = () => {
        delete dialog.dataset.closing;
        delete dialog._closingPromise;
        dialog.classList.remove('is-closing');
        if (dialog.open) dialog.close();
        resolve();
      };
      const timer = setTimeout(finish, 200);
      dialog.addEventListener('animationend', event => {
        if (event.target !== dialog) return;
        clearTimeout(timer);
        finish();
      }, { once: true });
    }));
  }
  // A document starts with a name and what belongs in it (user's decision), so anyone adding to it, person or AI, knows its scope.
  function showNewModal(show = true, onCreated = null) {
    afterCreate = show ? onCreated : null;
    form.querySelector('.documents-new-error').hidden = true;
    if (!show) return dismissDialog(newModal);
    if (newModal.dataset.closing) {
      delete newModal.dataset.closing;
      delete newModal._closingPromise;
      newModal.classList.remove('is-closing');
    }
    if (isShown()) showDrawer(false);
    form.reset(); syncNewAiLabel(false);
    if (!newModal.open) newModal.showModal();
    form.elements.title.focus({ preventScroll: true });
  }
  async function describeNewModal() {
    const title = form.elements.title.value.trim(), description = form.elements.description.value.trim(), error = form.querySelector('.documents-new-error');
    error.hidden = true;
    if (!title && !description) { error.textContent = 'Give it a name or jot down a few words first.'; error.hidden = false; form.elements.title.focus(); return; }
    const wasGenerated = newAiButton.dataset.generated === 'true';
    const actionLabel = description && !wasGenerated ? 'Refining document description' : 'Drafting document description';
    const doneLabel = description && !wasGenerated ? 'Refined document description' : 'Drafted document description';
    const activityKey = `doc-describe:new:${Date.now()}`;
    onActivity?.({ key: activityKey, kind: 'document-describe', loaderKind: 'write', state: 'running', title: actionLabel, detail: title || 'New document' });
    newAiButton.disabled = true; newAiButton.innerHTML = `${dotLoader('write')}<span>${description && !wasGenerated ? 'Refining…' : 'Drafting…'}</span>`;
    try {
      const result = await request('/documents/describe', { method: 'POST', body: { title, description } });
      onActivity?.({ key: activityKey, kind: 'document-describe', loaderKind: 'write', state: 'done', title: doneLabel, detail: title || 'New document' });
      form.elements.description.value = result.description;
      form.elements.description.focus();
      newAiButton.disabled = false; syncNewAiLabel(true);
    } catch (failure) {
      onActivity?.({ key: activityKey, kind: 'document-describe', loaderKind: 'write', state: 'failed', title: 'Couldn’t draft description', detail: failure.message });
      error.textContent = failure.message; error.hidden = false;
      newAiButton.disabled = false; syncNewAiLabel(wasGenerated);
    }
  }
  async function create() {
    const title = form.elements.title.value.trim(), description = form.elements.description.value.trim(), error = form.querySelector('.documents-new-error');
    if (!title || !description) { error.textContent = !title ? 'Give it a name.' : 'Say what belongs in it.'; error.hidden = false; (!title ? form.elements.title : form.elements.description).focus(); return; }
    const submit = form.querySelector('button[type="submit"]'); submit.disabled = true;
    try {
      const doc = await request('/documents', { method: 'POST', body: { title, description } });
      const callback = afterCreate;
      await showNewModal(false); docs.unshift(doc); renderList();
      if (callback) await callback(doc);
      else await openDocument(doc.id);
    } catch (failure) { error.textContent = failure.message; error.hidden = false; }
    finally { submit.disabled = false; }
  }
  function confirmDelete(trigger, doc, point) {
    openAccountMenu(trigger, [
      { label: `Delete “${doc.title}”`, danger: true, run: async () => {
        try {
          if (open?.id === doc.id) { open.deleted = true; await closeDocument(); }
          await request(`/documents/${doc.id}`, { method: 'DELETE' }); docs = docs.filter(d => d.id !== doc.id); renderList(); toast('Document deleted');
        } catch (error) { toast(error.message, true); }
      } },
      { label: 'Keep it', run: () => {} },
    ], point, 'Delete document', view.open ? view : document.body);
  }

  notch.addEventListener('click', () => showDrawer());
  filter.addEventListener('input', renderList);
  drawer.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    showDrawer(false); notch.focus();
  });
  form.addEventListener('submit', event => { event.preventDefault(); void create(); });
  form.elements.description.addEventListener('input', () => syncNewAiLabel(false));
  form.elements.description.addEventListener('keydown', event => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); void create(); } });
  newModal.addEventListener('cancel', event => { event.preventDefault(); void showNewModal(false); });
  newModal.addEventListener('click', event => {
    if (event.target.closest('[data-doc-action="ai-describe-new"]')) { void describeNewModal(); return; }
    if (event.target.closest('[data-doc-action="cancel-new"]')) { void showNewModal(false); return; }
    if (event.target === newModal) {
      const box = newModal.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) void showNewModal(false);
    }
  });
  newModal.addEventListener('close', () => { afterCreate = null; });
  drawer.addEventListener('click', event => {
    const action = event.target.closest('[data-doc-action]')?.dataset.docAction, item = event.target.closest('.documents-item');
    if (action === 'new') showNewModal(true);
    if (action === 'hide') showDrawer(false);
    const iconBtn = event.target.closest('[data-doc-icon]');
    if (iconBtn) { void pickEmoji(iconBtn, iconBtn.dataset.docIcon); return; }
    const copy = event.target.closest('[data-doc-copy]');
    if (copy) void copyReference(copy);
    if (item) void openDocument(item.dataset.docId);
  });
  drawer.addEventListener('contextmenu', event => {
    const row = event.target.closest('.documents-row'), id = row?.querySelector('.documents-item')?.dataset.docId, doc = id && docs.find(d => d.id === id); if (!doc) return;
    event.preventDefault();
    openAccountMenu(row, [
      { label: 'Open', run: () => void openDocument(doc.id) },
      ...(doc.icon ? [{ label: 'Reset icon', run: () => void setDocumentIcon(doc.id, '') }] : []),
      { label: 'Delete…', danger: true, run: () => confirmDelete(row, doc, { x: event.clientX, y: event.clientY }) },
    ], { x: event.clientX, y: event.clientY }, 'Document options');
  });
  document.addEventListener('pointerdown', event => { if (isShown() && !view.open && !newModal.open && !edge.contains(event.target) && !event.target.closest('.account-menu')) showDrawer(false); });
  document.addEventListener('keydown', event => {
    if (event.defaultPrevented || event.isComposing || event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
    const active = document.activeElement;
    const typing = event.target?.isContentEditable || active?.isContentEditable || event.target?.closest?.('input, textarea, select, [contenteditable="true"], [contenteditable=""], .ProseMirror') || active?.closest?.('input, textarea, select, [contenteditable="true"], [contenteditable=""], .ProseMirror');
    if (event.key === 'Escape' && isShown() && !typing && !view.open && !newModal.open && !document.querySelector('dialog[open], .account-menu, .collection-picker, .select-menu')) {
      event.preventDefault();
      showDrawer(false);
      return;
    }
    if (event.key.toLowerCase() !== 'd' || typing) return;
    if (view.open || newModal.open || document.querySelector('dialog[open], .account-menu, .collection-picker, .select-menu')) return;
    event.preventDefault();
    showDrawer();
  });

  // One open document at a time. Edits save shortly after typing stops, and always before it closes.
  function setStatus(text, error = false) { const el = view.querySelector('.document-status'); if (el) { el.textContent = text; el.classList.toggle('error', error); } }
  function schedule() { if (!open || open.deleted) return; open.dirty = true; clearTimeout(open.timer); setStatus('Editing…'); open.timer = setTimeout(() => void save(), 700); }
  // Opening a document never rewrites it: only an edit does. A save waits for the one before it, so nothing typed meanwhile is lost.
  async function save(doc = open) {
    if (!doc || doc.deleted) return;
    clearTimeout(doc.timer); doc.timer = null;
    if (doc.saving) { await doc.saving; return save(doc); }
    if (!doc.dirty || doc.conflict) return;
    const body = doc.markdown(), title = doc.titleField.value.trim() || 'Untitled', description = doc.descriptionDraft ?? doc.description;
    doc.dirty = false;
    if (body === doc.body && title === doc.title && description === doc.description) { if (open === doc) setStatus('Saved'); return; }
    if (open === doc) setStatus('Saving…');
    doc.saving = (async () => {
      try {
        const saved = await request(`/documents/${doc.id}`, { method: 'PATCH', body: { title, body, ...(description !== doc.description ? { description } : {}), expectedUpdatedAt: doc.updatedAt } });
        Object.assign(doc, { body: saved.body, title: saved.title, description: saved.description, updatedAt: saved.updatedAt });
        if (doc.descriptionDraft === saved.description) delete doc.descriptionDraft;
        const listed = docs.find(d => d.id === doc.id); if (listed) Object.assign(listed, { title: saved.title, updatedAt: saved.updatedAt });
        if (open === doc && !doc.dirty) setStatus('Saved');
      } catch (error) {
        doc.dirty = true; doc.conflict = error.status === 409;
        if (open !== doc) return;
        setStatus(doc.conflict ? 'Changed somewhere else' : 'Not saved', true);
        for (const button of view.querySelectorAll('.document-conflict')) button.hidden = !doc.conflict;
        if (!doc.conflict) toast(error.message, true, 'bottom-center');
      } finally { doc.saving = null; }
    })();
    return doc.saving;
  }
  async function upload(file) {
    if (file.size > IMAGE_LIMIT) throw new Error('That picture is over 15 MB.');
    return (await request('/documents/images', { method: 'POST', body: { data: await asBase64(file) } })).src;
  }
  // Refine with AI: rewrites the selected text the way the person asks, using the AI turned on in Settings.
  // The new text replaces the selection as an ordinary edit, so it saves like typing and ⌘Z takes it back.
  const refine = (() => {
    let box = null, running = null, last = '';
    function close(force = false) {
      if (!box || (running && !force)) return;
      running?.abort(); running = null; box.remove(); box = null;
    }
    function place(editor, from, to) {
      const frame = view.getBoundingClientRect(), end = editor.coordsAtPos(to), start = editor.coordsAtPos(from);
      const width = Math.min(380, frame.width - 32), left = Math.min(Math.max(start.left - frame.left, 16), frame.width - width - 16);
      const below = end.bottom - frame.top + 10, height = box.offsetHeight || 120;
      box.style.width = `${width}px`; box.style.left = `${left}px`;
      box.style.top = `${below + height > frame.height - 16 ? Math.max(16, start.top - frame.top - height - 10) : below}px`;
    }
    // The selection as Markdown. Part of one paragraph comes out as just that text.
    function selected(editor, from, to, serializer) {
      const { schema } = editor.state, slice = editor.state.doc.slice(from, to);
      const inline = slice.content.firstChild?.isInline;
      const doc = inline ? schema.topNodeType.create(null, schema.nodes.paragraph.create(null, slice.content)) : schema.topNodeType.createAndFill(null, slice.content);
      return doc ? storedMarkdown(serializer(doc)).trim() : editor.state.doc.textBetween(from, to, '\n\n');
    }
    function apply(editor, from, to, original, text, parser, m) {
      if (from > editor.state.doc.content.size || to > editor.state.doc.content.size || editor.state.doc.textBetween(from, to, '\n') !== original) throw new Error('The text changed while it was being refined. Select it again and retry.');
      const parsed = parser(editorMarkdown(text)), $from = editor.state.doc.resolve(from), $to = editor.state.doc.resolve(to);
      const inOne = $from.parent === $to.parent && $from.parent.isTextblock && parsed.childCount === 1 && parsed.firstChild.isTextblock;
      const tr = inOne ? editor.state.tr.replaceWith(from, to, parsed.firstChild.content) : editor.state.tr.replaceRange(from, to, new m.Slice(parsed.content, 0, 0));
      editor.dispatch(tr.scrollIntoView()); editor.focus();
    }
    async function show(editor, from, to, builder, m) {
      close(true);
      const original = editor.state.doc.textBetween(from, to, '\n');
      let passage = '';
      builder.editor.action(ctx => { passage = selected(editor, from, to, ctx.get(m.serializerCtx)); });
      box = Object.assign(document.createElement('form'), { className: 'document-refine' });
      box.setAttribute('aria-label', 'Refine with AI');
      box.innerHTML = `<textarea rows="1" maxlength="2000" aria-label="How should it change?" placeholder="How should it change? Shorter, friendlier, as a list… Blank makes it shorter.">${escapeText(last)}</textarea><p class="document-refine-error" role="alert" hidden></p><div class="document-refine-foot"><span class="document-refine-model"></span><button class="document-refine-send" type="submit" aria-label="Refine" title="Refine">${UP_ICON}</button></div>`;
      view.append(box); place(editor, from, to);
      const field = box.querySelector('textarea'), error = box.querySelector('.document-refine-error'), foot = box.querySelector('.document-refine-foot'), model = box.querySelector('.document-refine-model');
      field.focus({ preventScroll: true }); field.select();
      const thisBox = box;
      // The AI that will run is named before anything is sent.
      request('/ai-search/tools').then(({ tools, selected: on }) => {
        if (box !== thisBox) return;
        const tool = tools.find(item => item.id === on);
        if (tool) model.textContent = tool.model || tool.name;
        else { field.disabled = true; box.querySelector('.document-refine-send').disabled = true; error.textContent = 'Turn on Claude Code, Codex or DeepSeek in Settings to refine text.'; error.hidden = false; }
      }).catch(() => {});
      field.addEventListener('keydown', event => {
        if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); box.requestSubmit(); }
        if (event.key === 'Escape') { event.preventDefault(); close(); editor.focus(); }
      });
      box.addEventListener('submit', async event => {
        event.preventDefault();
        if (running) return;
        last = field.value.trim(); error.hidden = true;
        running = new AbortController();
        const targetId = open.id, targetTitle = open.titleField?.value.trim() || open.title || 'Untitled';
        const activityKey = `doc-refine:${targetId}:${Date.now()}`, idle = foot.innerHTML;
        onActivity?.({
          key: activityKey, kind: 'document-refine', loaderKind: 'write', state: 'running',
          title: `Refining “${targetTitle}”`, detail: last || 'Polishing selected text',
          documentId: targetId, documentTitle: targetTitle, cancellable: true,
          cancel: () => running?.abort(),
        });
        foot.innerHTML = `<span class="document-refine-working" role="status">${dotLoader('write')}<span>Refining…</span></span><button class="document-refine-cancel" type="button">Cancel</button>`;
        foot.querySelector('.document-refine-cancel').onclick = () => { running?.abort(); };
        field.disabled = true;
        try {
          const { text } = await request('/documents/refine', { method: 'POST', body: { documentId: open.id, text: passage, request: last }, signal: running.signal });
          builder.editor.action(ctx => apply(editor, from, to, original, text, ctx.get(m.parserCtx), m));
          onActivity?.({
            key: activityKey, kind: 'document-refine', loaderKind: 'write', state: 'done',
            title: `Refined “${targetTitle}”`, detail: last || 'Updated selected text',
            documentId: targetId, documentTitle: targetTitle, cancellable: false, cancel: null,
          });
          running = null; close();
        } catch (failure) {
          const stopped = running?.signal.aborted; running = null;
          onActivity?.(stopped
            ? { key: activityKey, state: 'cancelled' }
            : { key: activityKey, kind: 'document-refine', loaderKind: 'write', state: 'failed', title: `Couldn’t refine “${targetTitle}”`, detail: failure.message, documentId: targetId, documentTitle: targetTitle, cancellable: false, cancel: null });
          if (box !== thisBox) return;
          foot.innerHTML = idle; field.disabled = false; field.focus({ preventScroll: true });
          if (!stopped) { error.textContent = failure.message; error.hidden = false; }
          place(editor, from, to);
        }
      });
    }
    // A click anywhere else puts the box away, unless it's still working.
    view.addEventListener('pointerdown', event => { if (box && !box.contains(event.target) && !event.target.closest('.milkdown-toolbar')) close(); });
    return { show, close };
  })();
  async function mountEditor(host, markdown) {
    const m = await loadEditor();
    const imageConfig = { onUpload: upload, inlineOnUpload: upload, blockOnUpload: upload, proxyDomURL: shownImage, maxHeight: 520, blockUploadPlaceholderText: 'Paste a link, or upload a picture', inlineUploadPlaceholderText: 'Paste a link, or upload' };
    const builder = new m.CrepeBuilder({ root: host, defaultValue: editorMarkdown(markdown) })
      .addFeature(m.cursor).addFeature(m.listItem).addFeature(m.linkTooltip).addFeature(m.imageBlock, imageConfig)
      .addFeature(m.blockEdit).addFeature(m.table)
      // Selected text gets a Refine with AI button beside the formatting ones.
      .addFeature(m.toolbar, { buildToolbar: groups => groups.addGroup('refine', 'Refine').addItem('refine', { icon: `${REFINE_ICON}<span class="refine-label">Refine</span>`, label: 'Refine with AI', active: () => false, onRun: ctx => { const editor = ctx.get(m.editorViewCtx), { from, to, empty } = editor.state.selection; if (!empty) void refine.show(editor, from, to, builder, m); } }) })
      .addFeature(m.placeholder, { text: 'Write, or type / for headings, lists, tables and pictures', mode: 'block' });
    // - bullets, the more common way to write a list.
    builder.editor.config(ctx => ctx.update(m.remarkStringifyOptionsCtx, options => ({ ...options, bullet: '-' })));
    builder.on(listener => listener.markdownUpdated((ctx, now, before) => { if (now !== before) schedule(); }));
    // Font names drawn in their own font; once the added fonts have loaded, the editor redraws them.
    builder.editor.use(fontDecorations(m));
    builder.editor.use(longBlocks(m));
    const fontsReady = loadStoredFonts();
    await builder.create();
    void fontsReady.then(() => { try { builder.editor.action(ctx => { const view = ctx.get(m.editorViewCtx); view.dispatch(view.state.tr.setMeta('document-fonts', true)); }); } catch { /* Closed meanwhile. */ } });
    return { markdown: () => storedMarkdown(builder.getMarkdown()), destroy: () => { refine.close(true); return builder.destroy(); }, insert: text => builder.editor.action(m.insert(text)) };
  }
  // Raw Markdown, for anyone who'd rather type it. Switching back rebuilds the editor from what's here.
  function mountRaw(host, markdown) {
    const field = Object.assign(document.createElement('textarea'), { className: 'document-raw', value: markdown, spellcheck: false });
    field.setAttribute('aria-label', 'Markdown'); field.addEventListener('input', schedule); host.append(field); field.focus({ preventScroll: true });
    return { markdown: () => field.value, destroy: () => field.remove(), insert: text => field.setRangeText(text, field.selectionStart, field.selectionEnd, 'end') };
  }
  async function showBody(markdown, raw) {
    const host = view.querySelector('.document-body');
    await open.editor?.destroy(); host.replaceChildren();
    open.raw = raw; open.editor = raw ? mountRaw(host, markdown) : await mountEditor(host, markdown);
    open.markdown = open.editor.markdown;
    view.querySelector('[data-doc-action="mode-editor"]')?.setAttribute('aria-pressed', String(!raw));
    view.querySelector('[data-doc-action="mode-raw"]')?.setAttribute('aria-pressed', String(raw));
  }
  function downloadDocument(doc) {
    const title = doc.titleField?.value || doc.title || 'document';
    const stem = title.trim().replace(/[\\/:*?"<>|\x00-\x1f]+/g, '-').replace(/^-+|-+$/g, '') || 'document';
    const url = URL.createObjectURL(new Blob([doc.markdown()], { type: 'text/markdown;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url; link.download = `${stem}.md`;
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  // Opened from a search result: scroll to the section that matched and mark the searched words there for a few seconds.
  // A long code block holding a match is unfolded first. If the section can't be found, the first match anywhere is used.
  function showFound({ heading = '', nth = 0, terms = [] } = {}) {
    const page = view.querySelector('.ProseMirror');
    if (!page) {
      const field = view.querySelector('.document-raw'), text = field?.value.toLowerCase() || '';
      const found = terms.map(term => text.matchAll(wordPattern(term)).next().value).filter(Boolean).sort((a, b) => a.index - b.index)[0];
      if (field && found) { field.focus({ preventScroll: true }); field.setSelectionRange(found.index, found.index + found[0].length); }
      return;
    }
    const blocks = [...page.children], isHeading = el => /^H[1-3]$/.test(el.tagName);
    const same = blocks.filter(el => isHeading(el) && el.textContent.replace(/\s+/g, ' ').trim() === heading.replace(/\s+/g, ' ').trim());
    const start = heading ? same[nth] || same[0] : blocks[0];
    const from = start ? blocks.indexOf(start) : 0, next = blocks.findIndex((el, index) => index > from && isHeading(el));
    const section = start ? blocks.slice(from, next < 0 ? blocks.length : next) : blocks;
    const ranges = [];
    for (const block of section) {
      const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        for (const term of terms) for (const found of node.data.matchAll(wordPattern(term))) { const range = new Range(); range.setStart(node, found.index); range.setEnd(node, found.index + found[0].length); ranges.push(range); }
      }
    }
    // A match inside a folded prompt can't be seen, so that block opens.
    const folded = new Set(ranges.map(range => range.startContainer.parentElement?.closest('pre.long-block.is-folded')).filter(Boolean));
    for (const pre of folded) pre.nextElementSibling?.matches('.long-block-toggle') && pre.nextElementSibling.click();
    const target = start || ranges[0]?.startContainer.parentElement;
    requestAnimationFrame(() => target?.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' }));
    if (!ranges.length || !globalThis.CSS?.highlights || typeof Highlight !== 'function') return;
    CSS.highlights.set('document-found', new Highlight(...ranges));
    clearTimeout(showFound.timer); showFound.timer = setTimeout(() => CSS.highlights.delete('document-found'), 4000);
  }
  async function openDocument(id, { naming = false, find = null } = {}) {
    if (open?.id === id && view.open) { if (find) showFound(find); return; }
    if (open) await closeDocument();
    let doc;
    try { doc = await request(`/documents/${id}`); } catch (error) { toast(error.message, true); return void refresh(); }
    open = { ...doc, timer: null, saving: null, markdown: () => doc.body };
    view.innerHTML = `<header class="document-head">
        <div class="document-name"><button class="document-head-icon" type="button" data-doc-action="icon" aria-label="Change document icon" title="Choose an emoji">${docIcon(doc)}</button><h2 class="document-name-text">${esc(doc.title)}</h2><button class="icon-button document-rename" type="button" data-doc-action="rename" aria-label="Rename document" title="Rename">${icon('pencil')}</button><input class="document-title" value="${esc(doc.title)}" maxlength="120" aria-label="Document name" spellcheck="false" hidden></div>
        <button class="secondary document-conflict" type="button" data-doc-action="reload" title="Show the newer version and drop your changes" hidden>Reload</button>
        <button class="secondary document-conflict" type="button" data-doc-action="keep" title="Save your version over the newer one" hidden>Keep mine</button>
        <div class="document-mode-toggle" role="group" aria-label="Document view"><button type="button" data-doc-action="mode-editor" aria-pressed="true">Editor</button><button type="button" data-doc-action="mode-raw" aria-pressed="false" title="Show the Markdown">Markdown</button></div>
        <button class="icon-button" type="button" data-doc-action="more" aria-label="More" title="More">${icon('more')}</button>
        <button class="icon-button" type="button" data-doc-action="close" aria-label="Close document" title="Close">${icon('close')}</button>
      </header>
      <div class="document-about">
        <div class="document-scope-box document-about-box">
          <div class="document-about-top">
            <span class="document-about-kicker">What belongs in it</span>
            <p class="document-description" tabindex="0" title="What belongs in this document. Click to expand and edit.">${aboutText(doc.description)}</p>
            <span class="document-about-chevron" aria-hidden="true">${icon('chevron')}</span>
          </div>
          <div class="document-about-body" hidden>
            <textarea class="document-description-field" maxlength="600" rows="2" placeholder="Say what belongs in this document, how entries should be formatted, and what to leave out…" aria-label="What belongs in this document"></textarea>
            <div class="document-scope-foot document-about-foot">
              <button class="document-scope-ai document-about-ai" type="button" data-doc-action="ai-describe-open" title="Draft or refine this description from the document’s name and text">${icon('sparkle')}<span>${doc.description ? 'Redraft' : 'Draft'}</span></button>
            </div>
          </div>
        </div>
      </div>
      <div class="document-body"><p class="document-loading">Opening…</p></div>
      <footer class="document-foot"><span class="document-foot-hint">${macKeyboard ? '⌘' : 'Ctrl'}-click a link to open it. A saved post’s link opens in the post panel.</span><span class="document-status" role="status" aria-live="polite">Saved</span></footer>`;
    const title = view.querySelector('.document-title'); open.titleField = title;
    // The name is plain text with a rename button beside it. Renaming swaps in a field that fits the name; Enter or clicking away keeps it, Escape undoes it.
    title.addEventListener('keydown', event => {
      if (event.key === 'Enter') { event.preventDefault(); finishRename(true); view.querySelector('.ProseMirror, .document-raw')?.focus(); }
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); finishRename(false); }
    });
    title.addEventListener('blur', () => finishRename(true));
    view.querySelector('.document-name-text').addEventListener('dblclick', startRename);
    // What belongs in the document, under its name: collapsed to one line while reading, and expanded with its heading and AI button when clicked.
    const aboutBox = view.querySelector('.document-about-box'), aboutTop = view.querySelector('.document-about-top'), about = view.querySelector('.document-description'), aboutBody = view.querySelector('.document-about-body'), aboutField = view.querySelector('.document-description-field'), aboutAi = view.querySelector('[data-doc-action="ai-describe-open"]');
    const animateAbout = fromHeight => {
      aboutBox.getAnimations().forEach(anim => anim.cancel());
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      const toHeight = aboutBox.offsetHeight;
      if (fromHeight === toHeight) return;
      aboutBox.style.overflow = 'hidden';
      const anim = aboutBox.animate(
        [{ height: `${fromHeight}px` }, { height: `${toHeight}px` }],
        { duration: 260, easing: 'cubic-bezier(.22, .68, .2, 1)' }
      );
      anim.onfinish = anim.oncancel = () => { aboutBox.style.overflow = ''; };
    };
    const syncAboutAi = (generated = false) => {
      if (!aboutAi || aboutAi.disabled) return;
      const saved = open.descriptionDraft ?? open.description, current = !aboutBody.hidden ? aboutField.value.trim() : saved;
      const label = generated ? 'Redraft' : !current ? 'Draft' : (!aboutBody.hidden && current !== saved) ? 'Refine' : 'Redraft';
      aboutAi.innerHTML = `${icon('sparkle')}<span>${label}</span>`;
    };
    const editAbout = () => {
      if (aboutBox.classList.contains('is-expanded')) return;
      const fromHeight = aboutBox.offsetHeight;
      aboutBox.classList.add('is-expanded');
      aboutField.value = open.descriptionDraft ?? open.description;
      about.hidden = true; aboutBody.hidden = false;
      syncAboutAi(false);
      animateAbout(fromHeight);
      aboutField.focus();
    };
    const finishAbout = keep => {
      if (!aboutBox.classList.contains('is-expanded')) return;
      const fromHeight = aboutBox.offsetHeight;
      const value = aboutField.value.replace(/\s+/g, ' ').trim(), before = open.descriptionDraft ?? open.description;
      if (keep && value && value !== before) {
        open.descriptionDraft = value; about.innerHTML = aboutText(value); schedule();
      }
      aboutBox.classList.remove('is-expanded');
      aboutBody.hidden = true; about.hidden = false;
      syncAboutAi(false);
      animateAbout(fromHeight);
    };
    aboutTop.addEventListener('mousedown', event => { if (aboutBox.classList.contains('is-expanded')) event.preventDefault(); });
    aboutTop.addEventListener('click', event => {
      if (aboutBox.classList.contains('is-expanded')) { event.stopPropagation(); finishAbout(true); }
    });
    aboutBox.addEventListener('click', () => { if (!aboutBox.classList.contains('is-expanded')) editAbout(); });
    about.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); editAbout(); } });
    aboutField.addEventListener('input', () => syncAboutAi(false));
    aboutField.addEventListener('keydown', event => {
      if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); finishAbout(true); }
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); finishAbout(false); }
    });
    aboutField.addEventListener('blur', event => { if (event.relatedTarget === aboutAi || aboutAi.disabled) return; finishAbout(true); });
    aboutAi.addEventListener('mousedown', event => event.preventDefault());
    aboutAi.addEventListener('click', async event => {
      event.stopPropagation();
      if (!open || aboutAi.disabled) return;
      const targetDoc = open, saved = targetDoc.descriptionDraft ?? targetDoc.description, draft = !aboutBody.hidden ? aboutField.value.trim() : saved;
      const refining = !aboutBody.hidden && draft && draft !== saved;
      const docTitle = targetDoc.titleField.value.trim() || targetDoc.title || 'Untitled';
      const activityKey = `doc-describe:${targetDoc.id}:${Date.now()}`;
      onActivity?.({ key: activityKey, kind: 'document-describe', loaderKind: 'write', state: 'running', title: refining ? 'Refining document description' : 'Drafting document description', detail: docTitle, documentId: targetDoc.id, documentTitle: docTitle });
      aboutAi.disabled = true; aboutAi.innerHTML = `${dotLoader('write')}<span>${refining ? 'Refining…' : 'Drafting…'}</span>`;
      try {
        const result = await request('/documents/describe', { method: 'POST', body: { title: targetDoc.titleField.value.trim(), description: draft, body: targetDoc.markdown() } });
        onActivity?.({ key: activityKey, kind: 'document-describe', loaderKind: 'write', state: 'done', title: refining ? 'Refined document description' : 'Drafted document description', detail: docTitle, documentId: targetDoc.id, documentTitle: docTitle });
        if (open !== targetDoc) return;
        const fromHeight = aboutBox.offsetHeight;
        aboutField.value = result.description;
        targetDoc.descriptionDraft = result.description; about.innerHTML = aboutText(result.description);
        schedule();
        aboutAi.disabled = false; syncAboutAi(true);
        animateAbout(fromHeight);
        aboutField.focus();
      } catch (error) {
        onActivity?.({ key: activityKey, kind: 'document-describe', loaderKind: 'write', state: 'failed', title: 'Couldn’t draft description', detail: `${docTitle} — ${error.message}`, documentId: targetDoc.id, documentTitle: docTitle });
        toast(error.message, true, 'bottom-center');
        if (open === targetDoc) { aboutAi.disabled = false; syncAboutAi(false); aboutField.focus(); }
      }
    });
    view.showModal();
    try { await showBody(doc.body, false); }
    catch (error) { console.error(error); toast('The editor couldn’t load. Showing the Markdown instead.', true, 'bottom-center'); await showBody(doc.body, true); }
    if (naming) startRename(); else if (!doc.body) view.querySelector('.ProseMirror, .document-raw')?.focus();
    if (find) requestAnimationFrame(() => showFound(find));
  }
  function startRename() {
    const field = open?.titleField; if (!field || !field.hidden) return;
    field.dataset.before = field.value;
    for (const el of view.querySelectorAll('.document-name-text, .document-rename')) el.hidden = true;
    field.hidden = false; field.focus(); field.select();
  }
  function finishRename(keep) {
    const field = open?.titleField; if (!field || field.hidden) return;
    if (!keep) field.value = field.dataset.before;
    field.value = field.value.trim() || 'Untitled';
    field.hidden = true;
    const text = view.querySelector('.document-name-text'); text.textContent = field.value;
    for (const el of view.querySelectorAll('.document-name-text, .document-rename')) el.hidden = false;
    if (field.value !== field.dataset.before) schedule();
  }
  async function closeDocument() {
    if (!open || view.dataset.closing) return;
    const doc = open;
    const saving = save(doc).catch(() => {});
    await dismissDialog(view);
    await saving;
    if (doc.conflict && !doc.deleted) toast('Your last changes weren’t saved: the document changed somewhere else.', true);
    if (open === doc) open = null;
    await doc.editor?.destroy?.();
    if (!open) view.innerHTML = '';
    void refresh();
  }
  view.addEventListener('cancel', event => { event.preventDefault(); void closeDocument(); });
  // The editor keeps Escape for itself, so it closes the document here unless one of the editor's menus is showing.
  view.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || view.querySelector('.milkdown [data-show="true"]') || event.target.closest('.account-menu, .document-title, .document-description-field, .document-refine')) return;
    event.preventDefault(); void closeDocument();
  }, true);
  view.addEventListener('click', event => {
    const action = event.target.closest('[data-doc-action]')?.dataset.docAction, trigger = event.target.closest('[data-doc-action]');
    if (event.target === view) {
      const box = view.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) void closeDocument();
      return;
    }
    if (action === 'close') void closeDocument();
    if (action === 'rename') startRename();
    if (action === 'icon' && open && trigger) void pickEmoji(trigger, open.id);
    if ((action === 'mode-editor' || action === 'mode-raw') && open) {
      const wantRaw = action === 'mode-raw';
      if (Boolean(open.raw) !== wantRaw) void (async () => { await save(); await showBody(open.markdown(), wantRaw); })();
    }
    // When an AI or another window changed the document meanwhile: take theirs, or save this one over it.
    if ((action === 'reload' || action === 'keep') && open) void (async () => {
      const doc = open, fresh = await request(`/documents/${doc.id}`);
      for (const button of view.querySelectorAll('.document-conflict')) button.hidden = true;
      Object.assign(doc, { updatedAt: fresh.updatedAt, conflict: false });
      if (action === 'keep') return save(doc);
      Object.assign(doc, { title: fresh.title, body: fresh.body, dirty: false });
      doc.titleField.value = fresh.title; view.querySelector('.document-name-text').textContent = fresh.title;
      Object.assign(doc, { description: fresh.description }); delete doc.descriptionDraft; view.querySelector('.document-description').innerHTML = aboutText(fresh.description); await showBody(fresh.body, doc.raw); setStatus('Saved');
    })().catch(error => toast(error.message, true, 'bottom-center'));
    if (action === 'more' && open) {
      const doc = open;
      openAccountMenu(trigger, [
        { label: 'Copy Markdown', run: () => navigator.clipboard.writeText(doc.markdown()).then(() => toast('Markdown copied', false, 'bottom-center'), () => toast('Couldn’t copy. Try again.', true, 'bottom-center')) },
        { label: 'Download document', run: () => downloadDocument(doc) },
        ...(doc.icon ? [{ label: 'Reset icon', run: () => void setDocumentIcon(doc.id, '') }] : []),
        { label: 'Delete…', danger: true, run: () => confirmDelete(trigger, doc) },
      ], null, 'Document options', view);
    }
    // A link opens like any other link in the app: a saved post in the post panel, anything else in the browser.
    const link = event.target.closest('.document-body a[href]');
    if (link?.querySelector('.doc-font')) { if (event.metaKey || event.ctrlKey) event.preventDefault(); return; }
    if (link && (event.metaKey || event.ctrlKey)) { event.preventDefault(); window.open(link.href, '_blank', 'noopener'); }
  });
  // Pictures pasted or dropped straight into the text are stored like uploaded ones.
  const pictures = event => [...(event.clipboardData || event.dataTransfer)?.files || []].filter(file => /^image\/(png|jpeg|gif|webp)$/.test(file.type));
  for (const type of ['paste', 'drop']) view.addEventListener(type, event => {
    if (!open?.editor || !event.target.closest?.('.document-body')) return;
    const files = pictures(event); if (!files.length) return;
    event.preventDefault(); event.stopPropagation();
    void (async () => { for (const file of files) { try { const src = await upload(file); open?.editor.insert(`\n![](${src})\n`); schedule(); } catch (error) { toast(error.message, true, 'bottom-center'); } } })();
  }, true);
  async function reloadIfOpen(id) {
    if (!open || open.id !== id || !view.open || open.dirty) return;
    try {
      const fresh = await request(`/documents/${id}`);
      Object.assign(open, { title: fresh.title, description: fresh.description, body: fresh.body, updatedAt: fresh.updatedAt, conflict: false, dirty: false });
      open.titleField.value = fresh.title; view.querySelector('.document-name-text').textContent = fresh.title;
      delete open.descriptionDraft; view.querySelector('.document-description').innerHTML = aboutText(fresh.description);
      await showBody(fresh.body, open.raw); setStatus('Saved');
    } catch { /* The conflict banner handles any mismatch on next edit. */ }
  }
  window.addEventListener('beforeunload', () => { if (open?.timer) void save(); });
  view.addEventListener('close', () => onDialogClose?.());
  newModal.addEventListener('close', () => onDialogClose?.());
  return { open: openDocument, close: closeDocument, openNew: onCreated => showNewModal(true, onCreated), refresh, showDrawer, reloadIfOpen, isOpen: () => view.open || newModal.open };
}
