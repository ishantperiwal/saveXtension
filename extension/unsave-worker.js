import { createWorkTab, closeWorkTab, ownsWorkTab, foregroundUnsaveTab } from './work-tabs.js';
function matchesPost(url,job){
  try{
    const value=new URL(url);
    if(value.protocol!=='https:'||value.username||value.password||value.port)return false;
    const match=job.platform==='x'&&value.hostname==='x.com'
      ?value.pathname.match(/^\/(?:\w+|i\/web)\/status\/(\d+)\/?$/)
      :job.platform==='instagram'&&['instagram.com','www.instagram.com'].includes(value.hostname)
        ?value.pathname.match(/^\/(?:[\w.]+\/)?(?:p|reels?|tv)\/([\w-]+)\/?$/):null;
    return !!match&&match[1]===job.external_id;
  }catch{return false;}
}
// Pinterest's unsave is sent from the board page, and the proof is the board itself: reloaded and read to its end without the pin.
async function performPinterestUnsave(job,{request,instance,loaded,sleep}){
  let tab,acted=false;
  const started=Date.now(),timings={},target={externalId:job.external_id,account:job.account,board:job.board_url};
  const finish=body=>request(`/unsaves/${job.id}/finish`,{instance,...body,diagnostics:{accountSwitched:false,timings,elapsedMs:Date.now()-started}});
  const call=async(operation)=>{const current=await chrome.tabs.get(tab.id);if(!await ownsWorkTab(current,'unsave'))throw new Error('The board tab changed. Check the board before trying again.');const [{result}]=await chrome.scripting.executeScript({target:{tabId:tab.id},func:(target,operation)=>globalThis.SaveXPinterest?.[operation]?.(target),args:[target,operation]});return result;};
  const inject=()=>chrome.scripting.executeScript({target:{tabId:tab.id},files:['extractors.js','unsave-dom.js']});
  const open=async()=>{await loaded(tab.id);await inject();};
  try{
    tab=await createWorkTab('unsave',{active:false});
    await chrome.storage.local.set({unsaveWork:{id:job.id,tabId:tab.id,phase:'opening'}});
    await chrome.tabs.update(tab.id,{muted:true,autoDiscardable:false,url:`${job.board_url}#savex-unsave`});await open();
    let found=false,pinsBefore=0;
    for(let i=0;i<40&&!found;i++){const state=await call('find');if(state?.page===false&&i>10)throw new Error('The board didn’t open with this account. Nothing was clicked.');found=state?.present===true;pinsBefore=state?.pins||0;if(!found)await sleep(500);}
    if(!found)throw new Error('Couldn’t find this pin on its board. Nothing was clicked.');
    await request(`/unsaves/${job.id}/act`,{instance});
    const sent=await call('remove');
    if(!sent?.sent)throw new Error(sent?.status?`Pinterest refused the unsave (${sent.status}). Nothing changed.`:sent?.message||'Couldn’t send the unsave. Nothing changed.');
    acted=true;await sleep(1000);
    // Only a fresh read of the board counts as proof that the pin is gone.
    await chrome.tabs.reload(tab.id);await open();await sleep(3000);
    // A board that hasn't drawn its pins yet also lacks this one, so a board that had others has to show them first.
    const gone=[],othersExpected=pinsBefore>1;
    for(let i=0;i<50&&gone.length<6;i++){
      const state=await call('find');
      if(state?.present)throw new Error('This pin is still on the board. Check Pinterest before trying again.');
      if(state?.page&&state.atEnd&&!state.loading&&(!othersExpected||state.pins>0))gone.push(state.checkedAt);else gone.length=0;
      await sleep(500);
    }
    if(gone.length<6)throw new Error('Couldn’t read the board to confirm the unsave. Check Pinterest before trying again.');
    await finish({status:'succeeded',observations:gone.slice(-2).map(checkedAt=>({state:'unsaved',account:job.account,externalId:job.external_id,checkedAt}))});
  }catch(error){await finish({status:acted?'uncertain':'failed',message:error.message}).catch(()=>{});}
  finally{if(tab)await closeWorkTab(tab.id).catch(()=>{});await chrome.storage.local.remove('unsaveWork');}
}
// One explicitly confirmed operation. A failed verification never toggles Save again.
export async function performUnsave(job,{request,instance,switchXAccount,instagramUrl,loaded,sleep}){
  if(job.platform==='pinterest')return performPinterestUnsave(job,{request,instance,loaded,sleep});
  let tab,previousTab,acted=false;
  const started=Date.now(),timings={},diagnostics={accountSwitched:false,timings};
  const target={url:job.url,platform:job.platform,account:job.account};
  // /reel/ opens an endless viewer with several bookmark controls and no
  // dated permalink. /p/ exposes the same shortcode as one identifiable post.
  const postUrl=job.platform==='instagram'?`https://www.instagram.com/p/${encodeURIComponent(job.external_id)}/`:job.url.split('#')[0];
  const persist=phase=>chrome.storage.local.set({unsaveWork:{id:job.id,tabId:tab?.id,phase}});
  async function step(phase,task){
    await persist(phase);const start=Date.now();
    try{return await task();}finally{timings[phase]=Date.now()-start;}
  }
  const finish=body=>request(`/unsaves/${job.id}/finish`,{instance,...body,diagnostics:{...diagnostics,elapsedMs:Date.now()-started}});
  async function read(operation='inspect'){
    const current=await chrome.tabs.get(tab.id);
    // Platforms can remove fragments or redirect /i/status/ to an author's
    // permalink. Ownership and the exact post ID survive that normalization.
    if(!await ownsWorkTab(current,'unsave')||!matchesPost(current.url,job)||current.pendingUrl&&!matchesPost(current.pendingUrl,job))throw new Error('The post tab changed. Check the original post before trying again.');
    const [{result}]=await chrome.scripting.executeScript({target:{tabId:tab.id},func:(target,operation)=>globalThis.SaveXUnsave?.[operation]?.(target),args:[target,operation]});return result;
  }
  async function observed(expected){let prior=null,confirmed=false;for(let i=0;i<24;i++){
    if(expected==='unsaved'&&!confirmed&&await read('hasConfirmation')){await persist('confirming');const result=await read('confirm');if(!result?.clicked)throw new Error('Couldn’t confirm Instagram’s unsave dialog.');confirmed=true;prior=null;}
    const value=await read();if(value&&(!expected||value.state===expected)&&value.account.toLowerCase()===job.account.toLowerCase()&&value.externalId===job.external_id){if(prior&&prior.state===value.state&&value.checkedAt-prior.checkedAt>=300)return[prior,value];prior=value;}else prior=null;
    await sleep(500);
  }return null;}
  try{
    [previousTab]=await chrome.tabs.query({active:true,lastFocusedWindow:true});
    // A check of an unsave the person already made stays in the background.
    tab=await createWorkTab('unsave',{active:!job.verify_only});if(!job.verify_only)await foregroundUnsaveTab(tab.id);
    await step('opening',async()=>{
      await chrome.tabs.update(tab.id,{muted:true,autoDiscardable:false,url:job.platform==='x'?'https://x.com/i/bookmarks#savex-unsave':'https://www.instagram.com/#savex-unsave'});
      await loaded(tab.id);
    });
    await step('account',async()=>{
      if(job.platform==='x')diagnostics.accountSwitched=(await switchXAccount(tab.id,job.account,{verifyBookmarks:false}))?.switched===true;
      else {const url=await instagramUrl(tab.id),owner=new URL(url).pathname.split('/')[1];if(`@${owner}`.toLowerCase()!==job.account.toLowerCase())throw new Error(`Sign in to ${job.account} on Instagram before unsaving.`);}
    });
    await step('post',async()=>{
      await chrome.tabs.update(tab.id,{url:`${postUrl}#savex-unsave`});await loaded(tab.id);
      await chrome.scripting.executeScript({target:{tabId:tab.id},files:['extractors.js','unsave-dom.js']});
    });
    const before=await step('checking',()=>observed());if(!before)throw new Error(job.platform==='instagram'?'Couldn’t identify the saved post and account. Nothing was clicked. Instagram unsave reads its English button labels, so set Instagram’s language to English if it isn’t.':'Couldn’t identify the saved post and account. Nothing was clicked.');
    let after=before;
    // Saved again, or the unsave didn't take. The site is right, so nothing changes, and this path can never click.
    if(job.verify_only&&before[1].state!=='unsaved')throw new Error('This post is still saved.');
    if(before[1].state==='saved'){
      await request(`/unsaves/${job.id}/act`,{instance});await persist('clicked');
      const action=await read('act');if(!action?.clicked)throw new Error('The post or account changed. Couldn’t perform the unsave.');
      acted=true;await sleep(600);
      after=await step('unsaving',()=>observed('unsaved'));
    }
    if(!after||after[1].state!=='unsaved')throw new Error('Couldn’t verify the unsave. Check the original post before trying again.');
    // A visual toggle can be optimistic. Reload before accepting success so a
    // rejected save operation cannot cause deletion of the local reference.
    after=await step('verifying',async()=>{
      await chrome.tabs.reload(tab.id);await loaded(tab.id);
      await chrome.scripting.executeScript({target:{tabId:tab.id},files:['extractors.js','unsave-dom.js']});
      return observed('unsaved');
    });
    if(!after)throw new Error('The platform did not confirm the unsave after reloading. Check the original post.');
    await finish({status:'succeeded',observations:after});
  }catch(error){if(globalThis.SaveXDesktopWorker)await globalThis.SaveXDesktopWorker.accountError(error.message);await finish({status:acted?'uncertain':'failed',message:error.message}).catch(()=>{});}
  finally{
    if(tab){
      const wasActive=(await chrome.tabs.get(tab.id).catch(()=>null))?.active;
      await closeWorkTab(tab.id).catch(()=>{});
      if(wasActive&&previousTab)await chrome.tabs.get(previousTab.id).then(previous=>previous.windowId===previousTab.windowId&&chrome.tabs.update(previous.id,{active:true})).catch(()=>{});
    }
    await chrome.storage.local.remove('unsaveWork');
  }
}
