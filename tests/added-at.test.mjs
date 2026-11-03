import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Store } from '../server/store.mjs';

test('new saves track their app addition independently of original bookmark dates and preserve it on refresh and restore',()=>{
  const store=new Store(':memory:');
  try{
    const start=Date.now();
    store.importPosts([{platform:'chrome',url:'https://example.org/old',savedAt:'2010-01-01',notes:'Keep this note'}]);
    const post=store.posts()[0],addedAt=post.addedAt;
    assert.equal(post.savedAt,'2010-01-01T00:00:00.000Z');
    assert.ok(Date.parse(addedAt)>=start&&Date.parse(addedAt)<=Date.now());
    store.updatePost(post.id,{notes:'Edited',archived:true});store.updatePost(post.id,{archived:false});
    store.importPosts([{platform:'chrome',url:post.url,savedAt:'2020-01-01',addedAt:'2020-01-01'}]);
    assert.equal(store.post(post.id).addedAt,addedAt);
    const restored=new Store(':memory:');
    try{restored.importPosts(store.posts());assert.equal(restored.posts()[0].addedAt,addedAt);}finally{restored.close();}
  }finally{store.close();}
});
test('existing social first-import times migrate once; unknown Chrome import dates are not fabricated',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'savex-added-at-')),path=join(dir,'library.sqlite');let store;
  try{
    store=new Store(path);store.importPosts([{url:'https://x.com/i/status/1000',savedAt:'2026-11-01'},{platform:'chrome',url:'https://example.org/old',savedAt:'2010-01-01'}]);
    store.db.exec('ALTER TABLE posts DROP COLUMN added_at');store.close();
    store=new Store(path);
    assert.equal(store.posts().find(p=>p.platform==='x').addedAt,'2026-11-01T00:00:00.000Z');
    assert.equal(store.posts().find(p=>p.platform==='chrome').addedAt,null);
    const x=store.posts().find(p=>p.platform==='x');store.db.prepare('UPDATE posts SET added_at=? WHERE id=?').run('2026-10-31T00:00:00.000Z',x.id);
    store.close();store=new Store(path);assert.equal(store.post(x.id).addedAt,'2026-10-31T00:00:00.000Z');
  }finally{store?.close();await rm(dir,{recursive:true,force:true});}
});
