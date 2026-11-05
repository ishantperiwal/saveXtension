export async function unsaveDialog(post,{api,showModal,modal,esc,icon,sourceIcon,onQueued}){
  const prepared=await api(`/posts/${post.id}/unsave/prepare`,{method:'POST',body:{}}),platform=post.platform==='x'?'X':'Instagram';
  const choices=prepared.accounts;
  const thumbnail=post.localImage||post.thumbnail||post.media?.[0];
  showModal(`<h2>Unsave on ${platform}?</h2><div class="unsave-summary">${thumbnail?`<img src="${esc(thumbnail)}" alt="" referrerpolicy="no-referrer">`:''}${post.author?`<strong>@${esc(post.author)}</strong>`:''}<p>${esc(post.text||post.title||'Saved post')}</p></div><form id="unsave-form">${choices.length===1?`<input type="hidden" name="account" value="${esc(choices[0])}">`:`<fieldset class="unsave-accounts"><legend>Account</legend><div class="filter-choices">${choices.map(account=>`<label class="filter-choice"><input type="radio" name="account" value="${esc(account)}" required><span>${sourceIcon(post.platform)}${esc(account)}</span></label>`).join('')}</div></fieldset>`}<p>${choices.length===1?`This post will be unsaved from ${platform} and deleted from saveXtension.`:`This account’s save will be removed from ${platform} and saveXtension.`}</p>${window.saveXDesktop?.socialAccounts ? '' : '<p class="unsave-browser-note">Chrome will open briefly to unsave the post, then return you here.</p>'}<p class="form-error" id="unsave-error" role="alert"></p><div class="unsave-actions"><button type="button" class="secondary" id="unsave-cancel">Cancel</button><button type="submit" class="primary unsave-confirm" id="unsave-confirm" ${choices.length===1?'':'disabled'}>Unsave</button></div></form>`);
  const form=modal.querySelector('#unsave-form'),confirm=modal.querySelector('#unsave-confirm'),cancel=modal.querySelector('#unsave-cancel'),error=modal.querySelector('#unsave-error');
  const account=()=>new FormData(form).get('account');
  form.onchange=()=>{error.textContent='';confirm.disabled=!account();};
  cancel.onclick=()=>modal.close();cancel.focus({preventScroll:true});
  form.onsubmit=async event=>{
    event.preventDefault();if(!account())return;
    const selected=account(),inputs=[...form.querySelectorAll('input,button')];inputs.forEach(input=>input.disabled=true);error.textContent='';
    try{
      const job=await api(`/posts/${post.id}/unsave`,{method:'POST',body:{nonce:prepared.nonce,confirmed:true,account:selected}});
      modal.close();onQueued(job);
    }catch(failure){if(!form.isConnected)return;error.textContent=failure.message;inputs.forEach(input=>input.disabled=false);confirm.disabled=!account();}
  };
}
