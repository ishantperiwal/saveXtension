import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { Store } from '../server/store.mjs';
import { TopicLibrary } from '../server/topics.mjs';
import { createApp } from '../server/app.mjs';
import { mcpLibrary } from '../server/mcp.mjs';

test('adding a collection preserves other memberships and notes, remains curated across syncs, and can be undone',()=>{
  const store=new Store(':memory:');
  try{
    store.importPosts([{url:'https://x.com/i/status/908001',notes:'My interpretation',topics:['Original'],topicsCurated:true}]);
    const post=store.posts()[0],topics=new TopicLibrary(store),target=topics.create({name:'References'}).topic;
    const added=topics.addToCollection({postId:post.id,topicId:target.id});
    assert.deepEqual(added.post.topics,['Original','References']);assert.equal(added.post.notes,post.notes);assert.equal(added.post.addedAt,post.addedAt);
    topics.addToCollection({postId:post.id,topicId:target.id});assert.equal(store.post(post.id).topics.length,2);
    store.importPosts([{url:post.url,text:'Python AI tools coding research'}]);assert.deepEqual(store.post(post.id).topics,['Original','References']);
    const created=topics.addToCollection({postId:post.id,name:'New collection'});assert(created.changeId);
    assert(store.post(post.id).topics.includes('New collection'));topics.undo(created.changeId);
    assert(!store.post(post.id).topics.includes('New collection'));assert(!topics.catalog().some(t=>t.name==='New collection'));
    const reused=topics.addToCollection({postId:post.id,name:' references '});assert.equal(reused.topic.id,target.id);
    assert.equal(topics.catalog().filter(t=>t.name.toLowerCase()==='references').length,1);
  }finally{store.close();}
});

test('invalid and failed creates do not leave orphan collections or partial membership changes',()=>{
  const store=new Store(':memory:');
  try{
    store.importPosts([{platform:'chrome',url:'https://collections.test/one'}]);const post=store.posts()[0],topics=new TopicLibrary(store);
    for(const selection of [{},{name:'  '},{name:'x'.repeat(81)},{topicId:'missing'},{name:'One',topicId:'missing'}])assert.throws(()=>topics.addToCollection({postId:post.id,...selection}));
    assert.throws(()=>topics.addToCollection({postId:9999,name:'Orphan'}));assert(!topics.catalog().some(t=>t.name==='Orphan'));
    store.db.exec("CREATE TRIGGER fail_membership BEFORE INSERT ON post_topics BEGIN SELECT RAISE(ABORT,'Fixture failure'); END");
    assert.throws(()=>topics.addToCollection({postId:post.id,name:'Atomic collection'}),/Fixture failure/);
    assert(!topics.catalog().some(t=>t.name==='Atomic collection'));assert.deepEqual(store.post(post.id).topics,post.topics);
  }finally{store.close();}
});

test('the UI API adds existing or new collections and archived saves remain excluded from MCP',async()=>{
  const origin='http://localhost:3239',app=createApp({origin});app.server.listen(3239,'127.0.0.1');await once(app.server,'listening');
  async function add(id,input){const response=await fetch(`${origin}/api/posts/${id}/collections`,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(input)});return{status:response.status,data:await response.json()};}
  try{
    app.store.importPosts([{url:'https://x.com/i/status/908002',notes:'Preserve me'}]);const post=app.store.posts()[0];
    const created=await add(post.id,{name:'My collection'});assert.equal(created.status,200);
    assert.equal(created.data.post.notes,'Preserve me');assert(created.data.topics.some(t=>t.name==='My collection'));
    assert.deepEqual(mcpLibrary(app.store).getSave(post.id).topics,['My collection']);
    assert.equal((await add(post.id,{topicId:created.data.topic.id})).status,200);
    app.store.updatePost(post.id,{archived:true});assert.equal((await add(post.id,{name:'Archived references'})).status,200);
    assert.equal(app.store.post(post.id).archived,true);assert.throws(()=>mcpLibrary(app.store).getSave(post.id),/unavailable/);
    assert.equal((await add(99999,{name:'Orphan'})).status,404);
    assert.equal((await add(post.id,{name:''})).status,400);
  }finally{app.server.closeAllConnections();await new Promise(resolve=>app.server.close(resolve));app.store.close();}
});

test('confirmed collection deletion untags active and archived saves, preserves their data, and survives refresh',()=>{
  const store=new Store(':memory:');
  try{
    store.importPosts([
      {url:'https://x.com/i/status/908003',text:'Recipe reference',notes:'Keep this note',topics:['Food','Other'],topicsCurated:false},
      {url:'https://www.instagram.com/p/DeleteCollection/',text:'Recipe reel',archived:true,topics:['Food','Other'],topicsCurated:false,collections:[{externalId:'123',name:'Instagram recipes',account:'@cook',url:'https://www.instagram.com/cook/saved/123/'}]}
    ]);
    const topics=new TopicLibrary(store),food=topics.catalog().find(t=>t.name==='Food');
    const renamed=topics.update({topicId:food.id,name:'Foods and recipes'}).topic;
    const before=store.posts({scope:'all'});
    assert.equal(before.find(p=>p.platform==='instagram').collections.length,1);
    assert.throws(()=>topics.delete({topicId:food.id}),/memberships/);
    topics.delete({topicId:renamed.id},{removeMemberships:true});
    assert(!topics.catalog().some(t=>t.id===food.id));
    assert.equal(store.db.prepare('SELECT count(*) AS n FROM topic_aliases WHERE topic_id=?').get(food.id).n,0);
    for(const original of before){
      const saved=store.post(original.id);
      assert.deepEqual(saved.topics,['Other']);
      for(const key of ['url','text','notes','archived','addedAt','savedAt','accounts'])assert.deepEqual(saved[key],original[key]);
      assert.deepEqual(saved.collections.map(c=>({...c})),original.collections.map(c=>({...c})));
      assert(saved.topicsCurated);
      assert.deepEqual(JSON.parse(store.db.prepare('SELECT topics FROM posts WHERE id=?').get(original.id).topics),['Other']);
      store.importPosts([{url:original.url,text:'Food recipes cooking',topics:['Food','Foods and recipes']}]);
      assert.deepEqual(store.post(original.id).topics,['Other']);
    }
    assert.throws(()=>topics.delete({topicId:food.id},{removeMemberships:true}),/not found/);
  }finally{store.close();}
});

test('collection deletion is atomic and reversible without deleting posts',()=>{
  const store=new Store(':memory:');
  try{
    store.importPosts([{url:'https://x.com/i/status/908004',topics:['Recipes','Other'],topicsCurated:true}]);
    const topics=new TopicLibrary(store),post=store.posts()[0],topic=topics.catalog().find(t=>t.name==='Recipes');
    store.db.exec("CREATE TRIGGER fail_collection_delete BEFORE UPDATE OF topics_curated ON posts BEGIN SELECT RAISE(ABORT,'Fixture failure'); END");
    assert.throws(()=>topics.delete({topicId:topic.id},{removeMemberships:true}),/Fixture failure/);
    assert(topics.catalog().some(t=>t.id===topic.id));assert.deepEqual(store.post(post.id).topics,post.topics);
    store.db.exec('DROP TRIGGER fail_collection_delete');
    const removed=topics.delete({topicId:topic.id},{removeMemberships:true});topics.undo(removed.changeId);
    assert(topics.catalog().some(t=>t.id===topic.id));assert.deepEqual(store.post(post.id).topics,post.topics);
  }finally{store.close();}
});

test('collection UI endpoints rename memberships, reject duplicate names, and delete only the tag',async()=>{
  const app=createApp({origin:'http://localhost:3240'});app.server.listen(3240,'127.0.0.1');await once(app.server,'listening');
  const edit=async(id,method,input)=>{
    const response=await fetch(`http://localhost:3240/api/topics/${id}`,{method,headers:{Origin:'http://localhost:3240',...(input?{'Content-Type':'application/json'}:{})},...(input?{body:JSON.stringify(input)}:{})});
    return {status:response.status,data:await response.json()};
  };
  try{
    app.store.importPosts([{url:'https://x.com/i/status/908005',notes:'Keep',topics:['Food','Other'],topicsCurated:true}]);
    const topics=new TopicLibrary(app.store),food=topics.catalog().find(t=>t.name==='Food'),post=app.store.posts()[0];
    assert.equal((await edit(food.id,'PATCH',{name:'Other'})).status,409);
    assert.equal((await edit(food.id,'PATCH',{name:' '})).status,400);
    const renamed=await edit(food.id,'PATCH',{name:'Foods and recipes'});assert.equal(renamed.status,200);
    assert.deepEqual(renamed.data.posts[0].topics,['Foods and recipes','Other']);assert.equal(renamed.data.topic.id,food.id);
    const deleted=await edit(food.id,'DELETE');assert.equal(deleted.status,200);
    assert.equal(deleted.data.posts.length,1);assert.equal(deleted.data.posts[0].notes,'Keep');assert.deepEqual(deleted.data.posts[0].topics,['Other']);
    assert.equal(app.store.post(post.id).url,post.url);
    assert.equal((await edit(food.id,'DELETE')).status,404);
  }finally{app.server.closeAllConnections();await new Promise(resolve=>app.server.close(resolve));app.store.close();}
});
