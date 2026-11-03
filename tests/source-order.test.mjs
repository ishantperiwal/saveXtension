import test from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../server/store.mjs';
import {orderLibraryPosts} from '../public/source-order.js';
import {applyFilters,defaultFilters} from '../public/filters.js';
const now=new Date('2026-11-03T12:00:00Z');
const input=(id,account='@one')=>({url:`https://x.com/i/status/${id}`,sourceAccount:account});
const ordered=(store,account='@one')=>applyFilters(store.posts(),{...defaultFilters(),accounts:[`x:${account}`]},{now}).map(p=>p.externalId);
test('source traversal order survives multiple batches, duplicate deliveries and metadata refreshes without changing addition dates',()=>{
  const store=new Store(':memory:');
  try{
    const runId=store.startRun('local','x','@one'),run=store.run(runId,'local');
    const first=[input(30),input(20)],second=[input(20),input(10)];
    store.importPosts(first);store.recordDiscoveries(run,first);store.importPosts(second);store.recordDiscoveries(run,second);
    const before=store.posts().map(p=>[p.id,p.addedAt]);
    assert.deepEqual(ordered(store),['30','20','10']);
    store.importPosts([input(20)]); // Detail enrichment must not move the save.
    assert.deepEqual(ordered(store),['30','20','10']);
    assert.deepEqual(store.posts().map(p=>[p.id,p.addedAt]),before);
    const nextId=store.startRun('local','x','@one'),next=store.run(nextId,'local');
    store.importPosts([input(40)]);store.recordDiscoveries(next,[input(40)]);
    assert.deepEqual(ordered(store),['40','30','20','10']);
    store.recordDiscoveries(next,[input(20),input(30),input(10)]); // A source reorder, not tweet publication order.
    assert.deepEqual(ordered(store),['40','20','30','10']);
    assert.equal(store.post(store.posts().find(p=>p.externalId==='30').id).sourceOrder[0].position,2);
  }finally{store.close();}
});
test('a shared post follows each selected account independently; date grouping and filtering still use app addition dates',()=>{
  const store=new Store(':memory:');
  try{
    for(const [owner,ids] of [['@one',[30,20,10]],['@two',[10,30,20]]]){
      const id=store.startRun('local','x',owner),run=store.run(id,'local');
      const inputs=ids.map(id=>input(id,owner));store.importPosts(inputs);store.recordDiscoveries(run,inputs);
    }
    assert.deepEqual(ordered(store),['30','20','10']);assert.deepEqual(ordered(store,'@two'),['10','30','20']);
    store.db.prepare('UPDATE posts SET added_at=?').run('2026-11-03T10:00:00Z');
    const p=store.posts().find(p=>p.externalId==='20');store.db.prepare('UPDATE posts SET added_at=? WHERE id=?').run('2026-10-01T12:00:00Z',p.id);
    const posts=store.posts();
    assert.deepEqual(applyFilters(posts,{...defaultFilters(),accounts:['x:@one'],date:'today'},{now}).map(p=>p.externalId),['30','10']);
    const mixed=[...posts,{id:500,platform:'chrome',addedAt:posts.find(p=>p.externalId==='10').addedAt,accounts:[]}];
    const sorted=orderLibraryPosts(mixed,{},+now);
    assert.equal(sorted.findIndex(p=>p.id===500),[...mixed].sort((a,b)=>Date.parse(b.addedAt)-Date.parse(a.addedAt)||b.id-a.id).findIndex(p=>p.id===500));
  }finally{store.close();}
});
test('legacy insertion order is recovered only for posts first imported during their recorded run',()=>{
  const store=new Store(':memory:');
  try{
    const id=store.startRun('local','x','@one'),run=store.run(id,'local'),inputs=[input(30),input(20),input(10)];
    store.importPosts(inputs);store.recordDiscoveries(run,inputs);
    store.db.prepare('UPDATE sync_discoveries SET seen_position=NULL').run();
    assert.deepEqual(ordered(store),['30','20','10']);
    assert.deepEqual(store.scanKnownPostIds('x','@one'),[]);
    store.recordDiscoveries(run,inputs);
    assert.deepEqual(store.scanKnownPostIds('x','@one').sort(),['10','20','30']);
    store.db.prepare('UPDATE sync_discoveries SET seen_position=NULL').run();
    const old=store.posts().find(p=>p.externalId==='10');store.db.prepare('UPDATE posts SET added_at=? WHERE id=?').run('2000-01-01T00:00:00Z',old.id);
    assert.deepEqual(store.post(old.id).sourceOrder,[]);
  }finally{store.close();}
});

test('wildcard source filters preserve source sequence instead of reverting to reversed import IDs',()=>{
 const posts=[1,2,3].map((id,position)=>({id,platform:'x',accounts:['@one'],addedAt:'2026-11-03T10:00:00Z',sourceOrder:[{account:'@one',observedAt:'2026-11-03T11:00:00Z',runOrder:1,position}]}));
 assert.deepEqual(orderLibraryPosts(posts,{accounts:['x:*']},+now).map(p=>p.id),[1,2,3]);
});

test('a selected X account follows its exact source sequence across app addition dates',()=>{
 const posts=[
  {id:1,platform:'x',accounts:['@one'],addedAt:'2026-10-31T10:00:00Z',sourceOrder:[{account:'@one',observedAt:'2026-11-03T11:00:00Z',position:0}]},
  {id:2,platform:'x',accounts:['@one'],addedAt:'2026-11-03T10:00:00Z',sourceOrder:[{account:'@one',observedAt:'2026-11-03T11:00:00Z',position:1}]},
  {id:3,platform:'x',accounts:['@one'],addedAt:'2026-10-31T10:00:00Z',sourceOrder:[{account:'@one',observedAt:'2026-11-03T11:00:00Z',position:2}]}
 ];
 assert.deepEqual(orderLibraryPosts(posts,{accounts:['x:@one']},+now).map(p=>p.id),[1,2,3]);
 assert.deepEqual(orderLibraryPosts(posts,{},+now).map(p=>p.id),[2,1,3]);
 assert.deepEqual(applyFilters(posts,{...defaultFilters(),accounts:['x:@one'],date:'today'},{now}).map(p=>p.id),[2]);
});
