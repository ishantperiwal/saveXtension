import { createWorkTab, closeWorkTab } from './work-tabs.js';
// One explicitly confirmed operation. A failed verification never toggles Save again.
export async function performUnsave(job,{request,instance,switchXAccount,instagramUrl,loaded,sleep}){
  let tab,acted=false;
  const target={url:job.url,platform:job.platform,account:job.account};
  // /reel/ opens an endless viewer with several bookmark controls and no
  // dated permalink. /p/ exposes the same shortcode as one identifiable post.
  const postUrl=job.platform==='instagram'?`https://www.instagram.com/p/${encodeURIComponent(job.external_id)}/`:job.url.split('#')[0];
  const persist=phase=>chrome.storage.local.set({unsaveWork:{id:job.id,tabId:tab?.id,phase}});
  async function read(operation='inspect'){
    const current=await chrome.tabs.get(tab.id);
    if(!current.url?.includes('#savex-unsave'))throw new Error('The post tab changed. Check the original post before trying again.');
    const [{result}]=await chrome.scripting.executeScript({target:{tabId:tab.id},func:(target,operation)=>globalThis.SaveXUnsave?.[operation]?.(target),args:[target,operation]});return result;
  }
  async function observed(expected){let prior=null,confirmed=false;for(let i=0;i<24;i++){
    if(expected==='unsaved'&&!confirmed&&await read('hasConfirmation')){await persist('confirming');const result=await read('confirm');if(!result?.clicked)throw new Error('Couldn’t confirm Instagram’s unsave dialog.');confirmed=true;prior=null;}
    const value=await read();if(value&&(!expected||value.state===expected)&&value.account.toLowerCase()===job.account.toLowerCase()&&value.externalId===job.external_id){if(prior&&prior.state===value.state&&value.checkedAt-prior.checkedAt>=300)return[prior,value];prior=value;}else prior=null;
    await sleep(500);
  }return null;}
  try{
    tab=await createWorkTab('unsave');await persist('checking');
    await chrome.tabs.update(tab.id,{muted:true,autoDiscardable:false,url:job.platform==='x'?'https://x.com/i/bookmarks#savex-unsave':'https://www.instagram.com/#savex-unsave'});
    await loaded(tab.id);
    if(job.platform==='x')await switchXAccount(tab.id,job.account);
    else {const url=await instagramUrl(tab.id),owner=new URL(url).pathname.split('/')[1];if(`@${owner}`.toLowerCase()!==job.account.toLowerCase())throw new Error(`Sign in to ${job.account} on Instagram before unsaving.`);}
    await chrome.tabs.update(tab.id,{url:`${postUrl}#savex-unsave`});await loaded(tab.id);
    await chrome.scripting.executeScript({target:{tabId:tab.id},files:['extractors.js','unsave-dom.js']});
    const before=await observed();if(!before)throw new Error('Couldn’t identify the saved post and account. Nothing was clicked.');
    let after=before;
    if(before[1].state==='saved'){
      await request(`/unsaves/${job.id}/act`,{instance});await persist('clicked');
      const action=await read('act');if(!action?.clicked)throw new Error('The post or account changed. Couldn’t perform the unsave.');
      acted=true;await sleep(600);
      after=await observed('unsaved');
    }
    if(!after||after[1].state!=='unsaved')throw new Error('Couldn’t verify the unsave. Check the original post before trying again.');
    // A visual toggle can be optimistic. Reload before accepting success so a
    // rejected save operation cannot cause deletion of the local reference.
    await chrome.tabs.reload(tab.id);await loaded(tab.id);
    await chrome.scripting.executeScript({target:{tabId:tab.id},files:['extractors.js','unsave-dom.js']});
    after=await observed('unsaved');
    if(!after)throw new Error('The platform did not confirm the unsave after reloading. Check the original post.');
    await request(`/unsaves/${job.id}/finish`,{instance,status:'succeeded',observations:after});
  }catch(error){await request(`/unsaves/${job.id}/finish`,{instance,status:acted?'uncertain':'failed',message:error.message}).catch(()=>{});}
  finally{
    if(tab)await closeWorkTab(tab.id).catch(()=>{});
    await chrome.storage.local.remove('unsaveWork');
  }
}
