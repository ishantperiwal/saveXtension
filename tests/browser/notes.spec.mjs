import { test, expect } from '@playwright/test';
async function seed(page) {
  const imported=await page.request.post('/api/posts/import',{headers:{Origin:'http://localhost:3211'},data:{posts:[
    {platform:'chrome',url:'https://notes-fixture.example/first',bookmarkTitle:'First reference',title:'Legacy custom title',tags:['legacy tag'],notes:'Original note'},
    {platform:'chrome',url:'https://notes-fixture.example/second',bookmarkTitle:'Second reference',notes:''}
  ]}});
  await expect(imported).toBeOK();
  const {posts}=await (await page.request.get('/api/posts')).json();
  return posts.filter(p=>p.url.startsWith('https://notes-fixture.example/'));
}
const card=(page,id)=>page.locator(`.save-card[data-post-id="${id}"]`);
const field=(page,id)=>card(page,id).getByLabel('Note',{exact:true});
const status=(page,id)=>card(page,id).locator('.note-status');
async function saved(page,id){return (await (await page.request.get('/api/posts')).json()).posts.find(p=>p.id===id);}
async function open(page,id){await card(page,id).getByRole('button',{name:'Edit note',exact:true}).click();}
test.afterEach(async({page})=>{
  const {posts}=await (await page.request.get('/api/posts')).json();
  for(const p of posts.filter(p=>p.url.startsWith('https://notes-fixture.example/'))) await page.request.delete('/api/posts/'+p.id,{headers:{Origin:'http://localhost:3211'}});
});

test('sticky notes autosave inline, retain concurrent edits and flush between saves and search',async({page})=>{
  const posts=await seed(page),first=posts.find(p=>p.bookmarkTitle==='First reference'),second=posts.find(p=>p.bookmarkTitle==='Second reference');
  let release;const gate=new Promise(resolve=>{release=resolve;}),requests=[];
  await page.route(`**/api/posts/${first.id}`,async route=>{if(route.request().method()==='PATCH'){requests.push(route.request().postDataJSON());if(requests.length===1)await gate;}await route.continue();});
  try{
    await page.goto('/'); await open(page,first.id);
    await expect(page.locator('#modal')).not.toBeVisible();
    await expect(page.getByLabel('Title',{exact:true})).toHaveCount(0);
    await expect(page.getByLabel('Tags',{exact:true})).toHaveCount(0);
    await expect(page.getByRole('button',{name:'Save changes'})).toHaveCount(0);
    await expect(card(page,first.id).getByRole('button',{name:'Delete',exact:true})).toHaveCount(0);
    const editor=await field(page,first.id).elementHandle();
    await field(page,first.id).fill('First draft'); await expect.poll(()=>requests.length).toBe(1);
    await field(page,first.id).fill('Latest draft');
    await open(page,second.id); await field(page,second.id).fill('Independent second note');
    await page.getByRole('searchbox').focus();release();
    await expect.poll(async()=>(await saved(page,first.id)).notes).toBe('Latest draft');
    await expect.poll(async()=>(await saved(page,second.id)).notes).toBe('Independent second note');
    expect(await editor.evaluate(el=>el.isConnected)).toBe(true);
    await page.reload(); await open(page,first.id);await expect(field(page,first.id)).toHaveValue('Latest draft');
    expect((await saved(page,first.id)).title).toBe('Legacy custom title');expect((await saved(page,first.id)).tags).toEqual(['legacy tag']);
    await field(page,first.id).fill('Save before searching');
    const mac=await page.evaluate(()=>/Mac|iPhone|iPad|iPod/i.test(navigator.userAgentData?.platform||navigator.platform||''));
    await page.keyboard.press(mac?'Meta+f':'Control+f');await expect(page.getByRole('searchbox')).toBeFocused();
    await expect.poll(async()=>(await saved(page,first.id)).notes).toBe('Save before searching');
    await open(page,first.id);await field(page,first.id).fill('');await page.getByRole('searchbox').focus();
    await expect.poll(async()=>(await saved(page,first.id)).notes).toBe('');
    await expect(card(page,first.id).locator('.card-note')).toBeHidden();
  }finally{release();}
});

test('an offline inline draft survives reload and saves automatically after reconnection',async({page})=>{
  const first=(await seed(page)).find(p=>p.bookmarkTitle==='First reference');let online=false;
  await page.route(`**/api/posts/${first.id}`,route=>online?route.continue():route.abort('internetdisconnected'));
  await page.goto('/');await open(page,first.id);await field(page,first.id).fill('Offline draft to recover');
  await expect(status(page,first.id)).toContainText('Not saved yet');expect((await saved(page,first.id)).notes).toBe('Original note');
  await page.reload();await expect(field(page,first.id)).toHaveValue('Offline draft to recover');
  online=true;await page.evaluate(()=>window.dispatchEvent(new Event('online')));
  await expect(status(page,first.id)).toHaveAttribute('data-state','saved');await expect(status(page,first.id)).toBeEmpty();
  await expect.poll(async()=>(await saved(page,first.id)).notes).toBe('Offline draft to recover');
  await expect.poll(()=>page.evaluate(()=>localStorage.getItem('savex-note-drafts'))).toBe('[]');
  await expect(card(page,first.id).locator('.card-content')).toHaveCSS('opacity','1');
  await page.screenshot({path:'test-results/inline-sticky-note.png',fullPage:true});
});

test('typing stays focused through autosave, grows the note and keeps an edited search match in view',async({page})=>{
  const first=(await seed(page)).find(p=>p.bookmarkTitle==='First reference');
  await page.goto('/');await page.getByRole('searchbox').fill('Original note');await open(page,first.id);
  const editor=await field(page,first.id).elementHandle();
  const text='My interpretation <script>window.untrusted=true</script>\n'+Array.from({length:12},(_,i)=>`Context line ${i+1}: a useful reference for the next project.`).join('\n');
  await field(page,first.id).fill(text);await field(page,first.id).press('Home');
  const caret=await field(page,first.id).evaluate(el=>el.selectionStart);
  await expect.poll(async()=>(await saved(page,first.id)).notes).toBe(text);
  await expect(field(page,first.id)).toBeFocused();await expect(field(page,first.id)).toHaveValue(text);
  expect(await editor.evaluate(el=>el.isConnected)).toBe(true);
  expect(await field(page,first.id).evaluate(el=>el.selectionStart)).toBe(caret);
  expect(await field(page,first.id).evaluate(el=>el.scrollHeight<=el.clientHeight+2)).toBe(true);
  expect(await page.evaluate(()=>window.untrusted)).toBeUndefined();
  await page.setViewportSize({width:390,height:844});
  expect(await field(page,first.id).evaluate(el=>el.scrollHeight<=el.clientHeight+2)).toBe(true);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('long notes show six lines, expand on demand and reveal the full editor without changing saved text',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  const first=(await seed(page)).find(p=>p.bookmarkTitle==='First reference');
  const text=Array.from({length:12},(_,i)=>`Reference line ${i+1}: context worth keeping.`).join('\n');
  await page.request.patch('/api/posts/'+first.id,{headers:{Origin:'http://localhost:3211'},data:{notes:text}});
  let writes=0;await page.route(`**/api/posts/${first.id}`,route=>{if(route.request().method()==='PATCH')writes++;return route.continue();});
  await page.goto('/');
  const note=field(page,first.id),more=card(page,first.id).getByRole('button',{name:'Read more',exact:true});
  await expect(more).toBeVisible();await expect(note).toHaveValue(text);
  const placement=await card(page,first.id).evaluate(card=>{
    const rect=selector=>card.querySelector(selector).getBoundingClientRect();
    return {noteTop:rect('.card-note').top,noteBottom:rect('.card-note').bottom,headerBottom:rect('.card-header').bottom,previewTop:rect('.card-preview').top};
  });
  expect(placement.noteTop).toBeGreaterThanOrEqual(placement.headerBottom);expect(placement.previewTop).toBeGreaterThanOrEqual(placement.noteBottom);
  expect(await note.evaluate(el=>el.clientHeight)).toBeLessThanOrEqual(132);
  expect(await note.evaluate(el=>el.scrollHeight)).toBeGreaterThan(132);
  await more.click();
  const less=card(page,first.id).getByRole('button',{name:'Show less',exact:true});
  await expect(less).toHaveAttribute('aria-expanded','true');
  expect(await note.evaluate(el=>el.clientHeight)).toBeGreaterThan(132);
  await less.click();await expect(more).toBeVisible();
  expect(await note.evaluate(el=>el.clientHeight)).toBeLessThanOrEqual(132);
  await open(page,first.id);await expect(note).toBeFocused();
  expect(await note.evaluate(el=>el.clientHeight)).toBeGreaterThan(132);
  await expect(more).toBeHidden();
  await page.getByRole('searchbox').focus();await expect(more).toBeVisible();
  expect(await note.evaluate(el=>el.clientHeight)).toBeLessThanOrEqual(132);
  expect(writes).toBe(0);expect((await saved(page,first.id)).notes).toBe(text);
  await page.setViewportSize({width:390,height:844});
  await expect(more).toBeVisible();expect(await note.evaluate(el=>el.clientHeight)).toBeLessThanOrEqual(132);
  await expect(card(page,first.id).locator('.card-content')).toHaveCSS('opacity','1');
  await card(page,first.id).screenshot({path:'test-results/note-six-lines.png'});
  await more.click();await expect(less).toBeVisible();
  expect(await note.evaluate(el=>el.scrollHeight<=el.clientHeight+2)).toBe(true);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.request.patch('/api/posts/'+first.id,{headers:{Origin:'http://localhost:3211'},data:{notes:'Exactly\nsix\nshort\nlines\nof\ncontext'}});
  await page.reload();await expect(card(page,first.id).getByRole('button',{name:'Read more',exact:true})).toBeHidden();
});

test('pencil slides an empty note open and closed, handles quick repeats and keeps written notes',async({page})=>{
  const posts=await seed(page),second=posts.find(p=>p.bookmarkTitle==='Second reference');
  await page.goto('/');
  const pencil=card(page,second.id).getByRole('button',{name:'Edit note',exact:true}),section=card(page,second.id).locator('.card-note'),note=field(page,second.id);
  await expect(section).toBeHidden();
  // Record when motion starts: a slow runner can finish the short animation
  // before focus/ARIA assertions return, making getAnimations() an unreliable
  // historical assertion. Preserve the real animation and its actual frames.
  await section.evaluate(el=>{
    const animate=el.animate;
    el.animate=function(...args){
      const animation=animate.apply(this,args);
      this.__testNoteAnimation={frames:animation.effect.getKeyframes(),duration:animation.effect.getTiming().duration};
      return animation;
    };
  });
  await pencil.click();await expect(note).toBeFocused();await expect(pencil).toHaveAttribute('aria-expanded','true');
  const animation=await section.evaluate(el=>el.__testNoteAnimation||null);
  expect(animation).not.toBeNull();expect(animation.frames[0].height).toBe('0px');expect(animation.duration).toBeGreaterThan(150);
  await expect.poll(()=>section.evaluate(el=>el.getAnimations().length)).toBe(0);
  expect(await section.evaluate(el=>el.offsetHeight)).toBeGreaterThan(80);
  await pencil.click();await expect(pencil).toHaveAttribute('aria-expanded','false');await expect(section).toBeHidden();
  await expect(pencil).toBeFocused();
  await pencil.click();await pencil.click();await pencil.click();
  await expect(pencil).toHaveAttribute('aria-expanded','true');await expect(note).toBeFocused();
  await expect.poll(()=>section.evaluate(el=>el.getAnimations().length)).toBe(0);
  await note.fill('Keep this interpretation');
  await expect.poll(async()=>(await saved(page,second.id)).notes).toBe('Keep this interpretation');
  await pencil.click();await expect(section).toBeVisible();await expect(note).toHaveValue('Keep this interpretation');await expect(note).toBeFocused();
  await note.fill('');await pencil.click();await expect(section).toBeHidden();
  await expect.poll(async()=>(await saved(page,second.id)).notes).toBe('');
  await pencil.focus();await page.keyboard.press('Space');await expect(note).toBeFocused();
  await page.keyboard.press('Shift+Tab');await expect(pencil).toBeFocused();await page.keyboard.press('Space');await expect(section).toBeHidden();
  await page.emulateMedia({reducedMotion:'reduce'});await pencil.click();await expect(note).toBeFocused();
  expect(await section.evaluate(el=>el.getAnimations().length)).toBe(0);
  await pencil.click();await expect(section).toBeHidden();expect(await section.evaluate(el=>el.getAnimations().length)).toBe(0);
});
