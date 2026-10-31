const $ = (selector, root = document) => root.querySelector(selector);
const app = $('#app'), modal = $('#modal');
const paths = {
  bookmark: '<path d="M6 4h12v17l-6-4-6 4z"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  star: '<path d="m12 3 2.8 5.8 6.4.9-4.6 4.5 1.1 6.4-5.7-3-5.7 3 1.1-6.4L2.8 9.7l6.4-.9z"/>',
  archive: '<rect x="3" y="3" width="18" height="5" rx="1"/><path d="M5 8v13h14V8M10 12h4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  arrow: '<path d="M7 17 17 7M7 7h10v10"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  refresh: '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 7a7 7 0 0 1 12-2l2 3M4 16l2 3a7 7 0 0 0 12-2"/>',
  instagram: '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><path d="M17.5 6.5h.01"/>',
  x: '<path d="m5 3 14 18h-4L1 3h4Zm-2 18L19 3" transform="translate(2 0) scale(.9 1)"/>',
  link: '<path d="m10 13 4-4M8 16l-1 1a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0M16 8l1-1a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0" transform="translate(1 0) scale(.9 1)"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  settings: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3" fill="currentColor"/><circle cx="15" cy="17" r="3" fill="currentColor"/>',
  list: '<path d="M8 5h13M8 12h13M8 19h13M3 5h.01M3 12h.01M3 19h.01"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z"/><path d="m8 11 3 3 5-5"/>',
  logout: '<path d="M10 4H4v16h6M13 8l4 4-4 4M9 12h12"/>',
  file: '<path d="M14 2H5v20h14V7zM14 2v6h5M8 13h8M8 17h6"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="1"/><path d="m3 17 6-6 4 4 3-3 5 5"/>'
};
const icon = (name, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.bookmark}</svg>`;
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const platformName = p => p === 'x' ? 'X / Twitter' : 'Instagram';
const relative = date => {
  const days = Math.floor((Date.now() - Date.parse(date)) / 86400000);
  return days === 0 ? 'Today' : days === 1 ? 'Yesterday' : days < 7 ? `${days} days ago` : new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};
const state = { posts: [], runs: [], filter: 'all', topic: '', query: '', sort: 'newest', view: 'grid', demo: false, busy: false, name: '' };
let toastTimer, searchTimer;
function toast(message, error = false) { const el = $('#toast'); el.textContent = message; el.className = `visible ${error ? 'error' : ''}`; clearTimeout(toastTimer); toastTimer = setTimeout(() => el.className = '', 4200); }
async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api${path}`, { method, credentials: 'same-origin', headers: body === undefined ? {} : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const result = await res.json();
  if (!res.ok) { if (res.status === 401 && !['/login', '/setup'].includes(path)) boot(); throw new Error(result.error || 'Request failed.'); }
  return result;
}
function showModal(content, wide = false) {
  modal.innerHTML = `<button class="icon-button modal-close" aria-label="Close dialog">${icon('close')}</button>${content}`;
  modal.className = wide ? 'wide' : ''; if (!modal.open) modal.showModal();
  $('.modal-close', modal).onclick = () => modal.close();
}
modal.addEventListener('click', e => { if (e.target === modal) { const b = modal.getBoundingClientRect(); if (e.clientX < b.left || e.clientX > b.right || e.clientY < b.top || e.clientY > b.bottom) modal.close(); } });

async function boot() {
  try {
    const session = await api('/session'); state.name = session.name;
    if (!session.authenticated) return authScreen(session.setupRequired);
    const data = await api('/posts'); state.posts = data.posts; state.runs = data.runs; state.demo = false; render();
  } catch (e) { app.innerHTML = `<main class="auth-wrap"><h1>Let’s reconnect.</h1><p>${esc(e.message)}</p><button class="primary" id="retry">Try again</button></main>`; $('#retry').onclick = boot; }
}
function authScreen(setup) {
  app.innerHTML = `<main class="auth-layout"><section class="auth-story"><a class="brand" href="/">${icon('bookmark')}<span>save<span class="accent">X</span>tension<span class="brand-dot">.</span></span></a><div><span class="eyebrow">A little less searching</span><h1>Your next great idea.<br>Already saved<br><em>somewhere.</em></h1><p>Bring your Instagram saves and X bookmarks into one thoughtful, searchable home.</p></div><span class="story-foot">Keep the good stuff close. ${icon('arrow')}</span></section><section class="auth-form"><div class="auth-card"><span class="small-logo">${icon('bookmark')}</span><h2>${setup ? 'Make yourself a library.' : 'Welcome back.'}</h2><p>${setup ? 'A private home for everything you want to come back to.' : 'Your collection is right where you left it.'}</p><form id="auth-form">${setup ? '<label>Library name<input name="name" placeholder="My library" maxlength="50" autocomplete="nickname"></label><label>Setup code<input name="code" placeholder="From your server terminal" required autocomplete="off"></label>' : ''}<label>${setup ? 'Choose a password' : 'Password'}<input name="password" type="password" minlength="${setup ? 12 : 1}" maxlength="256" required autocomplete="${setup ? 'new-password' : 'current-password'}" placeholder="${setup ? 'At least 12 characters' : 'Your library password'}"></label><p class="form-error" id="auth-error" role="alert"></p><button class="primary full" type="submit">${setup ? 'Create my library' : 'Open my library'} ${icon('arrow')}</button></form><p class="privacy-note">${icon('shield')} Your social passwords stay with Instagram and X.</p></div></section></main>`;
  $('#auth-form').onsubmit = async e => {
    e.preventDefault(); const button = $('button[type=submit]', e.target); button.disabled = true;
    try { await api(setup ? '/setup' : '/login', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); await boot(); }
    catch (error) { $('#auth-error').textContent = error.message; button.disabled = false; }
  };
}
function allPosts() { return state.demo ? demoPosts : state.posts; }
function filteredPosts() {
  let posts = allPosts().filter(p => state.filter === 'archived' ? p.archived : !p.archived);
  if (state.filter === 'favorites') posts = posts.filter(p => p.favorite);
  if (['x', 'instagram'].includes(state.filter)) posts = posts.filter(p => p.platform === state.filter);
  if (state.topic) posts = posts.filter(p => p.topics.includes(state.topic) || p.tags.includes(state.topic));
  const query = state.query.toLowerCase();
  if (query) posts = posts.filter(p => [p.text, p.title, p.author, p.authorName, p.notes, p.url, ...p.tags, ...p.topics, ...p.accounts].join(' ').toLowerCase().includes(query));
  return posts.sort((a, b) => state.sort === 'oldest' ? a.savedAt.localeCompare(b.savedAt) : state.sort === 'creator' ? a.author.localeCompare(b.author) : b.savedAt.localeCompare(a.savedAt) || b.id - a.id);
}
function navItem(filter, label, symbol, count) { return `<button class="nav-item ${state.filter === filter && !state.topic ? 'active' : ''}" data-filter="${filter}">${icon(symbol)}<span>${label}</span><span class="nav-count">${count}</span></button>`; }
function render() {
  const posts = allPosts(), live = posts.filter(p => !p.archived);
  const topicCounts = new Map(); live.forEach(p => [...new Set([...p.topics, ...p.tags])].forEach(t => topicCounts.set(t, (topicCounts.get(t) || 0) + 1)));
  const topics = [...topicCounts].sort((a, b) => b[1] - a[1]).slice(0, 12);
  app.innerHTML = `<div class="workspace"><aside class="sidebar"><a href="/" class="brand">${icon('bookmark')}<span>save<span class="accent">X</span>tension<span class="brand-dot">.</span></span></a><div class="library-name"><span class="library-avatar">${esc(state.name.charAt(0).toUpperCase())}</span><span>${esc(state.name)}<small>Personal workspace</small></span><span class="private-dot" title="Password protected"></span></div><nav aria-label="Library"><span class="nav-label">Your library</span>${navItem('all', 'All saves', 'grid', live.length)}${navItem('favorites', 'Favorites', 'star', live.filter(p => p.favorite).length)}${navItem('archived', 'Archive', 'archive', posts.filter(p => p.archived).length)}<span class="nav-label spaced">Sources</span>${navItem('instagram', 'Instagram', 'instagram', live.filter(p => p.platform === 'instagram').length)}${navItem('x', 'X / Twitter', 'x', live.filter(p => p.platform === 'x').length)}<span class="nav-label spaced">Topics <span class="auto-label">Auto</span></span><div class="topics-nav">${topics.length ? topics.map(([t, count]) => `<button class="topic-nav ${state.topic === t ? 'active' : ''}" data-topic="${esc(t)}"><span class="topic-dot"></span><span>${esc(t)}</span><small>${count}</small></button>`).join('') : '<p class="nav-hint">Topics appear as you add posts with captions.</p>'}</div></nav><div class="sidebar-bottom"><div class="extension-prompt"><span class="extension-mark">${icon('refresh')}</span><strong>A home for your saves.</strong><p>Pair the extension to bring your scattered bookmarks together.</p><button class="secondary full" data-action="connect">Connect extension ${icon('arrow')}</button></div><button class="nav-item settings-button" data-action="settings">${icon('settings')}<span>Settings & backups</span></button><div class="sidebar-foot">Made for your curious mind.<span>↗</span></div></div></aside><main class="main"><header class="topbar"><div class="breadcrumb">Your library <span>/</span> <strong>${esc(state.topic || ({ all: 'All saves', favorites: 'Favorites', archived: 'Archive', x: 'X / Twitter', instagram: 'Instagram' }[state.filter]))}</strong></div><button class="top-connect" data-action="connect">${icon('refresh')} Connect & sync</button><button class="profile-button" data-action="settings" aria-label="Open settings">${esc(state.name.charAt(0).toUpperCase())}</button></header><div class="page-content"><div class="page-heading"><div><div class="heading-kicker"><span class="tiny-line"></span> Your own corner of the internet</div><h1>${esc(state.topic || ({ all: 'All the good stuff.', favorites: 'The ones that stay.', archived: 'Saved for another day.', x: 'From your timeline.', instagram: 'From your feed.' }[state.filter]))}</h1><p>${live.length ? `${live.length} saves. Fewer places to look. More ideas to come back to.` : 'Less “where did I save that?” More “here it is.”'}</p></div><button class="primary" data-action="add">${icon('plus')} Add a save</button></div>${state.demo ? '<div class="demo-banner"><span><strong>You’re exploring a sample library.</strong> These example posts aren’t synced from your accounts.</span><button data-action="exit-demo">Back to my library ×</button></div>' : ''}<div class="toolbar"><label class="search">${icon('search')}<input id="search" type="search" placeholder="Find an idea, a creator, a half-remembered thing…" value="${esc(state.query)}" aria-label="Search saves"><kbd>/</kbd></label><select id="sort" aria-label="Sort saves"><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="creator">By creator</option></select><div class="view-switch"><button class="icon-button ${state.view === 'grid' ? 'selected' : ''}" data-view="grid" aria-label="Grid view">${icon('grid')}</button><button class="icon-button ${state.view === 'list' ? 'selected' : ''}" data-view="list" aria-label="List view">${icon('list')}</button></div></div><div class="results-meta"><span id="result-count"></span><span>${state.demo ? 'Example content' : 'Private by default'} ${icon('shield')}</span></div><div id="results"></div><footer class="page-foot"><span>A little collection. A lot of possibility.</span><span>Instagram + X, together ${icon('bookmark')}</span></footer></div></main></div>`;
  $('#sort').value = state.sort;
  $('#sort').onchange = e => { state.sort = e.target.value; renderResults(); };
  $('#search').oninput = e => { state.query = e.target.value; clearTimeout(searchTimer); searchTimer = setTimeout(renderResults, 100); };
  renderResults();
}
function renderResults() {
  if (!$('#results')) return;
  const posts = filteredPosts(); $('#result-count').textContent = `${posts.length} ${posts.length === 1 ? 'save' : 'saves'}${state.query ? ' found' : ''}`;
  if (!posts.length) {
    const emptyLibrary = !allPosts().length;
    $('#results').innerHTML = emptyLibrary ? `<section class="empty-state"><div class="empty-illustration" aria-hidden="true"><div class="paper paper-back">${icon('instagram')}<span></span><span></span><span></span></div><div class="paper paper-front">${icon('x')}<span></span><span></span><span></span><i>${icon('bookmark')}</i></div><span class="orbit orbit-one">+</span><span class="orbit orbit-two">✳</span></div><span class="eyebrow">Your ideas deserve a home</span><h2>Save it once.<br>Find it right here.</h2><p>All those useful posts, clever ideas, and “I’ll read this later” moments. Together at last.</p><div class="empty-actions"><button class="primary" data-action="connect">${icon('refresh')} Connect your extension</button><button class="secondary" data-action="add">${icon('link')} Add a link</button></div><button class="text-button" data-action="demo">Take a look around with sample saves ${icon('arrow')}</button><div class="empty-steps"><span><b>01</b> Pair your browser</span><span><b>02</b> Sync your saves</span><span><b>03</b> Find your next idea</span></div></section>` : `<section class="no-results">${icon('search')}<h2>${state.query || state.topic ? 'Nothing here just yet.' : 'A little room for more.'}</h2><p>${state.query || state.topic ? 'Try another search or clear your filters.' : state.filter === 'favorites' ? 'Star a save to keep it close.' : 'Saves you add here will appear in your library.'}</p><button class="secondary" data-action="clear">Show all saves</button></section>`;
    return;
  }
  $('#results').innerHTML = `<div class="cards ${state.view === 'list' ? 'list-view' : ''}">${posts.map(card).join('')}</div>`;
  attachImageFallbacks();
}
function card(p) {
  const excerpt = p.text || p.title;
  return `<article class="save-card ${p.platform} ${p.thumbnail ? 'has-image' : ''}"><div class="card-top"><span class="source-label">${icon(p.platform)} ${platformName(p.platform)}</span><span class="card-age">${relative(p.savedAt)}</span></div><button class="card-content" data-open="${p.id}" aria-label="View ${esc(p.title || p.authorName || 'saved post')}">${p.thumbnail ? `<span class="card-image"><img src="${esc(p.thumbnail)}" alt="Captured post preview" loading="lazy" referrerpolicy="no-referrer">${p.kind === 'video' ? '<span class="media-type">▶ Reel / video</span>' : p.kind === 'carousel' ? '<span class="media-type">Carousel</span>' : ''}</span>` : ''}${!excerpt && p.platform === 'instagram' ? `<span class="link-placeholder">${icon('instagram')}<strong>A moment worth keeping.</strong><span>Open the original to view this post.</span></span>` : `<span class="card-copy">${p.title ? `<strong class="card-title">${esc(p.title)}</strong>` : ''}<span class="card-text ${p.platform === 'x' && !p.thumbnail ? 'quote-text' : ''}">${esc(excerpt || 'Saved from X. Open the original to view this post.').slice(0, 1800)}</span></span>`}</button>${p.author || p.authorName ? `<div class="creator"><span class="creator-avatar">${esc((p.authorName || p.author).replace('@', '').charAt(0).toUpperCase())}</span><span><strong>${esc(p.authorName || p.author)}</strong>${p.authorName && p.author ? `<small>@${esc(p.author.replace(/^@/, ''))}</small>` : ''}</span></div>` : ''}<div class="card-tags">${[...new Set([...p.topics, ...p.tags])].slice(0, 3).map(t => `<button class="tag" data-topic="${esc(t)}">${esc(t)}</button>`).join('')}</div><footer class="card-footer"><span>${p.notes ? `${icon('file')} Has a note` : p.accounts.length ? `Saved via ${esc(p.accounts[0])}` : 'In your collection'}</span><div><button class="icon-button favorite ${p.favorite ? 'is-favorite' : ''}" data-favorite="${p.id}" aria-label="${p.favorite ? 'Remove from' : 'Add to'} favorites">${icon('star')}</button><a class="icon-button" href="${esc(p.url)}" target="_blank" rel="noopener noreferrer" aria-label="Open original post">${icon('arrow')}</a></div></footer></article>`;
}
function attachImageFallbacks(root = app) { root.querySelectorAll('img').forEach(img => { img.onerror = () => { const container = img.parentElement; container.classList.add('image-unavailable'); container.innerHTML = `${icon('image')}<span>Preview expired · original link saved</span>`; }; }); }
async function refresh(silent = false) {
  if (state.demo) return;
  try { const data = await api('/posts'); const changed = JSON.stringify(state.posts) !== JSON.stringify(data.posts); state.posts = data.posts; state.runs = data.runs; if (changed || !silent) render(); }
  catch (e) { if (!silent) toast(e.message, true); }
}
async function mutate(id, changes) {
  if (state.demo) { toast('This is a sample. Add your own saves to edit them.'); return; }
  const post = await api(`/posts/${id}`, { method: 'PATCH', body: changes }); state.posts = state.posts.map(p => p.id === id ? post : p); render(); return post;
}
function addDialog() {
  showModal(`<span class="dialog-kicker">One more good find</span><h2>Add to your collection.</h2><p>Paste an Instagram post, Reel, or X post link. Add a caption to make it easier to find later.</p><form id="add-form"><label>Post URL<input type="url" name="url" placeholder="https://www.instagram.com/p/…" required autofocus></label><label>Title <span class="optional">optional</span><input name="title" placeholder="What caught your attention?" maxlength="180"></label><label>Caption or context <span class="optional">optional</span><textarea name="text" rows="4" placeholder="A useful idea, the post’s caption, or a little context…" maxlength="20000"></textarea></label><label>Tags <span class="optional">comma separated</span><input name="tags" placeholder="AI, read later, inspiration"></label><p class="form-error" id="add-error" role="alert"></p><button class="primary full">${icon('plus')} Save to my library</button></form><div class="dialog-divider"><span>Already have an export?</span></div><button class="secondary full" data-action="import">${icon('download')} Import JSON, HTML, or a URL list</button><p class="fine-print">A link alone may not include a preview. The extension can capture available page content.</p>`);
  $('#add-form').onsubmit = async e => {
    e.preventDefault(); const button = $('button', e.target); button.disabled = true;
    try {
      const input = Object.fromEntries(new FormData(e.target)); input.tags = input.tags.split(',');
      const result = await api('/posts/import', { method: 'POST', body: { posts: [input] } });
      if (result.rejected) throw new Error(result.errors[0].message);
      modal.close(); state.demo = false; await refresh(); toast(result.imported ? 'A good find, safely kept.' : 'Already saved. We updated its details.');
    } catch (error) { $('#add-error').textContent = error.message; button.disabled = false; }
  };
}
async function connectDialog() {
  showModal(`<span class="dialog-kicker">Bring it all together</span><h2>Your browser. Your library.</h2><p>Install the extension once, pair it here, then press Sync on your Instagram Saved or X Bookmarks page.</p><ol class="connect-steps"><li><b>1</b><div><strong>Load the extension</strong><p>Download and unzip. Open <code>chrome://extensions</code> or <code>edge://extensions</code>, enable Developer mode, then choose “Load unpacked” and select the extension folder.</p><a class="secondary" href="/extension.zip" download>${icon('download')} Download extension</a></div></li><li><b>2</b><div><strong>Pair this library</strong><p>Open the extension’s settings. Paste this address and generate a one-time pairing code.</p><label>Library address<input readonly value="${esc(location.origin)}" aria-label="Library address"></label><button class="secondary" id="generate-code">Generate pairing code</button><div id="pair-code" aria-live="polite"></div></div></li><li><b>3</b><div><strong>Open Saved / Bookmarks → Sync</strong><p>Sync the account currently logged into that tab. Repeat for your other accounts. Keep the tab open while posts load.</p></div></li></ol><div class="notice">Browser imports depend on the sites’ current layouts. X prohibits non-API automation; imports can carry account risk. This app doesn’t bypass login checks or platform limits.</div>`);
  $('#generate-code').onclick = async e => {
    e.target.disabled = true;
    try { const { code } = await api('/pairing', { method: 'POST', body: {} }); $('#pair-code').innerHTML = `<div class="pair-code"><code>${esc(code)}</code><button class="icon-button" id="copy-code" aria-label="Copy pairing code">${icon('file')}</button></div><small>Expires in 5 minutes. Works once. Keep this code private.</small>`; $('#copy-code').onclick = () => navigator.clipboard.writeText(code).then(() => toast('Pairing code copied.')).catch(() => toast('Select the code and copy it manually.')); }
    catch (error) { toast(error.message, true); }
    finally { e.target.disabled = false; }
  };
}
async function details(id) {
  const p = allPosts().find(p => p.id === Number(id)); if (!p) return;
  showModal(`<div class="detail-source">${icon(p.platform)} ${platformName(p.platform)} <span>Saved ${relative(p.savedAt).toLowerCase()}</span></div>${p.thumbnail ? `<div class="detail-image"><img src="${esc(p.thumbnail)}" alt="Saved post preview" referrerpolicy="no-referrer"></div>` : ''}<h2>${esc(p.title || p.authorName || (p.author ? `@${p.author.replace(/^@/, '')}` : 'A saved idea.'))}</h2>${p.author ? `<p class="detail-author">@${esc(p.author.replace(/^@/, ''))}</p>` : ''}<div class="detail-text">${esc(p.text || 'No caption was captured for this post. You can still open the original below.')}</div><a class="primary" href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">Open original ${icon('arrow')}</a><div class="detail-edit"><form id="edit-form"><label>Title<input name="title" value="${esc(p.title)}" maxlength="180" placeholder="Give this save a useful name"></label><label>Your notes<textarea name="notes" rows="4" maxlength="10000" placeholder="Why did you save this? What do you want to try?">${esc(p.notes)}</textarea></label><label>Tags<input name="tags" value="${esc(p.tags.join(', '))}" placeholder="Comma separated"></label><button class="secondary" type="submit">${icon('check')} Save changes</button></form></div>${p.accounts.length ? `<p class="fine-print">Saved from ${p.accounts.map(esc).join(', ')}</p>` : ''}<div class="detail-actions"><button class="text-button" id="archive-post">${icon('archive')} ${p.archived ? 'Move to library' : 'Archive save'}</button><button class="text-button danger" id="delete-post">${icon('trash')} Delete</button></div>`);
  attachImageFallbacks(modal);
  $('#edit-form').onsubmit = async e => { e.preventDefault(); try { const input = Object.fromEntries(new FormData(e.target)); input.tags = input.tags.split(','); await mutate(p.id, input); if (!state.demo) { modal.close(); toast('Your notes are saved.'); } } catch (error) { toast(error.message, true); } };
  $('#archive-post').onclick = async () => { try { await mutate(p.id, { archived: !p.archived }); modal.close(); } catch (e) { toast(e.message, true); } };
  $('#delete-post').onclick = async () => {
    if (state.demo) return toast('Sample saves can’t be deleted.');
    if (!confirm('Delete this save and its notes? This cannot be undone.')) return;
    try { await api(`/posts/${p.id}`, { method: 'DELETE' }); modal.close(); await refresh(); toast('Save deleted.'); } catch (e) { toast(e.message, true); }
  };
}
async function settingsDialog() {
  showModal('<h2>Your workspace.</h2><p>Loading settings…</p>');
  try {
    const { devices } = await api('/devices');
    if (!modal.open) return;
    showModal(`<span class="dialog-kicker">Make it yours</span><h2>Your workspace.</h2><h3>Connected browsers</h3><div class="device-list">${devices.length ? devices.map(d => `<div class="device"><span>${icon('shield')}</span><div><strong>${esc(d.name)}</strong><small>${d.lastSeen ? `Last used ${relative(d.lastSeen).toLowerCase()}` : 'Paired, ready to sync'}</small></div><button class="text-button danger" data-revoke="${d.id}">Disconnect</button></div>`).join('') : '<p class="muted">No browsers paired yet.</p>'}</div><button class="secondary" data-action="connect">${icon('plus')} Pair a browser</button><h3 class="section-gap">Your data, always yours.</h3><p>Back up your saves, notes, tags, and favorites as JSON. Import that file to restore a new library.</p><div class="button-row"><a class="secondary" href="/api/export" download>${icon('download')} Export library</a><button class="secondary" data-action="import">${icon('plus')} Import a file</button></div><h3 class="section-gap">Recent syncs</h3><div class="sync-history">${state.runs.length ? state.runs.slice(0, 8).map(r => `<div><span class="run-icon">${icon(r.platform)}</span><span><strong>${platformName(r.platform)}${r.account ? ` · ${esc(r.account)}` : ''}</strong><small>${r.imported} new · ${r.updated} revisited · ${esc(r.status)}${r.message ? `<br>${esc(r.message)}` : ''}</small></span><time>${relative(r.startedAt)}</time></div>`).join('') : '<p class="muted">Your first sync will appear here.</p>'}</div><div class="notice">Topic suggestions use simple local keyword matching. No posts are sent to an AI service. Thumbnails load from the original platform and may expire; your captured text and notes stay saved.</div><button class="text-button" data-action="logout">${icon('logout')} Sign out of this browser</button>`);
  } catch (e) { toast(e.message, true); modal.close(); }
}
function importDialog() {
  showModal(`<span class="dialog-kicker">A fresh start, together</span><h2>Bring your saves along.</h2><p>Import a saveXtension backup, extracted Instagram/X export file, or plain list of post URLs.</p><form id="import-form"><label class="file-drop">${icon('file')}<strong>Choose a JSON, HTML, JS, or TXT file</strong><span>Extract downloaded ZIP archives first. Maximum 20 MB.</span><input type="file" id="import-file" accept=".json,.html,.htm,.txt,.js" required></label><label>Source account <span class="optional">optional</span><input name="sourceAccount" placeholder="e.g. @my-personal-account" maxlength="100"></label><p class="form-error" id="import-error" role="alert"></p><button class="primary full">Import supported post links ${icon('arrow')}</button><p id="import-progress" role="status"></p></form><p class="fine-print">Exports vary: some include only links, and some omit saves entirely. We’ll tell you how many supported posts we find. JavaScript export files are read as data, never executed.</p>`);
  $('#import-form').onsubmit = async e => {
    e.preventDefault(); const button = $('button', e.target); button.disabled = true;
    try {
      const file = $('#import-file').files[0]; if (file.size > 20 * 1024 * 1024) throw new Error('Choose a file smaller than 20 MB.');
      const posts = parseImport(await file.text(), file.name);
      if (!posts.length) throw new Error('No supported Instagram or X post links were found in this file.');
      const account = new FormData(e.target).get('sourceAccount');
      let imported = 0, updated = 0, rejected = 0;
      for (let i = 0; i < posts.length; i += 100) {
        $('#import-progress').textContent = `Importing ${Math.min(i + 100, posts.length)} of ${posts.length}…`;
        const result = await api('/posts/import', { method: 'POST', body: { posts: posts.slice(i, i + 100).map(p => ({ ...p, sourceAccount: account || p.sourceAccount })) } });
        imported += result.imported; updated += result.updated; rejected += result.rejected;
      }
      state.demo = false; modal.close(); await refresh(); toast(`${imported} new saves · ${updated} revisited${rejected ? ` · ${rejected} skipped` : ''}`);
    } catch (error) { $('#import-error').textContent = error.message; button.disabled = false; }
  };
}
export function parseImport(content, name = '') {
  const found = new Map();
  function add(url, metadata = {}) {
    if (typeof url !== 'string') return;
    const normalized = url.replace(/&amp;/g, '&');
    if (!/^https?:\/\/(?:www\.|mobile\.)?(?:(?:x|twitter)\.com\/(?:\w+|i\/web)\/status\/\d+|instagram\.com\/(?:p|reels?|tv)\/[\w-]+)/i.test(normalized)) return;
    const p = { ...metadata, url: normalized }; found.set(normalized.split('?')[0], { ...found.get(normalized.split('?')[0]), ...p });
  }
  if (/\.html?$/i.test(name)) {
    const doc = new DOMParser().parseFromString(content, 'text/html'); doc.querySelectorAll('a[href]').forEach(a => add(a.getAttribute('href')));
  } else if (/\.(json|js)$/i.test(name) || /^[\s]*[\[{]/.test(content)) {
    let data; const raw = /\.js$/i.test(name) ? content.slice(content.indexOf('=') + 1).trim().replace(/;\s*$/, '') : content;
    try { data = JSON.parse(raw); } catch { throw new Error('This file isn’t valid JSON data. Extract the export archive and choose its bookmarks or saved-posts file.'); }
    let visited = 0;
    function walk(node, depth = 0) {
      if (++visited > 200000 || depth > 60) return;
      if (typeof node === 'string') return add(node);
      if (!node || typeof node !== 'object') return;
      if (typeof node.url === 'string') add(node.url, node);
      if (node.tweetId && /^\d+$/.test(String(node.tweetId))) add(`https://x.com/i/status/${node.tweetId}`, { text: node.fullText || node.full_text || '' });
      for (const value of Object.values(node)) walk(value, depth + 1);
    }
    walk(data);
  } else { (content.match(/https?:\/\/[^\s<>"']+/g) || []).forEach(url => add(url)); }
  return [...found.values()];
}

document.addEventListener('click', async e => {
  const button = e.target.closest('[data-filter],[data-topic],[data-action],[data-open],[data-favorite],[data-view],[data-revoke]'); if (!button) return;
  try {
    if (button.dataset.filter) { state.filter = button.dataset.filter; state.topic = ''; render(); }
    else if (button.dataset.topic) { state.topic = button.dataset.topic; state.filter = 'all'; render(); }
    else if (button.dataset.view) { state.view = button.dataset.view; render(); }
    else if (button.dataset.open) await details(button.dataset.open);
    else if (button.dataset.favorite) { const p = allPosts().find(p => p.id === Number(button.dataset.favorite)); await mutate(p.id, { favorite: !p.favorite }); }
    else if (button.dataset.revoke) { if (confirm('Disconnect this browser? Its next sync will require pairing again.')) { await api(`/devices/${button.dataset.revoke}`, { method: 'DELETE' }); await settingsDialog(); } }
    else switch (button.dataset.action) {
      case 'connect': await connectDialog(); break;
      case 'add': addDialog(); break;
      case 'settings': await settingsDialog(); break;
      case 'import': importDialog(); break;
      case 'clear': state.filter = 'all'; state.topic = ''; state.query = ''; render(); break;
      case 'demo': state.demo = true; state.filter = 'all'; render(); break;
      case 'exit-demo': state.demo = false; render(); break;
      case 'logout': await api('/logout', { method: 'POST', body: {} }); modal.close(); await boot(); break;
    }
  } catch (error) { toast(error.message, true); }
});
document.addEventListener('keydown', e => { if (e.key === '/' && !modal.open && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) { e.preventDefault(); $('#search')?.focus(); } });
document.addEventListener('visibilitychange', () => { if (!document.hidden && $('#results')) refresh(true); });
setInterval(() => { if (!document.hidden && !modal.open && $('#results')) refresh(true); }, 5000);
const demoPosts = [
  { id: -1, platform: 'x', title: '', text: 'The best AI workflow isn’t the one with the most tools.\n\nIt’s the one that removes the step you keep putting off. Start there.', author: 'example_creator', authorName: 'An example creator', topics: ['AI & models', 'Tools'], favorite: true },
  { id: -2, platform: 'instagram', title: 'A small collection of useful interfaces.', text: 'Save the details that make something feel effortless: clear labels, generous spacing, and one obvious next step.', author: 'design_example', authorName: 'Design example', topics: ['Design'], favorite: false },
  { id: -3, platform: 'x', title: 'A learning list for the weekend', text: 'One paper. One working prototype. One thing you can explain to a friend.\n\nA little practice goes a long way.', author: 'learning_example', authorName: 'Learning example', topics: ['Research', 'Learning'], favorite: false },
  { id: -4, platform: 'instagram', title: 'Your next side project starts here.', text: 'The idea you scribbled down. The tutorial you saved. The tiny problem you know how to fix. Put them in the same place.', author: 'build_example', authorName: 'Build example', topics: ['Coding', 'Business'], favorite: false },
  { id: -5, platform: 'x', title: '', text: 'A note to future me:\n\nBookmark fewer things you feel you should read. Keep more things you actually want to try.', author: 'notes_example', authorName: 'Notes example', topics: ['Tools'], favorite: true },
  { id: -6, platform: 'instagram', title: 'Make room for curiosity.', text: 'A useful idea can come from anywhere. Finding it again should be the easy part.', author: 'curious_example', authorName: 'Curiosity example', topics: ['Design', 'Learning'], favorite: false }
].map((p, i) => ({ thumbnail: '', kind: 'text', tags: [], accounts: ['@example'], notes: '', archived: false, savedAt: new Date(Date.now() - i * 86400000).toISOString(), url: p.platform === 'x' ? 'https://x.com' : 'https://www.instagram.com', ...p }));
boot();
