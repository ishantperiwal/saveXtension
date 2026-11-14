import { openAccountMenu } from './account-menu.js';
import { storedMarkdown, editorMarkdown } from './document-markdown.js';
import { fontDecorations, loadStoredFonts } from './document-fonts.js';

// Documents: the person's own pages beside their saves, for what they want to keep and come back to.
// A dark panel docked to the right edge lists them. Closed, only its notch shows; the notch opens and closes it.
// Each one opens in a window with a Word-like editor
// that saves Markdown as you type. The editor (Milkdown Crepe) only loads the first time a document opens.
const EDITOR = '/vendor/editor/editor.js', EDITOR_STYLE = '/vendor/editor/editor-style.css', IMAGE_LIMIT = 15 * 1024 * 1024;
// A filled document, for the notch and the list: the page with its lines cut out and a lighter folded corner.
const DOC_ICON = '<svg class="icon doc-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="M6.5 2H13v5a2.5 2.5 0 0 0 2.5 2.5H20v10A2.5 2.5 0 0 1 17.5 22h-11A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2ZM8 12.2v1.6h8v-1.6H8Zm0 3.8v1.6h5.5V16H8Z"/><path fill="currentColor" opacity=".5" d="M14.5 2.4 19.6 7.5h-4.1a1 1 0 0 1-1-1V2.4Z"/></svg>';
const macKeyboard = /Mac|iPhone|iPad|iPod/i.test(navigator.userAgentData?.platform || navigator.platform || '');
let editorModule;
function loadEditor() {
  if (!document.querySelector(`link[href="${EDITOR_STYLE}"]`)) document.head.append(Object.assign(document.createElement('link'), { rel: 'stylesheet', href: EDITOR_STYLE }));
  return editorModule ||= import(EDITOR).catch(error => { editorModule = null; throw error; });
}
async function request(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api${path}`, { method, credentials: 'same-origin', headers: body === undefined ? {} : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const result = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(result.error || 'That didn’t work. Try again.'), { status: res.status });
  return result;
}
const asBase64 = file => new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1] || ''); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file); });
// The Markdown keeps images/<name>, the same way an exported folder would. Only the page shows it from the server.
const shownImage = src => (/^images\/[a-f0-9]{32}\.(png|jpg|gif|webp)$/.test(src) ? `/api/documents/${src}` : src);
const aboutText = description => description ? escapeText(description) : '<span class="document-description-empty">Add what belongs in this document, so anyone adding to it keeps to that.</span>';
const escapeText = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const when = iso => {
  const then = Date.parse(iso), minutes = Math.round((Date.now() - then) / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 1440) return `${Math.round(minutes / 60)} h ago`;
  return new Date(then).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: new Date(then).getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
};

export function mountDocuments({ icon, esc, toast }) {
  if (document.querySelector('.documents-notch')) return;
  const edge = document.createElement('aside');
  edge.className = 'documents-edge'; edge.dataset.open = 'false'; edge.setAttribute('aria-label', 'Documents');
  const notch = Object.assign(document.createElement('button'), { type: 'button', className: 'documents-notch', title: 'Documents' });
  notch.setAttribute('aria-label', 'Documents'); notch.setAttribute('aria-expanded', 'false');
  // A bump that leaves the edge tangentially at top and bottom, so it eases out of the panel rather than sitting on it.
  notch.innerHTML = `<svg class="documents-notch-shape" viewBox="0 0 26 92" preserveAspectRatio="none" aria-hidden="true"><path d="M26 0C26 24 1 26 1 46C1 66 26 68 26 92Z"/></svg>${DOC_ICON}`;
  const drawer = document.createElement('div');
  drawer.className = 'documents-drawer'; drawer.inert = true;
  drawer.innerHTML = `<header class="documents-drawer-head"><h2>Documents</h2><button class="icon-button" type="button" data-doc-action="new" aria-label="New document" title="New document">${icon('plus')}</button><button class="icon-button" type="button" data-doc-action="hide" aria-label="Close documents" title="Close">${icon('close')}</button></header>
    <form class="documents-new" hidden novalidate>
      <label>Name<input name="title" maxlength="120" autocomplete="off" spellcheck="false" placeholder="Fonts"></label>
      <label>What belongs in it<textarea name="description" rows="4" maxlength="600" placeholder="Fonts worth trying: their names, where to get them and their licences. Nothing else."></textarea></label>
      <p class="documents-new-hint">An AI adding to this document keeps to what you write here.</p>
      <p class="documents-new-error" role="alert" hidden></p>
      <div class="documents-new-actions"><button class="documents-new-cancel" type="button" data-doc-action="cancel-new">Cancel</button><button class="documents-new-create" type="submit">Create</button></div>
    </form>
    <input class="documents-filter" type="search" placeholder="Find a document" aria-label="Find a document" autocomplete="off" spellcheck="false">
    <ul class="documents-list" role="list"></ul>`;
  const view = document.createElement('dialog');
  view.id = 'document-view'; view.setAttribute('aria-label', 'Document');
  edge.append(notch, drawer);
  document.body.append(edge, view);
  const list = drawer.querySelector('.documents-list'), filter = drawer.querySelector('.documents-filter'), form = drawer.querySelector('.documents-new');
  let docs = [], open = null;

  function renderList() {
    const query = filter.value.trim().toLowerCase(), shown = docs.filter(d => d.title.toLowerCase().includes(query));
    list.innerHTML = shown.length
      ? shown.map(d => `<li class="documents-row"><button class="documents-copy" type="button" data-doc-copy="${d.id}" aria-label="Copy reference to ${esc(d.title)}" title="Copy reference for an AI">${icon('copy')}</button><button class="documents-item" type="button" data-doc-id="${d.id}"><span class="documents-item-text"><span class="documents-item-title">${esc(d.title)}</span><span class="documents-item-time">${when(d.updatedAt)}</span></span></button></li>`).join('')
      : `<li class="documents-empty">${docs.length ? 'No document has that name.' : 'Keep what you find worth coming back to: repos, fonts, prompts, ideas. Start one with +.'}</li>`;
  }
  async function refresh() {
    try { docs = (await request('/documents')).documents; renderList(); } catch (error) { list.innerHTML = `<li class="documents-empty">${esc(error.message)}</li>`; }
  }
  const isShown = () => edge.dataset.open === 'true';
  function showDrawer(show = !isShown()) {
    edge.dataset.open = String(show); drawer.inert = !show; notch.setAttribute('aria-expanded', String(show)); notch.tabIndex = show ? -1 : 0;
    if (show) { void refresh(); filter.focus({ preventScroll: true }); }
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
  // A document starts with a name and what belongs in it (user's decision), so anyone adding to it, person or AI, knows its scope.
  function showNewForm(show = true) {
    form.hidden = !show; filter.hidden = show; list.hidden = show;
    form.querySelector('.documents-new-error').hidden = true;
    if (show) { form.reset(); form.elements.title.focus(); } else filter.focus({ preventScroll: true });
  }
  async function create() {
    const title = form.elements.title.value.trim(), description = form.elements.description.value.trim(), error = form.querySelector('.documents-new-error');
    if (!title || !description) { error.textContent = !title ? 'Give it a name.' : 'Say what belongs in it.'; error.hidden = false; (!title ? form.elements.title : form.elements.description).focus(); return; }
    try { const doc = await request('/documents', { method: 'POST', body: { title, description } }); showNewForm(false); docs.unshift(doc); renderList(); await openDocument(doc.id); }
    catch (failure) { error.textContent = failure.message; error.hidden = false; }
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
    if (!form.hidden) return showNewForm(false);
    showDrawer(false); notch.focus();
  });
  form.addEventListener('submit', event => { event.preventDefault(); void create(); });
  form.elements.description.addEventListener('keydown', event => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); void create(); } });
  drawer.addEventListener('click', event => {
    const action = event.target.closest('[data-doc-action]')?.dataset.docAction, item = event.target.closest('.documents-item');
    if (action === 'new') showNewForm(form.hidden);
    if (action === 'cancel-new') showNewForm(false);
    if (action === 'hide') showDrawer(false);
    const copy = event.target.closest('[data-doc-copy]');
    if (copy) void copyReference(copy);
    if (item) void openDocument(item.dataset.docId);
  });
  drawer.addEventListener('contextmenu', event => {
    const item = event.target.closest('.documents-item'), doc = item && docs.find(d => d.id === item.dataset.docId); if (!doc) return;
    event.preventDefault();
    openAccountMenu(item, [{ label: 'Open', run: () => void openDocument(doc.id) }, { label: 'Delete…', danger: true, run: () => confirmDelete(item, doc, { x: event.clientX, y: event.clientY }) }], { x: event.clientX, y: event.clientY }, 'Document options');
  });
  document.addEventListener('pointerdown', event => { if (isShown() && !view.open && !edge.contains(event.target) && !event.target.closest('.account-menu')) showDrawer(false); });

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
  async function mountEditor(host, markdown) {
    const m = await loadEditor();
    const imageConfig = { onUpload: upload, inlineOnUpload: upload, blockOnUpload: upload, proxyDomURL: shownImage, blockUploadPlaceholderText: 'Paste a link, or upload a picture', inlineUploadPlaceholderText: 'Paste a link, or upload' };
    const builder = new m.CrepeBuilder({ root: host, defaultValue: editorMarkdown(markdown) })
      .addFeature(m.cursor).addFeature(m.listItem).addFeature(m.linkTooltip).addFeature(m.imageBlock, imageConfig)
      .addFeature(m.blockEdit).addFeature(m.toolbar).addFeature(m.table)
      .addFeature(m.placeholder, { text: 'Write, or type / for headings, lists, tables and pictures', mode: 'block' });
    // - bullets, the more common way to write a list.
    builder.editor.config(ctx => ctx.update(m.remarkStringifyOptionsCtx, options => ({ ...options, bullet: '-' })));
    builder.on(listener => listener.markdownUpdated((ctx, now, before) => { if (now !== before) schedule(); }));
    // Font names drawn in their own font; once the added fonts have loaded, the editor redraws them.
    builder.editor.use(fontDecorations(m));
    const fontsReady = loadStoredFonts();
    await builder.create();
    void fontsReady.then(() => { try { builder.editor.action(ctx => { const view = ctx.get(m.editorViewCtx); view.dispatch(view.state.tr.setMeta('document-fonts', true)); }); } catch { /* Closed meanwhile. */ } });
    return { markdown: () => storedMarkdown(builder.getMarkdown()), destroy: () => builder.destroy(), insert: text => builder.editor.action(m.insert(text)) };
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
    const toggle = view.querySelector('[data-doc-action="raw"]'); toggle.setAttribute('aria-pressed', String(raw)); toggle.textContent = raw ? 'Editor' : 'Markdown';
  }
  async function openDocument(id, { naming = false } = {}) {
    if (open?.id === id && view.open) return;
    if (open) await closeDocument();
    let doc;
    try { doc = await request(`/documents/${id}`); } catch (error) { toast(error.message, true); return void refresh(); }
    open = { ...doc, timer: null, saving: null, markdown: () => doc.body };
    view.innerHTML = `<header class="document-head">
        <div class="document-name"><h2 class="document-name-text">${esc(doc.title)}</h2><button class="icon-button document-rename" type="button" data-doc-action="rename" aria-label="Rename document" title="Rename">${icon('pencil')}</button><input class="document-title" value="${esc(doc.title)}" maxlength="120" aria-label="Document name" spellcheck="false" hidden></div>
        <span class="document-status" role="status" aria-live="polite">Saved</span>
        <button class="secondary document-conflict" type="button" data-doc-action="reload" title="Show the newer version and drop your changes" hidden>Reload</button>
        <button class="secondary document-conflict" type="button" data-doc-action="keep" title="Save your version over the newer one" hidden>Keep mine</button>
        <button class="secondary document-raw-toggle" type="button" data-doc-action="raw" aria-pressed="false" title="Show the Markdown">Markdown</button>
        <button class="icon-button" type="button" data-doc-action="more" aria-label="More" title="More">${icon('more')}</button>
        <button class="icon-button" type="button" data-doc-action="close" aria-label="Close document" title="Close">${icon('close')}</button>
      </header>
      <div class="document-about"><p class="document-description" tabindex="0" title="What belongs in this document. Click to change it.">${aboutText(doc.description)}</p><textarea class="document-description-field" maxlength="600" rows="1" aria-label="What belongs in this document" hidden></textarea></div>
      <div class="document-body"><p class="document-loading">Opening…</p></div>
      <footer class="document-foot">${macKeyboard ? '⌘' : 'Ctrl'}-click a link to open it. A saved post’s link opens in the post panel.</footer>`;
    const title = view.querySelector('.document-title'); open.titleField = title;
    // The name is plain text with a rename button beside it. Renaming swaps in a field that fits the name; Enter or clicking away keeps it, Escape undoes it.
    title.addEventListener('keydown', event => {
      if (event.key === 'Enter') { event.preventDefault(); finishRename(true); view.querySelector('.ProseMirror, .document-raw')?.focus(); }
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); finishRename(false); }
    });
    title.addEventListener('blur', () => finishRename(true));
    view.querySelector('.document-name-text').addEventListener('dblclick', startRename);
    // What belongs in the document, under its name. Click to change it; it can't be left empty.
    const about = view.querySelector('.document-description'), aboutField = view.querySelector('.document-description-field');
    const editAbout = () => { aboutField.value = open.descriptionDraft ?? open.description; about.hidden = true; aboutField.hidden = false; aboutField.focus(); };
    const finishAbout = keep => {
      if (aboutField.hidden) return;
      const value = aboutField.value.replace(/\s+/g, ' ').trim(), before = open.descriptionDraft ?? open.description;
      aboutField.hidden = true; about.hidden = false;
      if (!keep || !value || value === before) return;
      open.descriptionDraft = value; about.innerHTML = aboutText(value); schedule();
    };
    about.addEventListener('click', editAbout);
    about.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); editAbout(); } });
    aboutField.addEventListener('keydown', event => {
      if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); finishAbout(true); }
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); finishAbout(false); }
    });
    aboutField.addEventListener('blur', () => finishAbout(true));
    view.showModal();
    try { await showBody(doc.body, false); }
    catch (error) { console.error(error); toast('The editor couldn’t load. Showing the Markdown instead.', true, 'bottom-center'); await showBody(doc.body, true); }
    if (naming) startRename(); else if (!doc.body) view.querySelector('.ProseMirror, .document-raw')?.focus();
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
    if (!open) return;
    const doc = open;
    await save().catch(() => {});
    if (doc.conflict && !doc.deleted) toast('Your last changes weren’t saved: the document changed somewhere else.', true);
    open = null; await doc.editor?.destroy?.(); view.innerHTML = '';
    if (view.open) view.close();
    void refresh();
  }
  view.addEventListener('cancel', event => { event.preventDefault(); void closeDocument(); });
  // The editor keeps Escape for itself, so it closes the document here unless one of the editor's menus is showing.
  view.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || view.querySelector('.milkdown [data-show="true"]') || event.target.closest('.account-menu, .document-title, .document-description-field')) return;
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
    if (action === 'raw' && open) void (async () => { await save(); await showBody(open.markdown(), !open.raw); })();
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
  window.addEventListener('beforeunload', () => { if (open?.timer) void save(); });
  return { open: openDocument, refresh };
}
