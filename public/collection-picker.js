let current;
const key = text => text.normalize('NFKC').trim().toLocaleLowerCase('en-US');
export function closeCollectionPicker(restoreFocus = false) {
  if (!current) return;
  const picker = current; current = null;
  cancelAnimationFrame(picker.frame); picker.root.remove(); picker.trigger.setAttribute('aria-expanded', 'false');
  if (restoreFocus) picker.restoreFocus();
}
// Lists every topic with a folder icon; the post's own topics are ticked and
// listed first, and choosing one asks to remove it (onRemove) instead of adding.
export function openCollectionPicker({ trigger, post, topics, onAdd, onRemove, restoreFocus, icons = {} }) {
  closeCollectionPicker();
  const root = document.createElement('section'); root.id = 'collection-picker'; root.className = 'select-menu collection-picker';
  root.setAttribute('role','dialog'); root.setAttribute('aria-label','Add to topic');
  const form = document.createElement('form'), input = document.createElement('input');
  input.type = 'search'; input.maxLength = 80; input.placeholder = 'Find or create a topic'; input.setAttribute('aria-label','Topic name');
  const list = document.createElement('div'); list.className = 'collection-picker-list'; list.setAttribute('role','group'); list.setAttribute('aria-label','Available topics');
  const hint = document.createElement('p'); hint.className = 'collection-picker-hint';
  const create = document.createElement('button'); create.type = 'submit'; create.className = 'collection-create';
  const error = document.createElement('p'); error.className = 'form-error collection-picker-error'; error.setAttribute('role','alert');
  form.append(input,list,hint,create,error); root.append(form); document.body.append(root);
  const assigned = new Set((post.topics || []).map(key)), catalog = [...topics.filter(topic=>assigned.has(key(topic.name))), ...topics.filter(topic=>!assigned.has(key(topic.name)))];
  const picker = { root, trigger, restoreFocus, busy:false, frame:0 }; current = picker; trigger.setAttribute('aria-expanded','true');
  function position() {
    if (!trigger.isConnected) { closeCollectionPicker(); return; }
    // Sizes without the opening animation, which starts it slightly smaller. It grows out of the + button, whichever side it opens on.
    const rect = trigger.getBoundingClientRect(), box = { width: root.offsetWidth, height: root.offsetHeight }, below = rect.bottom+8, fits = below+box.height<=innerHeight-8, left = Math.max(8,Math.min(rect.left,innerWidth-box.width-8));
    root.style.left = `${left}px`;
    root.style.top = `${Math.max(8,fits?below:rect.top-box.height-8)}px`;
    root.style.transformOrigin = `${rect.left+rect.width/2-left}px ${fits?'-8px':`calc(100% + 8px)`}`;
  }
  async function add(selection) {
    if (picker.busy) return;
    picker.busy = true; root.setAttribute('aria-busy','true'); error.textContent = '';
    form.querySelectorAll('input,button').forEach(control=>control.disabled=true);
    try { await onAdd(selection); if (current === picker) closeCollectionPicker(true); }
    catch (failure) {
      if (current !== picker) return;
      picker.busy = false; root.removeAttribute('aria-busy'); error.textContent = failure.message;
      form.querySelectorAll('input,button').forEach(control=>control.disabled=false); position(); input.focus({preventScroll:true});
    }
  }
  function render() {
    const query = key(input.value), available = catalog.filter(topic=>key(topic.name).includes(query));
    list.replaceChildren();
    for (const topic of available) {
      const ticked = assigned.has(key(topic.name)), button = document.createElement('button'), name = document.createElement('span');
      button.type = 'button'; button.className = `collection-option${ticked ? ' is-assigned' : ''}`;
      name.className = 'collection-option-name'; name.textContent = topic.name;
      button.innerHTML = icons.folder || ''; button.append(name);
      if (ticked) button.insertAdjacentHTML('beforeend', `${icons.check || ''}${icons.remove || ''}`);
      button.setAttribute('aria-label', ticked ? `Remove from ${topic.name}` : `Add to ${topic.name}`);
      button.setAttribute('aria-pressed', String(ticked));
      button.onclick = () => { if (!ticked) { void add({topicId:topic.id}); return; } closeCollectionPicker(); onRemove?.(topic); };
      list.append(button);
    }
    hint.hidden = !!available.length;
    hint.textContent = query&&assigned.has(query)?'Already in this topic.':query?'No matching topics.':'Type a name to create a topic.';
    const exists = catalog.some(topic=>key(topic.name)===query);
    create.hidden = !query || exists || assigned.has(query);
    create.textContent = query ? `Create “${input.value.trim()}”` : '';
    error.textContent = ''; position();
  }
  input.oninput = render;
  form.onsubmit = event => {
    event.preventDefault(); const query=key(input.value); if (!query||assigned.has(query)) return;
    const existing=catalog.find(topic=>key(topic.name)===query);
    void add(existing?{topicId:existing.id}:{name:input.value.trim()});
  };
  root.onkeydown = event => {
    if (event.key==='Escape') { event.preventDefault(); event.stopPropagation(); closeCollectionPicker(true); }
    else if (event.key==='ArrowDown'||event.key==='ArrowUp') {
      const controls=[input,...root.querySelectorAll('button:not(:disabled):not([hidden])')];
      const index=controls.indexOf(document.activeElement), next=(index+(event.key==='ArrowDown'?1:-1)+controls.length)%controls.length;
      event.preventDefault(); controls[next].focus({preventScroll:true});
    }
  };
  root.addEventListener('focusout', event => { if (event.relatedTarget&&!root.contains(event.relatedTarget)) closeCollectionPicker(); });
  // Stay attached to the + button when the card grows or the layout moves it,
  // for example as a preview finishes loading above it.
  let last = '';
  const follow = () => {
    if (current !== picker) return;
    const rect = trigger.getBoundingClientRect(), spot = `${Math.round(rect.left)},${Math.round(rect.top)}`;
    if (spot !== last) { last = spot; position(); }
    picker.frame = requestAnimationFrame(follow);
  };
  render(); input.focus({preventScroll:true}); picker.frame = requestAnimationFrame(follow);
}
document.addEventListener('pointerdown',event=>{if(current&&!current.root.contains(event.target)&&!current.trigger.contains(event.target))closeCollectionPicker();},true);
window.addEventListener('scroll',event=>{if(current&&!(event.target instanceof Node&&current.root.contains(event.target)))closeCollectionPicker();},true);
window.addEventListener('resize',()=>closeCollectionPicker());
window.addEventListener('blur',()=>closeCollectionPicker());

document.addEventListener('keydown',event=>{if(current&&event.key==='Escape'&&!event.defaultPrevented){event.preventDefault();closeCollectionPicker(true);}});
