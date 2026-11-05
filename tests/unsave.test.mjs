import test from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../server/store.mjs';
import {syncQueue} from '../server/sync.mjs';
import {unsaveQueue} from '../server/unsave.mjs';
import {TopicLibrary} from '../server/topics.mjs';
import {createApp} from '../server/app.mjs';
import {once} from 'node:events';
import {BUSY,busyNotice} from '../public/busy-messages.js';
const seed=(store,platform='x',accounts=['@one'])=>{store.importPosts([{url:platform==='x'?'https://x.com/i/status/12345':'https://www.instagram.com/p/ExactPost/',accounts,notes:'Private note to delete',topics:['Design'],topicsCurated:true}]);return store.posts()[0];};
const setup=()=>{const store=new Store(':memory:'),sync=syncQueue(store),queue=unsaveQueue(store,sync);sync.heartbeat({instance:'browser',ready:true,unsave:true});return{store,sync,queue};};
const evidence=job=>[Date.now()-500,Date.now()].map(checkedAt=>({state:'unsaved',account:job.account,externalId:job.external_id,checkedAt}));
const enqueue=(queue,post,account=post.accounts[0])=>queue.confirm(post.id,{nonce:queue.prepare(post.id).nonce,confirmed:true,account});

test('unsave requires fresh explicit confirmation and the exact account; only a capable browser claims a single-use action',()=>{
  const{store,sync,queue}=setup();try{
    const p=seed(store),proof=queue.prepare(p.id);
    assert.throws(()=>queue.confirm(p.id,{nonce:proof.nonce,account:'@one'}),/confirmation/);
    assert.throws(()=>queue.confirm(p.id,{nonce:proof.nonce,confirmed:true,account:'@other'}),/Choose an account/);
    sync.heartbeat({ready:true,instance:'old',unsave:false});assert.throws(()=>queue.confirm(p.id,{nonce:proof.nonce,confirmed:true,account:'@one'}),/reload the browser helper/);
    sync.heartbeat({ready:true,instance:'browser',unsave:true});const job=queue.confirm(p.id,{nonce:proof.nonce,confirmed:true,account:'@one'});
    assert.throws(()=>queue.confirm(p.id,{nonce:proof.nonce,confirmed:true,account:'@one'}),/confirmation/);
    assert.equal(queue.claim('old',false),null);assert.equal(queue.claim('browser',true).id,job.id);assert.equal(queue.claim('another',true),null);
    assert.throws(()=>queue.act(job.id,'another'),/not found/);queue.act(job.id,'browser');assert.throws(()=>queue.act(job.id,'browser'),/no longer available/);
    assert.throws(()=>queue.finish(job.id,'browser',{status:'succeeded',observations:evidence({...job,account:'@other'})}),/account-matched/);
    assert.ok(store.post(p.id));assert.equal(store.post(p.id).archived,false);
    const result=queue.finish(job.id,'browser',{status:'succeeded',observations:evidence(job)});
    assert.equal(result.status,'succeeded');assert.equal(result.deleted,1);assert.equal(store.post(p.id),null);
    assert.equal(store.db.prepare('SELECT COUNT(*) n FROM post_topics').get().n,0);
    queue.acknowledge(job.id);assert.equal(queue.status(),null);
  }finally{store.close();}
});
test('verified deletion removes note history and assignments; shared saves remain only for their other owner',()=>{
  const{store,queue}=setup();try{
    const p=seed(store,'x',['@one','@two']),topics=new TopicLibrary(store);topics.notes({postId:p.id,notes:'New private note',expectedUpdatedAt:p.updatedAt});
    const addedAt=store.post(p.id).addedAt;
    let job=enqueue(queue,p,'@one');queue.claim('browser',true);queue.finish(job.id,'browser',{status:'succeeded',observations:evidence(job)});
    const shared=store.post(p.id);assert.deepEqual(shared.accounts,['@two']);assert.equal(shared.archived,false);assert.equal(shared.notes,'New private note');assert.equal(shared.addedAt,addedAt);
    queue.acknowledge(job.id);job=enqueue(queue,shared,'@two');queue.claim('browser',true);queue.act(job.id,'browser');queue.finish(job.id,'browser',{status:'succeeded',observations:evidence(job)});
    assert.equal(store.post(p.id),null);assert.equal(store.db.prepare('SELECT COUNT(*) n FROM mcp_changes WHERE changes LIKE ?').get('%New private note%').n,0);
    assert.equal(store.db.prepare('SELECT COUNT(*) n FROM posts WHERE archived=1').get().n,0);
  }finally{store.close();}
});
test('completion timings survive acknowledgement and cannot replace verified account or post identity',()=>{
 const{store,queue}=setup();try{
  const p=seed(store),job=enqueue(queue,p);queue.claim('browser',true);
  queue.finish(job.id,'browser',{status:'succeeded',observations:evidence(job),diagnostics:{account:'@wrong',externalId:'wrong',accountSwitched:true,timings:{opening:50,account:1200,post:400,checking:500,verifying:700,ignored:100,unsaving:-1}}});
  queue.acknowledge(job.id);assert.equal(queue.status(),null);
  const [result]=queue.diagnostics();assert.equal(result.id,job.id);assert.equal(result.account,job.account);assert.equal(result.externalId,job.external_id);assert.equal(result.accountSwitched,true);
  assert.deepEqual(result.timings,{opening:50,account:1200,post:400,checking:500,verifying:700});
 }finally{store.close();}
});
test('failed, interrupted and expired requests keep the local save and cannot automatically act again',()=>{
  const{store,queue}=setup();try{
    const p=seed(store,'instagram');let job=enqueue(queue,p);queue.claim('browser',true);
    queue.finish(job.id,'browser',{status:'failed',message:'Sign in to the selected account.'});assert.ok(store.post(p.id));queue.acknowledge(job.id);
    job=enqueue(queue,p);store.db.prepare('UPDATE unsave_requests SET created_at=? WHERE id=?').run(Date.now()-91000,job.id);
    assert.equal(queue.status().status,'failed');assert.equal(queue.claim('browser',true),null);assert.ok(store.post(p.id));queue.acknowledge(job.id);
    job=enqueue(queue,p);queue.claim('browser',true);queue.act(job.id,'browser');store.db.prepare('UPDATE unsave_requests SET created_at=? WHERE id=?').run(Date.now()-181000,job.id);
    assert.equal(queue.status().status,'uncertain');assert.equal(queue.claim('browser',true),null);assert.ok(store.post(p.id));assert.throws(()=>queue.act(job.id,'browser'),/ended/);
    queue.acknowledge(job.id);job=enqueue(queue,p);queue.claim('browser',true);queue.act(job.id,'browser');const reopened=unsaveQueue(store,syncQueue(store));assert.equal(reopened.status().status,'uncertain');assert.equal(reopened.claim('browser',true),null);
  }finally{store.close();}
});
test('HTTP endpoints prevent cross-origin confirmation, serialize sync with unsave, and verify before deletion',async()=>{
  const origin='http://localhost:3247',app=createApp({origin});app.server.listen(3247,'127.0.0.1');await once(app.server,'listening');
  const request=async(path,data,extension=false,customOrigin)=>{const r=await fetch(origin+'/api'+path,{method:data===undefined?'GET':'POST',headers:{Origin:customOrigin||(extension?'chrome-extension://abcdefghijklmnopabcdefghijklmnop':origin),'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data)});return{status:r.status,data:await r.json()};};
  try{
    const p=seed(app.store);await request('/extension/jobs',{instance:'browser',ready:true,unsave:true},true);
    const proof=(await request(`/posts/${p.id}/unsave/prepare`,{})).data;
    assert.equal((await request(`/posts/${p.id}/unsave`,{nonce:proof.nonce,confirmed:true,account:'@one'},false,'https://evil.example')).status,403);
    const job=(await request(`/posts/${p.id}/unsave`,{nonce:proof.nonce,confirmed:true,account:'@one'})).data;
    assert.equal((await request('/sync',{targets:['x']})).status,409);
    let heartbeat=(await request('/extension/jobs',{instance:'old',ready:true,claim:true,unsave:false},true)).data;assert.equal(heartbeat.claimedUnsave,null);
    heartbeat=(await request('/extension/jobs',{instance:'browser',ready:true,claim:true,unsave:true},true)).data;assert.equal(heartbeat.claimedUnsave.id,job.id);assert.equal(heartbeat.claimed,null);
    await request(`/extension/unsaves/${job.id}/act`,{instance:'browser'},true);
    assert.equal((await request(`/extension/unsaves/${job.id}/finish`,{instance:'browser',status:'succeeded',observations:[]},true)).status,400);assert.ok(app.store.post(p.id));
    assert.equal((await request(`/extension/unsaves/${job.id}/finish`,{instance:'browser',status:'succeeded',observations:evidence(job)},true)).status,200);assert.equal(app.store.post(p.id),null);
    await request(`/unsave/${job.id}/ack`,{});assert.equal((await request('/sync')).data.unsave,null);
  }finally{await app.mcp.close();await new Promise(resolve=>app.server.close(resolve));app.store.close();}
});

test('a refused unsave or scan names what is running, in the words the library explains',async()=>{
  const app=createApp({origin:'http://localhost:3221'});app.server.listen(3221,'127.0.0.1');await once(app.server,'listening');
  try{
    assert.equal(Object.values(BUSY).filter(notice=>notice.title&&notice.why).length,Object.keys(BUSY).length);
    assert.equal(busyNotice(`Error invoking remote method 'savex-desktop': Error: ${BUSY.update.title}`),BUSY.update);assert.equal(busyNotice('Something else went wrong.'),null);
    const first=seed(app.store),second=seed(app.store,'instagram');
    app.sync.heartbeat({instance:'browser',ready:true,unsave:true});
    const proof=app.unsaves.prepare(first.id);
    const scan=app.sync.enqueue(['chrome']);assert.equal(scan.status,'queued');
    assert.throws(()=>app.unsaves.confirm(first.id,{nonce:proof.nonce,confirmed:true,account:'@one'}),{message:BUSY.unsave.title});
    app.sync.cancel();
    app.unsaves.confirm(first.id,{nonce:proof.nonce,confirmed:true,account:'@one'});
    assert.throws(()=>app.unsaves.confirm(second.id,{nonce:app.unsaves.prepare(second.id).nonce,confirmed:true,account:'@one'}),{message:BUSY.unsaveAgain.title});
    const refused=await fetch('http://127.0.0.1:3221/api/sync',{method:'POST',headers:{Origin:'http://localhost:3221','Content-Type':'application/json'},body:JSON.stringify({targets:['chrome']})});
    assert.equal(refused.status,409);assert.equal((await refused.json()).error,BUSY.scan.title);
  }finally{await app.mcp.close();app.server.closeAllConnections();await new Promise(resolve=>app.server.close(resolve));app.store.close();}
});
