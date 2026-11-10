// Operate only on one exact post, in a positively identified signed-in account.
(() => {
  if(globalThis.SaveXUnsave)return;
  const visible=el=>!!el?.isConnected&&!el.closest('[hidden],[aria-hidden="true"]')&&getComputedStyle(el).display!=='none'&&getComputedStyle(el).visibility!=='hidden'&&[...el.getClientRects()].some(r=>r.width&&r.height);
  const postId=(url,platform)=>{try{const u=new URL(url,location.origin);if(u.protocol!=='https:'||u.username||u.password||u.port)return null;return platform==='x'&&u.hostname==='x.com'?u.pathname.match(/\/status\/(\d+)(?:\/|$)/)?.[1]:platform==='instagram'&&['instagram.com','www.instagram.com'].includes(u.hostname)?u.pathname.match(/\/(?:[\w.]+\/)?(?:p|reel|reels|tv)\/([\w-]+)(?:\/|$)/)?.[1]:null;}catch{return null;}};
  const instagramPermalink=link=>{try{const url=new URL(link.href,location.origin);return /^\/(?:[\w.]+\/)?(?:p|reel|reels|tv)\/[\w-]+\/?$/.test(url.pathname)?postId(url.href,'instagram'):null;}catch{return null;}};
  function instagramAccount(){
    const found=new Set();
    for(const link of document.querySelectorAll('a[href]')){
      if(link.closest('article,[role="dialog"]')||!visible(link))continue;
      let navigation=!!link.closest('nav,[role="navigation"]');
      // Instagram's desktop sidebar currently uses divs rather than a nav.
      // Only accept a profile image outside the post area, alongside the main
      // navigation links; an author's avatar is not a signed-in identity.
      for(let parent=link.parentElement;!navigation&&parent&&!parent.querySelector('main');parent=parent.parentElement){
        const links=[...parent.querySelectorAll('a[href]')].map(a=>a.getAttribute('href'));
        navigation=links.includes('/')&&links.includes('/direct/inbox/')&&links.includes('/explore/');
      }
      // The navigation's only avatar link is the signed-in profile in every
      // site language; English labels remain a fallback for icon-only layouts.
      const avatar=navigation&&!link.closest('main')&&!!link.querySelector('img');
      const profile=avatar||/^profile$/i.test(link.getAttribute('aria-label')||'')||[...link.querySelectorAll('svg[aria-label]')].some(svg=>/^profile$/i.test(svg.getAttribute('aria-label')))||[...link.querySelectorAll('img[alt]')].some(img=>/profile picture/i.test(img.alt))&&navigation&&!link.closest('main');
      if(!profile)continue;
      const match=link.getAttribute('href').match(/^\/([\w.]+)\/?$/);if(match&&!['accounts','explore','reels','direct'].includes(match[1]))found.add(`@${match[1]}`.toLowerCase());
    }
    return found.size===1?[...found][0]:null;
  }
  function context(target){
    const id=postId(target.url,target.platform);if(!id||postId(location.href,target.platform)!==id)return null;
    const account=target.platform==='x'?document.querySelector('a[data-testid="AppTabBar_Profile_Link"]')?.getAttribute('href')?.match(/^\/([\w]+)\/?$/)?.[1]:instagramAccount();
    const owner=account?(account.startsWith('@')?account:`@${account}`).toLowerCase():'';
    if(!owner||owner!==target.account.toLowerCase())return null;
    if(target.platform==='x'){
      const state=globalThis.SaveXExtractors?.xBookmarkState(document,target.url);if(!state||state.account.toLowerCase()!==owner)return null;
      const matches=[...document.querySelectorAll('article[data-testid="tweet"]')].filter(article=>{
        const links=[...article.querySelectorAll('a[href]')].filter(a=>a.closest('article')===article&&a.querySelector('time'));
        return postId(links[0]?.href,'x')===id;
      });if(matches.length!==1)return null;
      const controls=[...matches[0].querySelectorAll(`button[data-testid="${state.state==='saved'?'removeBookmark':'bookmark'}"]`)].filter(button=>button.closest('article')===matches[0]&&visible(button)&&!button.disabled);
      return controls.length===1?{state:state.state,account:owner,externalId:id,button:controls[0]}:null;
    }
    const articles=[...document.querySelectorAll('main article,article')].filter(article=>[...article.querySelectorAll('a[href]')].some(link=>link.closest('article')===article&&link.querySelector('time')&&instagramPermalink(link)===id));
    let root=articles.length===1?articles[0]:null;
    if(!root&&!document.querySelector('main article')&&document.querySelectorAll('main').length===1){
      const main=document.querySelector('main'),dates=[...main.querySelectorAll('a[href]')].filter(link=>link.querySelector('time')&&instagramPermalink(link)===id);
      // Scope to the smallest ancestor containing this post's dated permalink
      // and action strip. Recommendations elsewhere in main cannot qualify.
      if(dates.length===1)for(let parent=dates[0].parentElement;parent&&parent!==main;parent=parent.parentElement){
        const labels=[...parent.querySelectorAll('svg[aria-label]')].map(svg=>svg.getAttribute('aria-label'));
        if(labels.some(label=>/^(like|unlike)$/i.test(label))&&labels.includes('Comment')&&labels.some(label=>/^(save|saved|remove|unsave|remove from saved)$/i.test(label))){
          const ids=new Set([...parent.querySelectorAll('a[href]')].filter(link=>link.querySelector('time')).map(instagramPermalink).filter(Boolean));
          if(ids.size===1&&ids.has(id))root=parent;break;
        }
      }
    }
    if(!root)return null;
    const found=new Map();
    for(const svg of root.querySelectorAll('svg[aria-label]')){
      const label=svg.getAttribute('aria-label');if(!/^(save|saved|remove|unsave|remove from saved)$/i.test(label))continue;
      const button=svg.closest('button,[role="button"]');if(!button||!visible(button)||button.disabled||button.getAttribute('aria-disabled')==='true'||button.closest('[role="dialog"]'))continue;
      // The bookmark belongs to the post action strip, not a remove-comment,
      // collection management, recommendation or unrelated menu control.
      let strip=button.parentElement,matched=false;
      while(strip&&strip!==root&&root.contains(strip)){
        const labels=[...strip.querySelectorAll('svg[aria-label]')].map(s=>s.getAttribute('aria-label'));
        if(labels.some(s=>/^(like|unlike)$/i.test(s))&&labels.some(s=>/^comment$/i.test(s))){matched=true;break;}
        if(strip===root)break;strip=strip.parentElement;
      }
      if(matched)found.set(button,{state:/^save$/i.test(label)?'unsaved':'saved',account:owner,externalId:id,button});
    }
    return found.size===1?[...found.values()][0]:null;
  }
  const evidence=value=>value?{state:value.state,account:value.account,externalId:value.externalId,checkedAt:Date.now()}:null;
  function confirmation(target,click=false){
    if(target.platform!=='instagram'||postId(location.href,'instagram')!==postId(target.url,'instagram')||instagramAccount()!==target.account.toLowerCase())return false;
    const dialogs=[...document.querySelectorAll('[role="dialog"]')].filter(dialog=>visible(dialog)&&/remove (?:this post )?from (?:your )?saved|unsave (?:this )?post/i.test(dialog.innerText||dialog.textContent||''));
    if(dialogs.length!==1)return false;
    const buttons=[...dialogs[0].querySelectorAll('button,[role="button"]')].filter(button=>visible(button)&&!button.disabled&&/^(remove|unsave|remove from saved)$/i.test((button.innerText||button.textContent||'').trim()));
    if(buttons.length!==1)return false;if(click)buttons[0].click();return true;
  }
  // Pinterest: the board page proves the account and that the pin is on it, and is where the unsave is sent from.
  const pinTile=id=>{const list=document.querySelector('[data-test-id="board-feed"]')||document;return [...list.querySelectorAll('[data-test-id="pin"]')].find(pin=>pin.getAttribute('data-test-pin-id')===id||pin.querySelector('a[href*="/pin/"]')?.getAttribute('href')?.match(/\/pin\/(?:[^/]*--)?(\d+)/)?.[1]===id)||null;};
  const onBoard=target=>{try{const page=new URL(location.href),board=new URL(target.board);return /(^|\.)pinterest\.[a-z.]+$/.test(page.hostname)&&page.pathname.replace(/\/$/,'')===board.pathname.replace(/\/$/,'')&&page.pathname.split('/')[1]?.toLowerCase()===target.account.replace(/^@/,'').toLowerCase();}catch{return false;}};
  const pinScroller=()=>document.scrollingElement||document.documentElement;
  globalThis.SaveXPinterest={
    // Where the pin stands right now. Moves down the board if it hasn't appeared, and says when the board has run out.
    find:target=>{
      if(!onBoard(target))return {page:false};
      const tile=pinTile(target.externalId),pins=(document.querySelector('[data-test-id="board-feed"]')||document).querySelectorAll('[data-test-id="pin"]').length;
      if(tile){tile.scrollIntoView({block:'center',behavior:'instant'});return {page:true,present:true,pins};}
      const end=pinScroller(),atEnd=end.scrollTop+end.clientHeight>=end.scrollHeight-5;
      end.scrollBy({top:Math.max(500,end.clientHeight*.8),behavior:'instant'});window.dispatchEvent(new Event('scroll'));
      return {page:true,present:false,pins,atEnd,loading:!!document.querySelector('[role="progressbar"],[data-visualcompletion="loading-state"]'),checkedAt:Date.now()};
    },
    // The request Pinterest's own page sends to unsave. It depends on no layout, and only ever works on your own pins.
    remove:async target=>{
      if(!onBoard(target)||!pinTile(target.externalId))return {sent:false,message:'The pin is no longer on this board page.'};
      const token=document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/)?.[1];
      if(!token)return {sent:false,message:'Pinterest didn’t provide what it needs to unsave.'};
      const response=await fetch('/resource/PinResource/delete/',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/x-www-form-urlencoded','Accept':'application/json, text/javascript, */*; q=0.01','X-CSRFToken':token,'X-Requested-With':'XMLHttpRequest'},body:new URLSearchParams({source_url:location.pathname,data:JSON.stringify({options:{id:target.externalId},context:{}})})});
      return {sent:response.ok,status:response.status};
    }
  };
  globalThis.SaveXUnsave={
    inspect:target=>evidence(context(target)),
    act:target=>{const value=context(target);if(!value||value.state!=='saved')return {clicked:false};value.button.click();return {clicked:true};},
    hasConfirmation:target=>confirmation(target),
    confirm:target=>({clicked:confirmation(target,true)})
  };
})();
