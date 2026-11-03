import test from 'node:test';
import assert from 'node:assert/strict';
import{createWorkTab,closeWorkTab,cleanWorkTabs,adoptConnectionTab}from'../extension/work-tabs.js';
function browser(){
 let data={},nextTab=10,nextGroup=1,failGrouping=false;const tabs=new Map([[1,{id:1,windowId:1,active:true,url:'https://example.org',groupId:-1}]]),groups=new Map();
 const copy=value=>structuredClone(value);
 globalThis.chrome={storage:{session:{get:async key=>({[key]:copy(data[key])}),set:async values=>Object.assign(data,copy(values))}},tabs:{
  create:async options=>{const tab={id:nextTab++,windowId:1,groupId:-1,...options};tabs.set(tab.id,tab);return copy(tab);},
  get:async id=>{if(!tabs.has(id))throw Error('No tab');return copy(tabs.get(id));},
  update:async(id,options)=>{Object.assign(tabs.get(id),options);return copy(tabs.get(id));},
  group:async({tabIds,groupId})=>{if(failGrouping)throw Error('Grouping failed');if(groupId===undefined){groupId=nextGroup++;groups.set(groupId,{id:groupId,windowId:tabs.get(tabIds[0]).windowId,title:'',collapsed:false});}for(const id of tabIds)tabs.get(id).groupId=groupId;return groupId;},
  query:async({groupId})=>copy([...tabs.values()].filter(tab=>tab.groupId===groupId)),
  remove:async id=>{const tab=tabs.get(id);tabs.delete(id);if(tab?.groupId>=0&&![...tabs.values()].some(t=>t.groupId===tab.groupId))groups.delete(tab.groupId);}
 },tabGroups:{get:async id=>{if(!groups.has(id))throw Error('No group');return copy(groups.get(id));},update:async(id,options)=>{Object.assign(groups.get(id),options);return copy(groups.get(id));}}};
 return{tabs,groups,get data(){return data;},resetSession:()=>data={},failGrouping:()=>failGrouping=true};
}
test('work tabs share a collapsed named group per window and stay muted and inactive',async()=>{
 const b=browser(),[a,c]=await Promise.all([createWorkTab('sync'),createWorkTab('unsave')]);
 assert.equal(a.groupId,c.groupId);assert.deepEqual([...b.groups.values()].map(g=>({title:g.title,color:g.color,collapsed:g.collapsed})),[{title:'Save Extension Tabs',color:'yellow',collapsed:true}]);
 for(const tab of [a,c]){assert.equal(tab.active,false);assert.equal(tab.muted,true);assert.equal(tab.autoDiscardable,false);}
 await closeWorkTab(a.id);assert.equal(b.groups.size,1);b.tabs.get(c.id).active=true;await closeWorkTab(c.id);assert.equal(b.groups.size,0);assert.deepEqual([...b.tabs.keys()],[1]);
});
test('cleanup preserves user tabs, same-title user groups and ongoing work; session resets cannot delete reused IDs',async()=>{
 const b=browser();b.groups.set(99,{id:99,windowId:1,title:'Save Extension Tabs'});b.tabs.get(1).groupId=99;
 const a=await createWorkTab('accounts'),c=await createWorkTab('sync');assert.notEqual(a.groupId,99);
 await cleanWorkTabs([c.id]);assert.equal(b.tabs.has(a.id),false);assert.equal(b.tabs.has(c.id),true);assert.equal(b.tabs.has(1),true);assert.equal(b.groups.has(99),true);
 await cleanWorkTabs();assert.equal(b.tabs.has(c.id),false);assert.equal(b.groups.has(99),true);
 const orphan=await createWorkTab();b.resetSession();b.tabs.set(orphan.id,{id:orphan.id,windowId:1,groupId:-1,url:'https://user.example/'});assert.equal(await closeWorkTab(orphan.id),false);assert.equal(b.tabs.has(orphan.id),true);
});
test('a user tab manually added to the work group survives cleanup and is never collapsed while active',async()=>{
 const b=browser(),a=await createWorkTab();b.tabs.get(1).groupId=a.groupId;b.groups.get(a.groupId).collapsed=false;
 await createWorkTab();assert.equal(b.groups.get(a.groupId).collapsed,false);await cleanWorkTabs();assert.deepEqual([...b.tabs.keys()],[1]);assert.equal(b.groups.has(a.groupId),true);
});
test('grouping failures remove the just-created tab, and abandoned connection tabs are eventually cleaned',async()=>{
 const b=browser();b.failGrouping();await assert.rejects(createWorkTab(),/Grouping failed/);assert.deepEqual([...b.tabs.keys()],[1]);
 const c=browser();c.tabs.set(2,{id:2,windowId:1,active:false,groupId:-1,url:'http://localhost/desktop-connect.html?desktop=1'});await adoptConnectionTab(2);await cleanWorkTabs([],true);assert.equal(c.tabs.has(2),true);await cleanWorkTabs();assert.equal(c.tabs.has(2),false);assert.equal(c.tabs.has(1),true);
});
