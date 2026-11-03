// Session-scoped ownership prevents restored/reused tab IDs from targeting a
// user's unrelated tabs. A matching group title alone never establishes ownership.
const KEY='savexWorkTabs', TITLE='Save Extension Tabs';
let changes=Promise.resolve();
const serialize=task=>{const pending=changes.then(task,task);changes=pending.catch(()=>{});return pending;};
const state=async()=> (await chrome.storage.session.get(KEY))[KEY] || {tabs:{},groups:{}};
const save=value=>chrome.storage.session.set({[KEY]:value});
export async function ownsWorkTab(tab,kind){
  const record=(await state()).tabs[tab.id];
  return !!record&&record.windowId===tab.windowId&&record.kind===kind;
}
async function group(tab,value){
  let groupId=value.groups[tab.windowId],existing;
  if(Number.isInteger(groupId))existing=await chrome.tabGroups.get(groupId).catch(()=>null);
  if(!existing||existing.windowId!==tab.windowId||existing.title!==TITLE){
    groupId=await chrome.tabs.group({tabIds:[tab.id]});
    await chrome.tabGroups.update(groupId,{title:TITLE,color:'yellow',collapsed:!tab.active});
    value.groups[tab.windowId]=groupId;
  }else{
    await chrome.tabs.group({tabIds:[tab.id],groupId});
    const members=await chrome.tabs.query({groupId});
    if(!members.some(member=>member.active))await chrome.tabGroups.update(groupId,{collapsed:true});
  }
}
async function close(id,value){
  if(!value.tabs[id])return false;
  const tab=await chrome.tabs.get(Number(id)).catch(()=>null);
  // Completion closes our own temporary tabs even if they were inspected.
  if(tab)await chrome.tabs.remove(Number(id));
  if(tab&&value.groups[tab.windowId]===tab.groupId){
    const remaining=await chrome.tabs.query({groupId:tab.groupId}),group=await chrome.tabGroups.get(tab.groupId).catch(()=>null);
    if(group?.title===TITLE&&remaining.length&&!remaining.some(member=>member.active))await chrome.tabGroups.update(tab.groupId,{collapsed:true}).catch(()=>{});
  }
  delete value.tabs[id];await save(value);return true;
}
export function createWorkTab(kind='sync',{active=false}={}){
  return serialize(async()=>{
    const tab=await chrome.tabs.create({url:'about:blank',active});let value;
    try{
      value=await state();value.tabs[tab.id]={windowId:tab.windowId,kind,createdAt:Date.now()};
      await save(value);
      await chrome.tabs.update(tab.id,{muted:true,autoDiscardable:false});
      await group(tab,value);await save(value);return await chrome.tabs.get(tab.id);
    }catch(error){await chrome.tabs.remove(tab.id).catch(()=>{});if(value){delete value.tabs[tab.id];await save(value).catch(()=>{});}throw error;}
  });
}
export async function foregroundUnsaveTab(id){
  const tab=await chrome.tabs.get(id);
  if(!await ownsWorkTab(tab,'unsave'))throw new Error('The unsave tab is no longer owned by saveXtension.');
  if(tab.groupId>=0)await chrome.tabGroups.update(tab.groupId,{collapsed:false});
  await chrome.tabs.update(id,{active:true});
  const window=await chrome.windows.get(tab.windowId);
  await chrome.windows.update(tab.windowId,{...(window.state==='minimized'?{state:'normal'}:{}),focused:true});
}
// Call only after verifying the exact local desktop-connect URL and desktop=1.
export function adoptConnectionTab(id){
  return serialize(async()=>{
    const tab=await chrome.tabs.get(id),value=await state();
    if(value.tabs[id])return;
    value.tabs[id]={windowId:tab.windowId,kind:'connection',createdAt:Date.now()};await save(value);
    try{await group(tab,value);await save(value);}catch{/* Connection setup can still finish if grouping is temporarily unavailable. */}
  });
}
export function closeWorkTab(id){return serialize(async()=>close(id,await state()));}
export function cleanWorkTabs(exclude=[],keepConnections=false){
  return serialize(async()=>{
    const keep=new Set(exclude.map(Number)),value=await state();
    for(const [id,record] of Object.entries(value.tabs))if(!keep.has(Number(id))&&!(keepConnections&&record.kind==='connection'&&Date.now()-record.createdAt<60000))await close(id,value).catch(()=>{});
  });
}
