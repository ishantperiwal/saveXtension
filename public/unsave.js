export async function unsaveDialog(post,{api,showModal,modal,esc,icon,sourceIcon,onQueued}){
  const prepared=await api(`/posts/${post.id}/unsave/prepare`,{method:'POST',body:{}}),platform=post.platform==='x'?'X':'Instagram';
  const choices=prepared.accounts;
  showModal(`<h2>Unsave on ${platform}?</h2><div class="unsave-summary">${post.author?`<strong>@${esc(post.author)}</strong>`:''}<p>${esc(post.text||post.title||'Saved post')}</p><a href="${esc(post.url)}" target="_blank" rel="noopener noreferrer">Open post ${icon('arrow')}</a></div><form id="unsave-form">${choices.length===1?`<p class="unsave-account">${sourceIcon(post.platform)}<span>${esc(choices[0])}</span></p><input type="hidden" name="account" value="${esc(choices[0])}">`:`<fieldset class="unsave-accounts"><legend>Account</legend><div class="filter-choices">${choices.map(account=>`<label class="filter-choice"><input type="radio" name="account" value="${esc(account)}" required><span>${sourceIcon(post.platform)}${esc(account)}</span></label>`).join('')}</div></fieldset>`}<p>This removes the post from <strong id="unsave-target">${choices.length===1?esc(choices[0]):'the selected account'}</strong>’s ${post.platform==='x'?'bookmarks':'Saved posts and Instagram collections'}. When no other account has it saved, its local notes and collection assignments are permanently deleted.</p><label class="unsave-acknowledgement"><input type="checkbox" id="unsave-acknowledge" required><span>I understand this deletes the save.</span></label><p class="form-error" id="unsave-error" role="alert"></p><div class="unsave-actions"><button type="button" class="secondary" id="unsave-cancel">Cancel</button><button type="submit" class="primary unsave-confirm" id="unsave-confirm" disabled>Unsave on ${platform}</button></div></form>`);
  const form=modal.querySelector('#unsave-form'),ack=modal.querySelector('#unsave-acknowledge'),confirm=modal.querySelector('#unsave-confirm'),cancel=modal.querySelector('#unsave-cancel'),error=modal.querySelector('#unsave-error');
  const account=()=>new FormData(form).get('account');
  form.onchange=event=>{
    if(event.target.name==='account'){ack.checked=false;modal.querySelector('#unsave-target').textContent=account()||'the selected account';}
    error.textContent='';confirm.disabled=!ack.checked||!account();
  };
  cancel.onclick=()=>modal.close();cancel.focus({preventScroll:true});
  form.onsubmit=async event=>{
    event.preventDefault();if(!ack.checked||!account())return;
    const selected=account(),inputs=[...form.querySelectorAll('input,button')];inputs.forEach(input=>input.disabled=true);error.textContent='';
    try{
      const job=await api(`/posts/${post.id}/unsave`,{method:'POST',body:{nonce:prepared.nonce,confirmed:true,account:selected}});
      modal.close();onQueued(job);
    }catch(failure){if(!form.isConnected)return;error.textContent=failure.message;inputs.forEach(input=>input.disabled=false);confirm.disabled=!ack.checked||!account();}
  };
}
