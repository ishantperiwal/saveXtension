import test from 'node:test';
import assert from 'node:assert/strict';
import { addedTimeGroup, addedTimeKey, libraryAddedAt } from '../public/saved-time.js';
const iso = (year, month, day, hour = 12, minute = 0) => new Date(year, month - 1, day, hour, minute).toISOString();

test('today is the local date or the last 6 hours; everything older belongs to Added earlier', () => {
  const now=+new Date(2026,10,3,0,15);
  for(const value of [iso(2026,11,3,0,1),iso(2026,11,2,23,59),iso(2026,11,2,18,30)])assert.equal(addedTimeGroup(value,now).label,'Added today');
  for(const value of [iso(2026,11,2,18,0),iso(2026,10,31),iso(2020,1,1),null,'invalid'])assert.equal(addedTimeGroup(value,now).label,'Added earlier');
  // Later in the day, the date alone decides: anything since midnight is today, however long ago.
  const evening=+new Date(2026,10,3,23,50);
  assert.equal(addedTimeGroup(iso(2026,11,3,0,1),evening).label,'Added today');
  assert.equal(addedTimeGroup(iso(2026,11,2,23,59),evening).label,'Added earlier');
});
test('first app addition takes precedence over a Chrome bookmark date and explicit unknown dates stay unknown',()=>{
  const post={platform:'chrome',savedAt:iso(2020,1,1),addedAt:iso(2026,11,3)};
  assert.equal(libraryAddedAt(post),post.addedAt);
  assert.equal(libraryAddedAt({...post,addedAt:null}),null);
  assert.equal(libraryAddedAt({savedAt:post.savedAt}),post.savedAt);
});
test('the refresh key and grouping change across local midnight and 6 hours later, including New Year',()=>{
  const posts=[{addedAt:iso(2026,12,31,23,55)}],before=+new Date(2026,11,31,23,59),justAfter=+new Date(2027,0,1,0,1),later=+new Date(2027,0,1,6,0);
  assert.notEqual(addedTimeKey(posts,before),addedTimeKey(posts,justAfter));
  assert.equal(addedTimeGroup(posts[0].addedAt,before).key,'added-today');
  assert.equal(addedTimeGroup(posts[0].addedAt,justAfter).key,'added-today');
  assert.equal(addedTimeGroup(posts[0].addedAt,later).key,'added-earlier');
  assert.notEqual(addedTimeKey(posts,justAfter),addedTimeKey(posts,later));
});
test('local calendar boundaries stay correct across daylight saving time',()=>{
  const previous=process.env.TZ;
  try{
    // Clocks go forward at 2 am on 8 March, so 1 am to noon that day is 10 real hours, not 11.
    process.env.TZ='America/New_York';const now=+new Date(2026,2,8,12,0);
    assert.equal(addedTimeGroup(iso(2026,3,8,0,30),now).key,'added-today');
    assert.equal(addedTimeGroup(iso(2026,3,7,23,0),now).key,'added-earlier');
    assert.equal(addedTimeGroup(iso(2026,3,8,7,30),+new Date(2026,2,8,12,0)).key,'added-today');
  }finally{if(previous===undefined)delete process.env.TZ;else process.env.TZ=previous;}
});
