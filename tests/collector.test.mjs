import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

test('a large already-rendered grid is acknowledged in bounded batches', async () => {
  const dom = new JSDOM('<main></main>', { url: 'https://www.instagram.com/me/saved/all-posts/', runScripts: 'outside-only' });
  const main = dom.window.document.querySelector('main');
  for (let i = 0; i < 205; i++) { const anchor = dom.window.document.createElement('a'); anchor.href = `/p/Test${i}/`; main.append(anchor); }
  const batches = []; let listener, finish;
  const finished = new Promise(resolve => { finish = resolve; });
  dom.window.Element.prototype.scrollTo = () => {};
  dom.window.Element.prototype.scrollBy = () => {};
  dom.window.setTimeout = callback => setTimeout(callback, 0);
  dom.window.chrome = { runtime: { id: 'test-extension', onMessage: { addListener: fn => { listener = fn; } },
    sendMessage: async message => {
      if (message.type === 'SYNC_BATCH') batches.push(message.posts);
      if (message.type === 'SYNC_FINISH') finish(message);
      return { ok: true };
    }
  } };
  dom.window.eval(await readFile(new URL('../extension/extractors.js', import.meta.url), 'utf8'));
  dom.window.eval(await readFile(new URL('../extension/collector.js', import.meta.url), 'utf8'));
  listener({ type: 'START_COLLECT', options: { runId: 'test', platform: 'instagram', maxPosts: 205 } }, { id: 'test-extension' }, response => assert.equal(response.ok, true));
  const final = await finished;
  assert.deepEqual(batches.map(batch => batch.length), [100, 100, 5]); assert.equal(final.seen, 205); assert.equal(final.status, 'partial'); assert.match(final.message, /205-post/);
  dom.window.close();
});

test('scroll events advance virtualized feeds in a hidden collector tab', async () => {
  const dom = new JSDOM('<main><a href="/p/First/"></a></main>', { url: 'https://www.instagram.com/me/saved/all-posts/', runScripts: 'outside-only' });
  dom.window.Element.prototype.scrollTo = () => {}; dom.window.Element.prototype.scrollBy = () => {};
  dom.window.setTimeout = callback => setTimeout(callback, 0);
  let generated = 1, listener, finish; const batches = [];
  const finished = new Promise(resolve => { finish = resolve; });
  dom.window.addEventListener('scroll', () => {
    if (generated < 4) { const link = dom.window.document.createElement('a'); link.href = `/p/Next${generated++}/`; dom.window.document.querySelector('main').append(link); }
  });
  dom.window.chrome = { runtime: { id: 'test', onMessage: { addListener: fn => { listener = fn; } }, sendMessage: async message => { if (message.type === 'SYNC_BATCH') batches.push(...message.posts); if (message.type === 'SYNC_FINISH') finish(message); return { ok: true }; } } };
  dom.window.eval(await readFile(new URL('../extension/extractors.js', import.meta.url), 'utf8'));
  dom.window.eval(await readFile(new URL('../extension/collector.js', import.meta.url), 'utf8'));
  listener({ type: 'START_COLLECT', options: { runId: 'test', platform: 'instagram', maxPosts: 4 } }, { id: 'test' }, () => {});
  const result = await finished; assert.equal(result.seen, 4); assert.equal(batches.length, 4); dom.window.close();
});

async function runPages(pages, options, batchResponse = {}) {
  const platform = options.platform || 'instagram';
  const dom = new JSDOM('<main></main>', { url: 'https://www.instagram.com/me/saved/all-posts/', runScripts: 'outside-only' });
  dom.window.Element.prototype.scrollTo = () => {}; dom.window.Element.prototype.scrollBy = () => {};
  dom.window.setTimeout = callback => setTimeout(callback, 0);
  let page = 0, listener, finish; const batches = [];
  const finished = new Promise(resolve => { finish = resolve; });
  dom.window.Element.prototype.scrollBy = () => { page = Math.min(page + 1, pages.length - 1); };
  // jsdom has no layout, so say whether the list has more to scroll. Unless told otherwise, it does.
  Object.defineProperties(dom.window.Element.prototype, { clientHeight: { get: () => 800 }, scrollHeight: { get: () => options.atEnd ? 800 : 5000 } });
  if (options.loading) dom.window.document.querySelector('main').innerHTML = '<div role="progressbar"></div>';
  dom.window.SaveXExtractors = {
    pageInfo: () => ({ valid: true, platform, account: '@me' }),
    extract: () => pages[page].map(id => ({ url: platform === 'x' ? `https://x.com/i/status/${id}` : `https://www.instagram.com/p/${id}/` }))
  };
  dom.window.chrome = { runtime: { id: 'test', onMessage: { addListener: fn => { listener = fn; } }, sendMessage: async message => {
    if (message.type === 'SYNC_BATCH') { batches.push(...message.posts); return { ok: true, ...batchResponse }; }
    if (message.type === 'SYNC_FINISH') finish(message);
    return { ok: true };
  } } };
  dom.window.eval(await readFile(new URL('../extension/collector.js', import.meta.url), 'utf8'));
  listener({ type: 'START_COLLECT', options: { runId: 'test', platform: 'instagram', maxPosts: 100000, ...options } }, { id: 'test' }, () => {});
  const result = await finished; dom.window.close(); return { result, batches, page };
}

test('quick sync imports new IDs and stops after seven distinct previously saved IDs', async () => {
  const knownIds = Array.from({ length: 7 }, (_, i) => `Known${i}`);
  const { result, batches, page } = await runPages([['New1', 'New2', ...knownIds], ['OlderMissing']], { mode: 'quick', knownIds });
  assert.equal(result.status, 'completed'); assert.match(result.message, /Older history was not checked/);
  assert.equal(batches.length, 2); assert.equal(page, 0);
});

for (const platform of ['x', 'instagram']) {
  const ids = Array.from({length:14},(_,i)=>platform==='x'?String(100+i):`Known${i}`);
  const fresh=platform==='x'?'999':'Fresh';
  test(`${platform}: a new post resets the seven-post boundary, including later in the loaded viewport`,async()=>{
    const {result,batches,page}=await runPages([
      [...ids.slice(0,7),fresh,...ids.slice(7,13)],
      [ids[12],ids[13]],
      [platform==='x'?'998':'OlderMissing']
    ],{platform,mode:'quick',knownIds:ids});
    assert.equal(result.status,'completed');assert.equal(page,1);
    assert.equal(result.seen,15);
    assert.ok(batches.some(post=>post.url.includes(fresh)));
    assert.equal(batches.length,platform==='x'?15:1);
  });
  test(`${platform}: six known IDs repeated across viewports cannot stop the scan`,async()=>{
    const {result,batches}=await runPages([ids.slice(0,6)],{platform,mode:'quick',knownIds:ids});
    assert.equal(result.status,'partial');assert.equal(result.seen,6);
    assert.equal(batches.length,platform==='x'?6:0);
  });
}

test('deep scans pass known IDs and discover gaps beyond the old 500-post limit', async () => {
  const knownIds = Array.from({ length: 600 }, (_, i) => `Known${i}`);
  const { result, batches } = await runPages([knownIds, ['OlderMissing']], { mode: 'deep', knownIds });
  assert.equal(result.seen, 601); assert.equal(batches.length, 601);
  assert.equal(result.status, 'partial'); assert.match(result.message, /removals are not verified/);
});

for (const platform of ['instagram', 'x']) {
  const short = platform === 'x' ? ['101', '102'] : ['Known1', 'Known2'];
  test(`${platform}: a list shorter than the boundary is finished once it reaches its end`, async () => {
    const { result } = await runPages([short], { platform, mode: 'quick', knownIds: short, atEnd: true });
    assert.equal(result.status, 'completed'); assert.equal(result.seen, 2); assert.equal(result.message, 'Reached the end of this list.');
  });
  test(`${platform}: a list that can still scroll, or is still loading at its end, stays unfinished`, async () => {
    for (const layout of [{}, { atEnd: true, loading: true }]) {
      const { result } = await runPages([short], { platform, mode: 'quick', knownIds: short, ...layout });
      assert.equal(result.status, 'partial', JSON.stringify(layout)); assert.match(result.message, /without more posts loading/);
    }
  });
}
test('repeated viewport content never becomes a false quick-sync boundary', async () => {
  const { result, batches } = await runPages([['Known', 'New']], { mode: 'quick', knownIds: ['Known'] });
  assert.equal(result.status, 'partial'); assert.equal(result.seen, 2); assert.equal(batches.length, 1);
});

test('a rejected new save cannot result in a successful quick boundary', async () => {
  const knownIds = Array.from({ length: 20 }, (_, i) => `Known${i}`);
  const { result } = await runPages([['New', ...knownIds]], { mode: 'quick', knownIds }, { rejected: 1 });
  assert.equal(result.status, 'failed'); assert.match(result.message, /could not be saved/);
});


test('quick X scans retain the observed familiar prefix when an existing bookmark moves ahead of new posts', async () => {
  const knownIds=Array.from({length:21},(_,i)=>String(i+1));
  const {result,batches,page}=await runPages([[knownIds[10],'999',...knownIds],['1000']],{platform:'x',mode:'quick',knownIds});
  assert.equal(result.status,'completed');assert.equal(page,0);assert.equal(batches.length,22);
  assert.deepEqual(batches.slice(0,3).map(p=>p.url),['https://x.com/i/status/11','https://x.com/i/status/999','https://x.com/i/status/1']);
});

test('a source restored halfway down is reset before capturing its first ordered batch',async()=>{
 const dom=new JSDOM('<main></main>',{url:'https://x.com/i/bookmarks',runScripts:'outside-only'});
 let listener,finish,current=['99','98'],scrollTop=600;const batches=[],finished=new Promise(resolve=>finish=resolve);
 const root=dom.window.document.documentElement;Object.defineProperty(root,'scrollTop',{get:()=>scrollTop});
 dom.window.Element.prototype.scrollTo=function({top}){scrollTop=top;if(top===0)current=['101','100','99','98'];};dom.window.Element.prototype.scrollBy=()=>{};
 dom.window.setTimeout=callback=>setTimeout(callback,0);
 dom.window.SaveXExtractors={pageInfo:()=>({valid:true,platform:'x',account:'@me'}),extract:()=>current.map(id=>({url:`https://x.com/i/status/${id}`}))};
 dom.window.chrome={runtime:{id:'test',onMessage:{addListener:fn=>listener=fn},sendMessage:async message=>{if(message.type==='SYNC_BATCH')batches.push(...message.posts);if(message.type==='SYNC_FINISH')finish(message);return{ok:true};}}};
 dom.window.eval(await readFile(new URL('../extension/collector.js',import.meta.url),'utf8'));
 listener({type:'START_COLLECT',options:{runId:'test',platform:'x',maxPosts:4,mode:'quick',knownIds:[]}},{id:'test'},()=>{});await finished;await new Promise(setImmediate);
 assert.deepEqual(batches.map(p=>p.url.match(/\d+$/)[0]),['101','100','99','98']);assert.equal(scrollTop,600);dom.window.close();
});

test('a loading first viewport settles at the top before any scrolling or source positions are emitted',async()=>{
 const dom=new JSDOM('<main></main>',{url:'https://x.com/i/bookmarks',runScripts:'outside-only'});
 let listener,finish,reads=0,scrolls=0;const batches=[],finished=new Promise(resolve=>finish=resolve);
 dom.window.Element.prototype.scrollTo=()=>{};dom.window.Element.prototype.scrollBy=()=>scrolls++;
 dom.window.setTimeout=callback=>setTimeout(callback,0);
 dom.window.SaveXExtractors={pageInfo:()=>({valid:true,platform:'x',account:'@me'}),extract:()=>{reads++;const ids=reads<3?[]:reads<5?['100','99']:['101','100','99'];return ids.map(id=>({url:`https://x.com/i/status/${id}`}));}};
 dom.window.chrome={runtime:{id:'test',onMessage:{addListener:fn=>listener=fn},sendMessage:async message=>{if(message.type==='SYNC_BATCH')batches.push(...message.posts);if(message.type==='SYNC_FINISH')finish(message);return{ok:true};}}};
 dom.window.eval(await readFile(new URL('../extension/collector.js',import.meta.url),'utf8'));
 listener({type:'START_COLLECT',options:{runId:'test',platform:'x',maxPosts:3,mode:'quick',knownIds:[]}},{id:'test'},()=>{});await finished;
 assert.deepEqual(batches.map(p=>p.url.match(/\d+$/)[0]),['101','100','99']);assert.equal(scrolls,1);dom.window.close();
});
