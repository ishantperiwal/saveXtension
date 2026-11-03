let current;
const key = text => text.normalize('NFKC').trim().toLocaleLowerCase('en-US');
export function closeCollectionPicker(restoreFocus = false) {
  if (!current) return;
  const picker = current; current = null;
  picker.root.remove(); picker.trigger.setAttribute('aria-expanded', 'false');
  if (restoreFocus) picker.restoreFocus();
}
export function openCollectionPicker({ trigger, post, topics, onAdd, restoreFocus }) {
  closeCollectionPicker();
  const root = document.createElement('section'); root.id = 'collection-picker'; root.className = 'select-menu collection-picker';
  root.setAttribute('role','dialog'); root.setAttribute('aria-label','Add to collection');
  const form = document.createElement('form'), input = document.createElement('input');
  input.type = 'search'; input.maxLength = 80; input.placeholder = 'Find or create a collection'; input.setAttribute('aria-label','Collection name');
  const list = document.createElement('div'); list.className = 'collection-picker-list'; list.setAttribute('role','group'); list.setAttribute('aria-label','Available collections');
  const hint = document.createElement('p'); hint.className = 'collection-picker-hint';
  const create = document.createElement('button'); create.type = 'submit'; create.className = 'collection-create';
  const error = document.createElement('p'); error.className = 'form-error collection-picker-error'; error.setAttribute('role','alert');
  form.append(input,list,hint,create,error); root.append(form); document.body.append(root);
  const assigned = new Set((post.topics || []).map(key)), catalog = [...topics].sort((a,b)=>a.name.localeCompare(b.name));
  const picker = { root, trigger, restoreFocus, busy:false }; current = picker; trigger.setAttribute('aria-expanded','true');
  function position() {
    if (!trigger.isConnected) { closeCollectionPicker(); return; }
    const rect = trigger.getBoundingClientRect(), box = root.getBoundingClientRect();
    root.style.left = `${Math.max(8,Math.min(rect.left,innerWidth-box.width-8))}px`;
    const below = rect.bottom+8;
    root.style.top = `${Math.max(8,below+box.height<=innerHeight-8?below:rect.top-box.height-8)}px`;
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
    const query = key(input.value), available = catalog.filter(topic=>!assigned.has(key(topic.name))&&key(topic.name).includes(query));
    list.replaceChildren();
    for (const topic of available) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'collection-option';
      button.textContent = topic.name; button.setAttribute('aria-label',`Add to ${topic.name}`); button.onclick = ()=>void add({topicId:topic.id}); list.append(button);
    }
    hint.hidden = !!available.length;
    hint.textContent = query&&assigned.has(query)?'Already in this collection.':query?'No matching collections.':'Type a name to create a collection.';
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
  root.onfocusout = event => { if (event.relatedTarget&&!root.contains(event.relatedTarget)) closeCollectionPicker(); };
  render(); input.focus({preventScroll:true});
}
document.addEventListener('pointerdown',event=>{if(current&&!current.root.contains(event.target)&&!current.trigger.contains(event.target))closeCollectionPicker();},true);
window.addEventListener('scroll',event=>{if(current&&!(event.target instanceof Node&&current.root.contains(event.target)))closeCollectionPicker();},true);
window.addEventListener('resize',()=>closeCollectionPicker());
window.addEventListener('blur',()=>closeCollectionPicker());

document.addEventListener('keydown',event=>{if(current&&event.key==='Escape'&&!event.defaultPrevented){event.preventDefault();closeCollectionPicker(true);}});
