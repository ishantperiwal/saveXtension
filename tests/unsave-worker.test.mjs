import test from 'node:test';
import assert from 'node:assert/strict';
import { performUnsave } from '../extension/unsave-worker.js';

const job={id:'fixture',platform:'x',external_id:'12345',url:'https://x.com/i/status/12345',account:'@one'};
function fixture(options={}){
  const local={},session={},tabs=new Map([[1,{id:1,windowId:1,url:'https://example.org',active:true}]]),calls=[];
  let saved=options.saved!==false,clicks=0,clock=Date.now(),accountOptions,reloads=0;const windowUpdates=[];
  globalThis.chrome={
    storage:{local:{set:async value=>Object.assign(local,value),remove:async key=>delete local[key]},session:{get:async key=>({[key]:structuredClone(session[key])}),set:async value=>Object.assign(session,structuredClone(value))}},
    tabs:{
      create:async value=>{const tab={id:10,windowId:1,groupId:-1,...value};tabs.set(10,tab);return {...tab};},
      get:async id=>({...tabs.get(id)}),
      update:async(id,value)=>{const tab=tabs.get(id);Object.assign(tab,value);if(value.url?.includes('/status/')||value.url?.includes('/p/')){tab.url=options.postUrl||value.url.split('#')[0];if(options.pendingUrl)tab.pendingUrl=options.pendingUrl;}return {...tab};},
      group:async()=>7,query:async()=>[{...tabs.get(1)}],remove:async id=>tabs.delete(id),reload:async()=>{reloads++;if(options.rejectReload)saved=true;}
    },
    windows:{get:async()=>({id:1,state:options.minimized?'minimized':'normal'}),update:async(id,value)=>windowUpdates.push({id,...value})},
    tabGroups:{get:async()=>({id:7,windowId:1,title:'Save Extension Tabs'}),update:async()=>{}},
    scripting:{executeScript:async input=>{
      if(input.files){if(options.loseOwnership)session.savexWorkTabs={tabs:{},groups:{}};return[];}
      const operation=input.args[1];
      if(operation==='act'){clicks++;saved=false;if(options.navigateOnAct)tabs.get(10).url='https://x.com/writer/status/99999';return[{result:{clicked:true}}];}
      if(operation==='hasConfirmation')return[{result:false}];
      return[{result:{state:saved?'saved':'unsaved',externalId:options.externalId||input.args[0].url.match(/(?:status|p|reels?|tv)\/([^/]+)/)[1],account:options.account||'@one',checkedAt:clock+=500}}];
    }}
  };
  return{tabs,local,calls,windowUpdates,get clicks(){return clicks;},get reloads(){return reloads;},get accountOptions(){return accountOptions;},async run(target=job){await performUnsave(target,{instance:'test-browser',request:async(path,body)=>calls.push({path,body}),switchXAccount:async(_tab,_account,input)=>{accountOptions=input;return{switched:!!options.switchAccount};},instagramUrl:async()=> 'https://www.instagram.com/one/saved/all-posts/',loaded:async()=>{},sleep:async()=>{}});return calls.find(call=>call.path.endsWith('/finish')).body;}};
}

test('unsave accepts the same exact post after X removes its marker or normalizes the author permalink',async()=>{
  for(const postUrl of ['https://x.com/i/status/12345','https://x.com/minchoi/status/12345','https://x.com/i/web/status/12345?ref=bookmarks']){
    const f=fixture({postUrl}),result=await f.run();assert.equal(result.status,'succeeded');assert.equal(f.clicks,1);
    assert.deepEqual(f.accountOptions,{verifyBookmarks:false});
    assert.equal(f.calls.filter(call=>call.path.endsWith('/act')).length,1);assert.deepEqual([...f.tabs.keys()],[1]);assert.equal(f.local.unsaveWork,undefined);
  }
});
test('a marker cannot authorize a different post, origin, login page or pending navigation',async()=>{
  for(const options of [
    {postUrl:'https://x.com/minchoi/status/99999#savex-unsave'},
    {postUrl:'https://x.com.evil.example/minchoi/status/12345#savex-unsave'},
    {postUrl:'https://attacker@x.com/minchoi/status/12345#savex-unsave'},
    {postUrl:'http://x.com/minchoi/status/12345#savex-unsave'},
    {postUrl:'https://x.com/i/flow/login#savex-unsave'},
    {pendingUrl:'https://x.com/other/status/99999'},
    {loseOwnership:true}
  ]){
    const f=fixture(options),result=await f.run();assert.equal(result.status,'failed');assert.match(result.message,/post tab changed/);assert.equal(f.clicks,0);assert(!f.calls.some(call=>call.path.endsWith('/act')));
  }
});
test('account or DOM post mismatch still prevents a click; post navigation and rejected writes never get a second toggle',async()=>{
  for(const options of [{account:'@other'},{externalId:'99999'}]){
    const f=fixture(options),result=await f.run();assert.equal(result.status,'failed');assert.equal(f.clicks,0);
  }
  for(const options of [{navigateOnAct:true},{rejectReload:true}]){
    const f=fixture(options),result=await f.run();assert.equal(result.status,'uncertain');assert.equal(f.clicks,1);assert.deepEqual([...f.tabs.keys()],[1]);
  }
});
test('Instagram can normalize to its exact /p/ permalink without keeping the temporary marker',async()=>{
  const f=fixture({postUrl:'https://www.instagram.com/p/ExactPost/'});
  const result=await f.run({...job,platform:'instagram',external_id:'ExactPost',url:'https://www.instagram.com/reel/ExactPost/'});
  assert.equal(result.status,'succeeded');assert.equal(f.clicks,1);
});
test('unsave foregrounds its own tab, restores a minimized browser, and records account-switch and stage timings',async()=>{
  const f=fixture({minimized:true,switchAccount:true}),result=await f.run();
  assert.equal(result.status,'succeeded');assert.deepEqual(f.windowUpdates,[{id:1,state:'normal',focused:true}]);
  assert.equal(result.diagnostics.accountSwitched,true);
  assert.deepEqual(Object.keys(result.diagnostics.timings),['opening','account','post','checking','unsaving','verifying']);
  assert(Object.values(result.diagnostics.timings).every(value=>value>=0));
  assert.equal(f.tabs.get(1).active,true);assert.deepEqual([...f.tabs.keys()],[1]);
});

test('already-unsaved X and Instagram posts finish local cleanup without ever clicking Save or requesting an upstream action',async()=>{
  for(const target of [job,{...job,platform:'instagram',external_id:'ExactPost',url:'https://www.instagram.com/reel/ExactPost/'}]){
    const f=fixture({saved:false}),result=await f.run(target);
    assert.equal(result.status,'succeeded');assert.equal(f.clicks,0);assert.equal(f.reloads,1);
    assert(!f.calls.some(call=>call.path.endsWith('/act')));
    assert.equal(result.observations.length,2);assert(result.observations.every(value=>value.state==='unsaved'&&value.externalId===target.external_id&&value.account===target.account));
  }
  const changed=fixture({saved:false,rejectReload:true}),result=await changed.run();
  assert.equal(result.status,'failed');assert.equal(changed.clicks,0);assert.match(result.message,/did not confirm/);
});
