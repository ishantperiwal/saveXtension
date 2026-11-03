import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../server/store.mjs';
import { instagramSaveLists, setInstagramSaveList } from '../server/instagram-save-lists.mjs';
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
   assert.deepEqual(job.instagramScope,{account:'@me',selections:{'@me':[one.id]}});assert.equal(job.mode,mode);
   assert.deepEqual(instagramSaveLists(store),before);assert.equal(queue.claim('old',true,{syncModes:true,instagramCollections:true}),null);queue.cancel();
  }
  for(const id of ['1',0,-1,999999,other.id])assert.throws(()=>queue.enqueue(['instagram'],'current','quick','@me',id),/collection/);
  assert.throws(()=>queue.enqueue(['x','instagram'],'current','quick','@me',one.id),/Instagram only/);
  assert.deepEqual(queue.enqueue(['instagram'],'current','quick','current',one.id).instagramScope,{account:'@me',selections:{'@me':[one.id]}});
 }finally{store.close();}
});
