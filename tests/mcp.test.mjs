import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { request } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createApp } from '../server/app.mjs';
import { Store } from '../server/store.mjs';
import { TopicLibrary } from '../server/topics.mjs';
import { mcpLibrary } from '../server/mcp.mjs';
import { setInstagramSaveList } from '../server/instagram-save-lists.mjs';
import { visibleInstagramSaves } from '../public/instagram-save-lists.js';

function fixture(store) {
  store.importPosts([
    {url:'https://www.instagram.com/reel/MCPOne/',text:'A coding tutorial with Python',kind:'video',sourceAccount:'@one',savedAt:'2026-10-01T00:00:00Z',collections:[{account:'@one',name:'Ideas',url:'https://www.instagram.com/one/saved/123/'}]},
    {url:'https://x.com/alice/status/123456',text:'A coding reference with literal 100%_ coverage',sourceAccount:'@two',savedAt:'2026-10-02T00:00:00Z'},
    {platform:'chrome',url:'https://example.org/guide',bookmarkTitle:'Design guide',folders:['References/Design'],notes:'Keep this note',savedAt:'2026-10-03T00:00:00Z'},
    {url:'https://www.instagram.com/reel/MCPHidden/',text:'SECRET archived material',notes:'SECRET private note',sourceAccount:'@hidden',archived:true,savedAt:'2026-10-04T00:00:00Z'}
  ]);
  return store.posts({scope:'all'});
}
test('MCP shows only the saves the library shows when Instagram collections are deselected',()=>{
  const store=new Store(':memory:');
  try {
    store.importPosts([
      {url:'https://www.instagram.com/reel/Shown/',text:'visible reel',sourceAccount:'@one',savedAt:'2026-10-01T00:00:00Z',collections:[{account:'@one',name:'Ideas',url:'https://www.instagram.com/one/saved/ideas/1/'}]},
      {url:'https://www.instagram.com/reel/Unseen/',text:'SECRET reel',sourceAccount:'@one',savedAt:'2026-10-02T00:00:00Z',collections:[{account:'@one',name:'Private',url:'https://www.instagram.com/one/saved/private/2/'}]},
      {url:'https://www.instagram.com/reel/Other/',text:'other account reel',sourceAccount:'@two',savedAt:'2026-10-03T00:00:00Z'},
      {url:'https://x.com/alice/status/123456',text:'bookmark',sourceAccount:'@one',savedAt:'2026-10-04T00:00:00Z'}
    ]);
    const posts=store.posts({scope:'all'}),unseen=posts.find(p=>p.url.includes('Unseen')),api=mcpLibrary(store);
    const {topic}=api.topics.create({name:'Reels'});const {changeId}=api.topics.assign({postIds:posts.filter(p=>p.platform==='instagram').map(p=>p.id),topicIds:[topic.id]});
    assert.equal(api.overview().total,4);assert.equal(api.topics.catalog().find(t=>t.id===topic.id).count,3);
    const ideas=store.instagramCollections().find(c=>c.name==='Ideas');setInstagramSaveList(store,{account:'@one',collectionIds:[ideas.id]});
    const overview=api.overview(),visible=visibleInstagramSaves(store.posts(),{'@one':[ideas.id]});
    assert.equal(overview.total,visible.length);assert.equal(overview.total,3);
    assert.equal(overview.platforms.find(p=>p.platform==='instagram').count,2);
    assert.deepEqual(overview.accounts.filter(a=>a.platform==='instagram').map(a=>[a.handle,a.count]),[['@one',1],['@two',1]]);
    assert.deepEqual(overview.instagramCollections.map(c=>c.name),['Ideas']);assert.equal(overview.dates.newestSavedAt,'2026-10-04T00:00:00.000Z');
    assert.equal(api.search({}).total,3);assert.equal(api.search({query:'SECRET'}).total,0);
    assert.equal(api.search({collectionIds:[store.instagramCollections().find(c=>c.name==='Private').id]}).total,0);
    assert.equal(api.topics.catalog().find(t=>t.id===topic.id).count,2);
    assert.throws(()=>api.getSave(unseen.id),/Save unavailable/);
    assert.throws(()=>api.topics.assign({postIds:[unseen.id],topicIds:[]}),/unavailable/);
    assert.throws(()=>api.topics.notes({postId:unseen.id,notes:'no',expectedUpdatedAt:unseen.updatedAt}),/unavailable/);
    assert(!api.topics.history().some(c=>c.id===changeId));assert.throws(()=>api.topics.undo(changeId),/unavailable/);
    setInstagramSaveList(store,{account:'@one',collectionIds:[ideas.id],all:true});
    assert.equal(api.overview().total,4);assert.equal(api.getSave(unseen.id).id,unseen.id);assert(api.topics.history().some(c=>c.id===changeId));
  } finally { store.close(); }
});
test('MCP library queries paginate, combine filters, expose full original references, and exclude archive',()=>{
  const store=new Store(':memory:');
  try {
    const posts=fixture(store),api=mcpLibrary(store), first=api.search({limit:1});
    assert.equal(first.total,3);assert.equal(first.saves[0].platform,'chrome'); assert(first.nextCursor);
    const second=api.search({limit:1,cursor:first.nextCursor});assert.equal(second.saves[0].platform,'x');
    const third=api.search({limit:1,cursor:second.nextCursor});assert.equal(third.saves[0].platform,'instagram');assert.equal(third.nextCursor,null);
    assert.throws(()=>api.search({query:'different',cursor:first.nextCursor}),/Cursor/);
    assert.equal(api.search({query:'100%_'}).total,1);assert.equal(api.search({query:'SECRET'}).total,0);
    assert.equal(api.search({platforms:['instagram'],accounts:[{platform:'instagram',handle:'@ONE'}],kinds:['video'],savedAfter:'2026-10-01T05:30:00+05:30',savedBefore:'2026-10-02T00:00:00Z'}).total,1);
    assert.equal(api.search({collectionIds:[store.instagramCollections()[0].id]}).total,1);
    assert.equal(api.search({folder:'References/Design',hasNotes:true}).total,1);
    assert.equal(api.search({publishedAfter:'2026-01-01T00:00:00Z'}).total,0);
    const chrome=posts.find(p=>p.platform==='chrome');
    store.db.prepare('UPDATE posts SET added_at=? WHERE id=?').run('2026-11-03T00:00:00.000Z',chrome.id);
    const added=api.search({addedAfter:'2026-11-03T00:00:00Z',addedBefore:'2026-11-04T00:00:00Z',platforms:['chrome'],orderBy:'addedAt'});
    assert.equal(added.total,1);assert.equal(added.saves[0].addedAt,'2026-11-03T00:00:00.000Z');assert.equal(added.saves[0].savedAt,'2026-10-03T00:00:00.000Z');
    assert.throws(()=>api.search({addedAfter:'2026-11-04T00:00:00Z',addedBefore:'2026-11-03T00:00:00Z'}),/later/);
    assert.throws(()=>api.search({savedAfter:'2026-10-03T00:00:00Z',savedBefore:'2026-10-02T00:00:00Z'}),/later/);
    assert.throws(()=>api.getSave(posts.find(p=>p.archived).id),/unavailable/);
    const overview=JSON.stringify(api.overview());assert(!overview.includes('hidden'));assert(!overview.includes('SECRET'));
    const full=api.getSave(posts.find(p=>p.platform==='instagram'&&!p.archived).id);assert.equal(full.url,'https://www.instagram.com/reel/MCPOne/');assert.equal(full.collections[0].name,'Ideas');assert.equal(full.contentAvailability.videoAnalysis,'not_provided');
  } finally{store.close();}
});
test('topic batches are atomic, rename and merge preserve IDs, curated choices survive sync, notes use optimistic concurrency, and undo respects newer edits',()=>{
  const store=new Store(':memory:');
  try {
    const posts=fixture(store),active=posts.filter(p=>!p.archived),hidden=posts.find(p=>p.archived),lib=new TopicLibrary(store), t=lib.create({name:'Moving images',description:'Visual references'}).topic;
    assert.throws(()=>lib.create({name:' moving IMAGES '}),/already/);
    const before=store.post(active[0].id);
    assert.throws(()=>lib.assign({postIds:[active[0].id,hidden.id],topicIds:[t.id]}),/unavailable/);assert.deepEqual(store.post(active[0].id),before);
    const change=lib.assign({postIds:active.map(p=>p.id),topicIds:[t.id],mode:'replace'});
    for(const p of active){assert.deepEqual(store.post(p.id).topics,['Moving images']);assert.equal(store.post(p.id).topicsCurated,true);}
    store.importPosts([{url:active.find(p=>p.platform==='x').url,text:'AI coding tutorial new data'}]);
    assert.deepEqual(store.post(active.find(p=>p.platform==='x').id).topics,['Moving images']);
    const renamed=lib.update({topicId:t.id,name:'Reference videos'});assert.equal(renamed.topic.id,t.id);assert(active.every(p=>store.post(p.id).topics.includes('Reference videos')));
    lib.undo(renamed.changeId);assert.equal(lib.requireTopic(t.id).name,'Moving images');
    const other=lib.create({name:'Other references'}).topic;
    lib.assign({postIds:[active[0].id],topicIds:[other.id]});const merge=lib.merge({sourceIds:[other.id],targetId:t.id});assert(!lib.catalog().some(x=>x.id===other.id));
    lib.undo(merge.changeId);assert(lib.catalog().some(x=>x.id===other.id));
    const p=store.post(active[0].id), note=lib.notes({postId:p.id,notes:'New analysis with evidence',expectedUpdatedAt:p.updatedAt});
    assert.throws(()=>lib.notes({postId:p.id,notes:'stale',expectedUpdatedAt:'2000-01-01T00:00:00Z'}),/changed/);
    store.updatePost(p.id,{notes:'A newer manual note'});assert.throws(()=>lib.undo(note.changeId),/changed again/);assert.equal(store.post(p.id).notes,'A newer manual note');
    assert.throws(()=>lib.undo(change.changeId),/changed again/);
    const clear=lib.assign({postIds:[active[1].id],topicIds:[],mode:'replace'});assert.deepEqual(store.post(active[1].id).topics,[]);
    store.updatePost(active[1].id,{archived:true});assert(!lib.history(100).some(c=>c.id===clear.changeId));assert.throws(()=>lib.undo(clear.changeId),/unavailable/);
    assert.equal(store.post(hidden.id).notes,'SECRET private note');
  } finally{store.close();}
});
test('search finds non-ASCII text in any case, in saves and topic names, and ASCII and literal matching are unchanged',()=>{
  const store=new Store(':memory:');
  try {
    store.importPosts([
      {url:'https://x.com/alice/status/1',text:'École Polytechnique'},
      {url:'https://x.com/alice/status/2',text:'Москва and friends'},
      {url:'https://x.com/alice/status/3',text:'Prix É100%_ exact'},
      {url:'https://x.com/alice/status/4',text:'plain ASCII words'}
    ]);
    const api=mcpLibrary(store),{topic}=api.topics.create({name:'Éducation'}),total=query=>api.search({query}).total;
    api.topics.assign({postIds:[store.posts().find(p=>p.url.endsWith('/4')).id],topicIds:[topic.id]});
    for(const query of ['École','école','ÉCOLE','Москва','москва','МОСКВА','É100%_','é100%_','Éducation','ÉDUCATION','éducation','ascii','PLAIN','POLYTECHNIQUE']) assert.equal(total(query),1,query);
    // Wildcards stay literal in a non-ASCII query.
    for(const query of ['É%','é_00','ÉCOLES']) assert.equal(total(query),0,query);
    const first=api.search({query:'é',limit:1}),second=api.search({query:'é',limit:5,cursor:first.nextCursor});
    assert.equal(first.total,3);assert.equal(second.saves.length,2);assert.equal(new Set([...first.saves,...second.saves].map(s=>s.id)).size,3);
  } finally{store.close();}
});
test('a caption cut at the search limit never splits an emoji',()=>{
  const store=new Store(':memory:');
  try {
    const text=`${'x'.repeat(599)}😀 and more`;
    store.importPosts([{url:'https://x.com/alice/status/1',text}]);
    const api=mcpLibrary(store),[row]=api.search({}).saves;
    assert.equal(row.text.isWellFormed(),true);assert.equal(row.text.length,600);assert.equal(row.textTruncated,true);
    assert.equal(api.getSave(row.id).text,text);
  } finally{store.close();}
});
test('topicIds stay in the same order as topics, including after a rename',()=>{
  const store=new Store(':memory:');
  try {
    store.importPosts([{url:'https://x.com/alice/status/1',text:'one'}]);
    const api=mcpLibrary(store),{id}=store.posts()[0];
    // Enough topics that random UUID order cannot match name order by chance.
    const ids=['Zebra','Apple','Mango','banana','Cherry','Yarrow','Fig','Olive'].map(name=>api.topics.create({name}).topic.id);
    api.topics.assign({postIds:[id],topicIds:ids});
    const aligned=save=>assert.deepEqual(save.topicIds.map(t=>api.topics.requireTopic(t).name),save.topics);
    aligned(api.getSave(id));aligned(api.search({}).saves[0]);
    api.topics.update({topicId:ids[1],name:'Zzz'});aligned(api.getSave(id));
  } finally{store.close();}
});
test('an empty add or remove changes nothing, and an empty replace still clears topics',()=>{
  const store=new Store(':memory:');
  try {
    store.importPosts([{url:'https://x.com/alice/status/1',text:'one'}]);
    const lib=new TopicLibrary(store),{id}=store.posts()[0],before=store.post(id);
    for(const args of [{},{mode:'add'},{mode:'remove'}]) assert.deepEqual(lib.assign({postIds:[id],topicIds:[],...args}),{updated:0,changeId:null});
    assert.deepEqual(store.post(id),before);assert.deepEqual(lib.history(),[]);
    const cleared=lib.assign({postIds:[id],topicIds:[],mode:'replace'});assert.equal(cleared.updated,1);assert(cleared.changeId);assert.equal(store.post(id).topicsCurated,true);
  } finally{store.close();}
});
test('undoing a note ignores later topic changes and invalidates the old updatedAt',()=>{
  const store=new Store(':memory:');
  try {
    store.importPosts([{url:'https://x.com/alice/status/1',text:'one',notes:'original'}]);
    const lib=new TopicLibrary(store),{id,updatedAt}=store.posts()[0];
    const {changeId}=lib.notes({postId:id,notes:'edited',expectedUpdatedAt:updatedAt}),{topic}=lib.create({name:'Later'});
    lib.assign({postIds:[id],topicIds:[topic.id]});
    const held=store.post(id).updatedAt;lib.undo(changeId);
    const restored=store.post(id);assert.equal(restored.notes,'original');assert.deepEqual(restored.topics,['Later']);assert.equal(restored.topicsCurated,true);
    assert.throws(()=>lib.notes({postId:id,notes:'stale',expectedUpdatedAt:held}),/changed/);
  } finally{store.close();}
});
async function freePort(){const s=createServer();s.listen(0,'127.0.0.1');await once(s,'listening');const port=s.address().port;await new Promise(r=>s.close(r));return port;}
async function serve(t, options={}) {
  const port=await freePort(),origin=`http://localhost:${port}`,app=createApp({origin,...options});app.server.listen(port,'127.0.0.1');await once(app.server,'listening');
  t.after(async()=>{await app.mcp.close();app.server.closeAllConnections();await new Promise(r=>app.server.close(r));app.store.close();});
  const url=`http://127.0.0.1:${port}`;
  const configure=enabled=>fetch(`${url}/api/mcp`,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({enabled})});
  return {...app,url,origin,configure};
}
test('real MCP HTTP clients discover tools, resources and prompts; enable/disable, host/origin defenses and archive restrictions work',async t=>{
  const app=await serve(t),posts=fixture(app.store), hidden=posts.find(p=>p.archived), active=posts.find(p=>!p.archived);
  assert.equal((await fetch(`${app.url}/mcp`)).status,503);
  assert.equal((await app.configure(true)).status,200);
  assert.equal((await fetch(`${app.url}/mcp`,{headers:{Origin:'https://evil.example'}})).status,403);
  const badHostStatus=await new Promise((resolve,reject)=>{const req=request(`${app.url}/mcp`,{headers:{Host:'attacker.example'}},res=>{res.resume();resolve(res.statusCode);});req.on('error',reject);req.end();});
  assert.equal(badHostStatus,403);
  assert.equal((await fetch(`${app.url}/api/mcp`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{"enabled":false}'})).status,403);
  const client=new Client({name:'savex-test',version:'1.0.0'});
  t.after(()=>client.close());
  await client.connect(new StreamableHTTPClientTransport(new URL(`${app.url}/mcp`)));
  const tools=await client.listTools();assert(tools.tools.some(x=>x.name==='set_save_topics'));assert(tools.tools.some(x=>x.name==='search_saves'));
  const call=async(name,args={})=>{const result=await client.callTool({name,arguments:args});return {result,data:result.structuredContent||JSON.parse(result.content[0].text)};};
  assert.equal((await call('library_overview')).data.total,3);
  assert.equal((await call('search_saves',{query:'SECRET'})).data.total,0);
  for(const name of ['get_saves','set_save_topics','update_save_note']) {
    const args=name==='get_saves'?{postIds:[hidden.id]}:name==='set_save_topics'?{postIds:[hidden.id],topicIds:[],mode:'replace'}:{postId:hidden.id,notes:'no',expectedUpdatedAt:hidden.updatedAt};
    const output=await client.callTool({name,arguments:args});assert.equal(output.isError,true);assert(!JSON.stringify(output).includes('SECRET'));
  }
  const unavailable=await client.callTool({name:'get_save_by_url',arguments:{url:hidden.url}});assert.equal(unavailable.isError,true);
  assert.equal((await call('get_save_by_url',{url:active.url})).data.saves[0].id,active.id);
  const created=(await call('create_topic',{name:'Video references'})).data;assert(created.changeId);
  await call('set_save_topics',{postIds:[active.id],topicIds:[created.topic.id],mode:'add'});assert(app.store.post(active.id).topics.includes('Video references'));
  assert.equal((await client.callTool({name:'search_saves',arguments:{limit:1000}})).isError,true);
  assert((await client.listResources()).resources.some(x=>x.uri==='savextension://guide'));
  assert((await client.readResource({uri:`savextension://saves/${active.id}`})).contents[0].text.includes(active.url));
  await assert.rejects(client.readResource({uri:`savextension://saves/${hidden.id}`}));
  assert((await client.listPrompts()).prompts.some(x=>x.name==='organize_library'));
  assert((await client.getPrompt({name:'organize_library',arguments:{focus:'reels'}})).messages[0].content.text.includes('reels'));
  assert((await fetch(`${app.url}/api/mcp`).then(r=>r.json())).lastActivity);
  await app.configure(false);
  await assert.rejects(client.listTools());
  await app.configure(true);
  const second=new Client({name:'savex-reconnected',version:'1'},{mode:{pin:'2026-07-28'}});await second.connect(new StreamableHTTPClientTransport(new URL(`${app.url}/mcp`)));assert((await second.listTools()).tools.length>=12);await second.close();
});
test('advertised tool schemas leave out generated regexes, while the server still enforces them with a useful message',async t=>{
  const app=await serve(t);
  app.store.importPosts([{url:'https://x.com/alice/status/1',text:'one'}]);
  assert.equal((await app.configure(true)).status,200);
  const client=new Client({name:'savex-test',version:'1.0.0'});
  t.after(()=>client.close());
  await client.connect(new StreamableHTTPClientTransport(new URL(`${app.url}/mcp`)));
  const schemas=JSON.stringify((await client.listTools()).tools.map(tool=>tool.inputSchema));
  assert(!schemas.includes('"pattern"'));assert(schemas.includes('"format":"date-time"'));assert(schemas.includes('"format":"uuid"'));
  const search=addedAfter=>client.callTool({name:'search_saves',arguments:{addedAfter}});
  assert(!(await search('2026-01-01T00:00:00Z')).isError);
  // The schema no longer spells out these rules, so the server's own check has to stop them.
  for(const value of ['2026-01-01','2026-01-01t00:00:00z']) {
    const rejected=await search(value);assert.equal(rejected.isError,true,value);assert.match(rejected.content[0].text,/ISO 8601/);
  }
  assert.equal((await client.callTool({name:'update_topic',arguments:{topicId:'not-a-uuid'}})).isError,true);
});
test('MCP clears image descriptions, only for saves it can see, and can undo it',()=>{
  const store=new Store(':memory:');
  try {
    store.importPosts([
      {url:'https://www.instagram.com/reel/Shown/',text:'visible reel',sourceAccount:'@one',collections:[{account:'@one',name:'Ideas',url:'https://www.instagram.com/one/saved/ideas/1/'}]},
      {url:'https://www.instagram.com/reel/Unseen/',text:'hidden reel',sourceAccount:'@one',collections:[{account:'@one',name:'Private',url:'https://www.instagram.com/one/saved/private/2/'}]},
      {url:'https://x.com/alice/status/123456',text:'bookmark',sourceAccount:'@one'},
      {url:'https://x.com/alice/status/654321',text:'never described',sourceAccount:'@one'}
    ]);
    const posts=store.posts({scope:'all'}),find=part=>posts.find(p=>p.url.includes(part)),shown=find('Shown'),unseen=find('Unseen'),tweet=find('123456'),plain=find('654321');
    for(const post of [shown,unseen,tweet])store.setImageDescription(post.id,`seen ${post.id}`,'Haiku 5.5');
    setInstagramSaveList(store,{account:'@one',collectionIds:[store.instagramCollections().find(c=>c.name==='Ideas').id]});
    const api=mcpLibrary(store),edited=store.post(tweet.id).updatedAt;
    assert.throws(()=>api.topics.clearDescriptions({}),/either/);
    assert.throws(()=>api.topics.clearDescriptions({postIds:[tweet.id],all:true}),/either/);
    assert.throws(()=>api.topics.clearDescriptions({postIds:[unseen.id]}),/unavailable/);
    assert.deepEqual(api.topics.clearDescriptions({postIds:[plain.id]}),{cleared:0,changeId:null});
    const one=api.topics.clearDescriptions({postIds:[tweet.id]});
    assert.equal(one.cleared,1);assert.equal(store.post(tweet.id).imageDescription,'');assert.equal(store.post(shown.id).imageDescription,`seen ${shown.id}`);
    assert.equal(store.post(tweet.id).updatedAt,edited);
    api.topics.undo(one.changeId);
    assert.equal(store.post(tweet.id).imageDescription,`seen ${tweet.id}`);assert.equal(store.post(tweet.id).imageDescriptionModel,'Haiku 5.5');
    const every=api.topics.clearDescriptions({all:true});
    assert.equal(every.cleared,2);assert.equal(store.post(shown.id).imageDescription,'');assert.equal(store.post(unseen.id).imageDescription,`seen ${unseen.id}`);
    // A newer description isn't overwritten by undo, and a later topic edit doesn't block it.
    store.setImageDescription(shown.id,'read again','Haiku 5.5');
    assert.throws(()=>api.topics.undo(every.changeId),/changed again/);
    store.setImageDescription(shown.id,'','');
    const {topic}=api.topics.create({name:'Later'});api.topics.assign({postIds:[tweet.id],topicIds:[topic.id]});
    api.topics.undo(every.changeId);
    assert.equal(store.post(tweet.id).imageDescription,`seen ${tweet.id}`);assert.equal(store.post(shown.id).imageDescription,`seen ${shown.id}`);
    assert.deepEqual(store.post(tweet.id).topics,['Later']);
  } finally { store.close(); }
});
test('the app lists every topic that exists, and MCP leaves out only one whose saves it can\'t see',()=>{
  const store=new Store(':memory:');
  try {
    store.importPosts([{url:'https://x.com/alice/status/1',text:'hidden from MCP',sourceAccount:'@one'}]);
    const [post]=store.posts({scope:'all'}),app=new TopicLibrary(store),limited=new TopicLibrary(store,{hidden:()=>[post.id]});
    const {topic:withHidden}=app.create({name:'Only hidden saves'}),{topic:empty}=app.create({name:'No saves'});
    app.assign({postIds:[post.id],topicIds:[withHidden.id],mode:'add'});
    store.db.prepare('UPDATE topics SET managed=0').run();
    const names=library=>library.catalog().map(item=>item.name).sort();
    assert.deepEqual(names(app),['No saves','Only hidden saves']);
    assert.deepEqual(names(limited),['No saves']);
    assert.equal(limited.catalog().find(item=>item.id===empty.id).count,0);
  } finally { store.close(); }
});
test('get_save_by_url resolves creator-first Instagram links without reaching deselected saves',async t=>{
  const app=await serve(t);
  app.store.importPosts([
    {url:'https://www.instagram.com/reel/Shown/',text:'visible reel',sourceAccount:'@one',collections:[{account:'@one',name:'Ideas',url:'https://www.instagram.com/one/saved/ideas/1/'}]},
    {url:'https://www.instagram.com/reel/Unseen/',text:'SECRET reel',sourceAccount:'@one',collections:[{account:'@one',name:'Private',url:'https://www.instagram.com/one/saved/private/2/'}]}
  ]);
  setInstagramSaveList(app.store,{account:'@one',collectionIds:[app.store.instagramCollections().find(c=>c.name==='Ideas').id]});
  assert.equal((await app.configure(true)).status,200);
  const client=new Client({name:'savex-test',version:'1.0.0'});
  t.after(()=>client.close());
  await client.connect(new StreamableHTTPClientTransport(new URL(`${app.url}/mcp`)));
  const lookup=name=>client.callTool({name:'get_save_by_url',arguments:{url:`https://www.instagram.com/creator/reel/${name}/?igsh=secret`}});
  assert.equal((await lookup('Shown')).structuredContent.saves[0].url,'https://www.instagram.com/reel/Shown/');
  const unseen=await lookup('Unseen');assert.equal(unseen.isError,true);assert(!JSON.stringify(unseen).includes('SECRET'));
});
test('MCP setting persists, defaults off for a new library, and is unavailable in authenticated hosting mode',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'savex-mcp-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const path=join(dir,'library.sqlite'),first=new Store(path);assert.equal(first.get('mcp_enabled'),undefined);first.set('mcp_enabled','true');first.close();const next=new Store(path);assert.equal(next.get('mcp_enabled'),'true');next.close();
  const app=await serve(t,{localMode:false});assert.equal((await fetch(`${app.url}/mcp`)).status,403);
});

test('MCP topic metadata, empty topics and curated assignments survive backups, read-only migration and restart',async t=>{
  const { readDatabaseSnapshot,importSnapshot }=await import('../desktop/runtime.mjs');
  const { topicCatalog }=await import('../server/topics.mjs');
  const dir=await mkdtemp(join(tmpdir(),'savex-mcp-backup-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const path=join(dir,'source.sqlite'),source=new Store(path);fixture(source);
  const lib=new TopicLibrary(source),empty=lib.create({name:'Empty future topic',description:'Keep even when empty'}).topic,group=lib.create({name:'My collection',description:'Cross-source references'}).topic;
  const post=source.posts()[0];lib.assign({postIds:[post.id],topicIds:[group.id],mode:'replace'});lib.update({topicId:group.id,name:'Renamed collection'});
  const saved=lib.assign({postIds:[source.posts()[1].id],topicIds:[],mode:'replace'});
  const backup={posts:source.posts({scope:'all'}),topics:topicCatalog(source.db,{all:true})};
  const snapshot=readDatabaseSnapshot(path);assert.deepEqual(snapshot.posts.find(p=>p.id===post.id).topics,['Renamed collection']);
  for(const data of [backup,snapshot]) {
    const restored=new Store(':memory:');try {
      importSnapshot(restored,data);
      const catalog=new TopicLibrary(restored).catalog();assert(catalog.some(t=>t.name===empty.name&&t.description===empty.description));
      const copy=restored.posts().find(p=>p.url===post.url);assert.deepEqual(copy.topics,['Renamed collection']);assert.equal(copy.topicsCurated,true);
      restored.importPosts([{url:copy.url,platform:copy.platform,text:'AI Python tutorial'}]);assert.deepEqual(restored.post(copy.id).topics,['Renamed collection']);
      assert.equal(restored.get('mcp_enabled'),undefined);
    }finally{restored.close();}
  }
  // Undo changes only its organization fields, leaving later manual notes intact.
  const p=source.posts()[1];source.updatePost(p.id,{notes:'Leave my manual note'});lib.undo(saved.changeId);assert.equal(source.post(p.id).notes,'Leave my manual note');
  const deleted=lib.delete({topicId:empty.id});assert(!lib.catalog().some(t=>t.id===empty.id));lib.undo(deleted.changeId);assert(lib.catalog().some(t=>t.id===empty.id));
  source.close();const restarted=new Store(path);assert.deepEqual(restarted.posts().find(p=>p.url===post.url).topics,['Renamed collection']);restarted.close();
});
