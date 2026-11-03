import test from 'node:test';
import assert from 'node:assert/strict';
import { addedTimeGroup, addedTimeKey, libraryAddedAt } from '../public/saved-time.js';
const iso = (year, month, day, hour = 12, minute = 0) => new Date(year, month - 1, day, hour, minute).toISOString();

test('only local today belongs to Added today; every previous date belongs to Added earlier', () => {
  const now=+new Date(2026,10,3,0,15);
  assert.equal(addedTimeGroup(iso(2026,11,3,0,1),now).label,'Added today');
  for(const value of [iso(2026,11,2,23,59),iso(2026,10,31),iso(2020,1,1),null,'invalid'])assert.equal(addedTimeGroup(value,now).label,'Added earlier');
});
test('first app addition takes precedence over a Chrome bookmark date and explicit unknown dates stay unknown',()=>{
  const post={platform:'chrome',savedAt:iso(2020,1,1),addedAt:iso(2026,11,3)};
  assert.equal(libraryAddedAt(post),post.addedAt);
  assert.equal(libraryAddedAt({...post,addedAt:null}),null);
  assert.equal(libraryAddedAt({savedAt:post.savedAt}),post.savedAt);
});
test('the refresh key and grouping change across local midnight, including New Year',()=>{
  const posts=[{addedAt:iso(2026,12,31,23,55)}],before=+new Date(2026,11,31,23,59),after=+new Date(2027,0,1,0,1);
  assert.notEqual(addedTimeKey(posts,before),addedTimeKey(posts,after));
  assert.equal(addedTimeGroup(posts[0].addedAt,before).key,'added-today');
  assert.equal(addedTimeGroup(posts[0].addedAt,after).key,'added-earlier');
});
test('local calendar boundaries stay correct across daylight saving time',()=>{
  const previous=process.env.TZ;
  try{
    process.env.TZ='America/New_York';const now=+new Date(2026,2,9,0,15);
    assert.equal(addedTimeGroup(iso(2026,3,8,23,59),now).key,'added-earlier');
    assert.equal(addedTimeGroup(iso(2026,3,9,0,1),now).key,'added-today');
  }finally{if(previous===undefined)delete process.env.TZ;else process.env.TZ=previous;}
});
