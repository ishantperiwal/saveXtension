import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../server/store.mjs';
import { hiddenInstagramSaveIds, instagramSaveLists, setInstagramSaveList } from '../server/instagram-save-lists.mjs';
import { syncQueue } from '../server/sync.mjs';
import { visibleInstagramSaves } from '../public/instagram-save-lists.js';
const folder = (id, account='me') => ({ externalId:String(id),name:`Collection ${id}`,url:`https://www.instagram.com/${account}/saved/folder/${id}/` });

test('save lists validate collection ownership, deduplicate, and restore All without deleting saves',()=>{
  const store=new Store(':memory:');
  try {
    const [one,two]=store.upsertInstagramCollections('@Me',[folder(100),folder(200)]);
    const [other]=store.upsertInstagramCollections('@other',[folder(300,'other')]);
    store.importPosts([{url:'https://www.instagram.com/p/Retained/',sourceAccount:'@Me',notes:'Keep this'}]);
    assert.deepEqual(setInstagramSaveList(store,{account:'@ME',collectionIds:[one.id,one.id]}),{'@me':[one.id]});
    assert.deepEqual(instagramSaveLists(store),{'@me':[one.id]});
    for (const collectionIds of [[],[other.id],[999999],['1']]) assert.throws(()=>setInstagramSaveList(store,{account:'@me',collectionIds}),/Choose/);
    assert.deepEqual(instagramSaveLists(store),{'@me':[one.id]});
    setInstagramSaveList(store,{account:'@me',collectionIds:[one.id,two.id]});
    assert.deepEqual(setInstagramSaveList(store,{account:'@me',collectionIds:null}),{});
    assert.equal(store.posts()[0].notes,'Keep this');
  }finally{store.close();}
});

test('Pinterest boards keep their own list, scope sync jobs and hide pins without touching Instagram',()=>{
  const store=new Store(':memory:');
  try {
    const board=(id)=>({externalId:`b${id}`,name:`Board ${id}`,url:`https://www.pinterest.com/me-1/b${id}/`});
    const [rooms,posters]=store.upsertInstagramCollections('@me-1',[board(1),board(2)],'pinterest');
    const [ideas]=store.upsertInstagramCollections('@other',[folder(100,'other')]);
    assert.deepEqual(setInstagramSaveList(store,{platform:'pinterest',account:'@Me-1',collectionIds:[rooms.id]}),{'pinterest:@me-1':[rooms.id]});
    assert.throws(()=>setInstagramSaveList(store,{platform:'pinterest',account:'@me-1',collectionIds:[ideas.id]}),/boards belonging/);
    assert.throws(()=>setInstagramSaveList(store,{account:'@me-1',collectionIds:[rooms.id]}),/collections belonging/);
    assert.throws(()=>setInstagramSaveList(store,{platform:'x',account:'@me-1',collectionIds:[rooms.id]}),/Instagram or Pinterest/);
    const queue=syncQueue(store,{native:true});
    assert.deepEqual(queue.enqueue(['pinterest']).pinterestScope,{selections:{'@me-1':[rooms.id]}});queue.cancel();
    assert.deepEqual(queue.enqueue(['pinterest'],'current','quick','current',null,'@me-1').pinterestScope,{account:'@me-1',selections:{'@me-1':[rooms.id]}});queue.cancel();
    assert.equal(queue.enqueue(['instagram']).instagramScope,null);queue.cancel();
    const pin=(id,collections)=>({id,platform:'pinterest',accounts:['@me-1'],collections});
    const lists=instagramSaveLists(store),pins=[pin(1,[{id:rooms.id,account:'@me-1'}]),pin(2,[{id:posters.id,account:'@me-1'}]),{id:3,platform:'instagram',accounts:['@me-1'],collections:[]}];
    assert.deepEqual(visibleInstagramSaves(pins,lists).map(p=>p.id),[1,3]);
    assert.deepEqual(setInstagramSaveList(store,{platform:'pinterest',account:'@me-1',collectionIds:null}),{});
    assert.equal(queue.enqueue(['pinterest']).pinterestScope,null);queue.cancel();
  }finally{store.close();}
});

test('limited jobs snapshot the list and require a helper that understands it',()=>{
  const store=new Store(':memory:');
  try {
    const [one]=store.upsertInstagramCollections('@Me',[folder(100)]), queue=syncQueue(store);
    setInstagramSaveList(store,{account:'@me',collectionIds:[one.id]});
    const job=queue.enqueue(['instagram'],'current','deep','@Me');
    assert.deepEqual(job.instagramScope,{account:'@Me',selections:{'@me':[one.id]}});
    setInstagramSaveList(store,{account:'@me',collectionIds:null});
    assert.deepEqual(syncQueue(store).status().job.instagramScope,job.instagramScope);
    assert.equal(queue.claim('old',true,{syncModes:true,instagramCollections:true}),null);
    assert.equal(queue.claim('new',true,{syncModes:true,instagramCollections:true,instagramSaveLists:true}).status,'running');
    queue.cancel();
    assert.equal(queue.enqueue(['instagram']).instagramScope,null);
    queue.cancel();
    assert.throws(()=>queue.enqueue(['instagram'],'current','quick','invalid'),/Instagram account/);
  }finally{store.close();}
});

test('list visibility keeps shared membership, other owners, X and Chrome while hiding unselected Instagram posts',()=>{
  const p=(id,accounts,collections,platform='instagram')=>({id,accounts,collections,platform});
  const collection=(id,account='@me')=>({id,account});
  const posts=[p(1,['@me'],[collection(1)]),p(2,['@me'],[collection(2)]),p(3,['@me'],[]),p(4,['@other'],[]),p(5,['@me','@other'],[collection(2)]),p(6,['@me'],[],'x'),p(7,[],[],'chrome'),p(8,[],[])];
  assert.deepEqual(visibleInstagramSaves(posts,{'@me':[1]}).map(p=>p.id),[1,4,5,6,7,8]);
  assert.equal(visibleInstagramSaves(posts,{}).length,8);
  assert.deepEqual(visibleInstagramSaves(posts,{'@me':[1]},['instagram:@me']).filter(p=>p.platform==='instagram'&&p.accounts.includes('@me')).map(p=>p.id),[1]);
  assert.deepEqual(visibleInstagramSaves(posts,{'@me':[1],'@other':[3]}).map(p=>p.id),[1,6,7,8]);
});

test('hidden IDs match the rule run on full saves, and the rule reads only what the narrow query loads',()=>{
  const store=new Store(':memory:');
  try {
    store.importPosts([
      {url:'https://www.instagram.com/p/Picked/',sourceAccount:'@Me',collections:[{account:'@Me',name:'Picked',url:'https://www.instagram.com/me/saved/picked/100/'}]},
      {url:'https://www.instagram.com/p/Unpicked/',sourceAccount:'@Me',collections:[{account:'@Me',name:'Unpicked',url:'https://www.instagram.com/me/saved/unpicked/200/'}]},
      {url:'https://www.instagram.com/p/NoFolder/',sourceAccount:'@Me'},
      {url:'https://www.instagram.com/p/Archived/',sourceAccount:'@Me',archived:true},
      {url:'https://www.instagram.com/p/Shared/',accounts:['@Me','@other']},
      {url:'https://www.instagram.com/p/Other/',sourceAccount:'@other'},
      {url:'https://x.com/alice/status/1',sourceAccount:'@Me'},
      {url:'https://www.pinterest.com/pin/123/',sourceAccount:'@Me'},
      {platform:'chrome',url:'https://example.org/guide'}
    ]);
    setInstagramSaveList(store,{account:'@Me',collectionIds:[store.instagramCollections().find(c=>c.name==='Picked').id]});
    const full=store.posts({scope:'all'}),lists=instagramSaveLists(store),visible=new Set(visibleInstagramSaves(full,lists).map(p=>p.id)),hidden=hiddenInstagramSaveIds(store);
    assert.deepEqual([...hidden].sort(),full.filter(p=>!visible.has(p.id)).map(p=>p.id).sort());
    assert.deepEqual(full.filter(p=>hidden.includes(p.id)).map(p=>p.url.split('/').at(-2)).sort(),['Archived','NoFolder','Unpicked']);
    // The narrow query must load every field the rule reads, or deselected saves would silently appear.
    const read=new Set(),watch=(value,prefix='')=>new Proxy(value,{get:(target,key)=>{if(typeof key==='string')read.add(prefix+key);return target[key];}});
    visibleInstagramSaves(full.map(p=>watch({...p,collections:p.collections.map(c=>watch(c,'collections.'))})),lists);
    assert(read.has('collections.id'));
    assert.deepEqual([...read].filter(field=>!['id','platform','accounts','collections','collections.id','collections.account'].includes(field)),[]);
  } finally{store.close();}
});

test('HTTP selection updates are returned by library reads and applied to new sync jobs',async()=>{
  const {createApp}=await import('../server/app.mjs');
  const {once}=await import('node:events');
  const origin='http://localhost:3238', app=createApp({origin});
  app.server.listen(3238,'127.0.0.1');await once(app.server,'listening');
  async function request(path,input){const response=await fetch(origin+'/api'+path,{method:input===undefined?'GET':'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:input===undefined?undefined:JSON.stringify(input)});return{status:response.status,data:await response.json()};}
  try{
    const [collection]=app.store.upsertInstagramCollections('@me',[folder(100)]);
    assert.equal((await request('/instagram-save-list',{account:'@me',collectionIds:[collection.id]})).status,200);
    assert.deepEqual((await request('/posts')).data.instagramSaveLists,{'@me':[collection.id]});
    const job=(await request('/sync',{targets:['instagram'],instagramAccount:'@me',mode:'quick'})).data.job;
    assert.deepEqual(job.instagramScope,{account:'@me',selections:{'@me':[collection.id]}});
    assert.equal((await request('/instagram-save-list',{account:'@me',collectionIds:[]})).status,400);
  }finally{app.server.closeAllConnections();await new Promise(resolve=>app.server.close(resolve));app.store.close();}
});

test('All and pinned collections persist independently; only All-off restricts jobs and visibility',()=>{
  const store=new Store(':memory:');
  try{
    const [one,two]=store.upsertInstagramCollections('@me',[folder(100),folder(200)]), queue=syncQueue(store);
    const posts=[{id:1,platform:'instagram',accounts:['@me'],collections:[one]},{id:2,platform:'instagram',accounts:['@me'],collections:[two]},{id:3,platform:'instagram',accounts:['@me'],collections:[]}];
    let lists=setInstagramSaveList(store,{account:'@me',all:true,collectionIds:[one.id]});
    assert.deepEqual(lists,{'@me':{all:true,collectionIds:[one.id]}});
    assert.equal(visibleInstagramSaves(posts,lists).length,3);
    assert.equal(queue.enqueue(['instagram']).instagramScope,null);queue.cancel();
    lists=setInstagramSaveList(store,{account:'@me',all:false,collectionIds:[one.id]});
    assert.deepEqual(visibleInstagramSaves(posts,lists).map(p=>p.id),[1]);
    assert.deepEqual(queue.enqueue(['instagram']).instagramScope.selections,{'@me':[one.id]});queue.cancel();
    lists=setInstagramSaveList(store,{account:'@me',all:true,collectionIds:[]});
    assert.deepEqual(lists,{'@me':{all:true,collectionIds:[]}});
    assert.equal(visibleInstagramSaves(posts,lists).length,3);
    assert.throws(()=>setInstagramSaveList(store,{account:'@me',all:false,collectionIds:[]}),/Choose/);
    assert.throws(()=>setInstagramSaveList(store,{account:'@me',all:true,collectionIds:[99999]}),/belonging/);
  }finally{store.close();}
});

test('collection-only refresh snapshots exactly one owned collection without changing saved preferences',()=>{
 const store=new Store(':memory:');try{
  const [one,two]=store.upsertInstagramCollections('@me',[folder(100),folder(200)]),[other]=store.upsertInstagramCollections('@other',[folder(300,'other')]),queue=syncQueue(store);
  setInstagramSaveList(store,{account:'@me',all:true,collectionIds:[one.id,two.id]});const before=instagramSaveLists(store);
  for(const mode of ['quick','deep']){
   const job=queue.enqueue(['instagram'],'current',mode,'@me',one.id);
   assert.deepEqual(job.instagramScope,{account:'@me',refresh:true,selections:{'@me':[one.id]}});assert.equal(job.mode,mode);
   assert.deepEqual(instagramSaveLists(store),before);assert.equal(queue.claim('old',true,{syncModes:true,instagramCollections:true}),null);queue.cancel();
  }
  for(const id of ['1',0,-1,999999,other.id])assert.throws(()=>queue.enqueue(['instagram'],'current','quick','@me',id),/collection/);
  assert.throws(()=>queue.enqueue(['x','instagram'],'current','quick','@me',one.id),/Instagram only/);
  assert.deepEqual(queue.enqueue(['instagram'],'current','quick','current',one.id).instagramScope,{account:'@me',refresh:true,selections:{'@me':[one.id]}});
 }finally{store.close();}
});
