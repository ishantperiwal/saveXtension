import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {readFile} from 'node:fs/promises';
const extractors=await readFile(new URL('../extension/extractors.js',import.meta.url),'utf8'),script=await readFile(new URL('../extension/unsave-dom.js',import.meta.url),'utf8');
const make=(body,url)=>{const dom=new JSDOM(body,{url,runScripts:'outside-only'});dom.window.HTMLElement.prototype.getClientRects=function(){return [{width:20,height:20}];};dom.window.eval(extractors);dom.window.eval(script);return dom;};
const xBody=(owner='one')=>`<a data-testid="AppTabBar_Profile_Link" href="/${owner}">Profile</a><main><article data-testid="tweet"><a href="/writer/status/12345"><time>Today</time></a><button data-testid="removeBookmark" aria-label="Remove Bookmark">Remove bookmark</button><article data-testid="tweet"><a href="/other/status/67890"><time>Today</time></a><button data-testid="removeBookmark">Quoted bookmark</button></article></article></main>`;
const target={url:'https://x.com/i/status/12345',platform:'x',account:'@one'};
test('a reply in a thread unsaves only the reply, leaving its parent and other replies untouched',()=>{
 const article=(id,name)=>`<article data-testid="tweet"><a href="/writer/status/${id}"><time>Today</time></a><div data-testid="tweetText">${name}</div><button id="post-${id}" data-testid="removeBookmark" aria-label="47 Bookmarks. Remove Bookmark">Remove</button></article>`;
 const dom=make(`<a data-testid="AppTabBar_Profile_Link" href="/one">Profile</a><main>${article(11111,'Parent')}${article(12345,'Reply')}${article(67890,'Another reply')}</main>`,target.url);
 try{
  const clicks=[];for(const button of dom.window.document.querySelectorAll('button'))button.onclick=()=>clicks.push(button.id);
  assert.equal(dom.window.SaveXUnsave.inspect(target).state,'saved');assert.equal(dom.window.SaveXUnsave.act(target).clicked,true);
  assert.deepEqual(clicks,['post-12345']);
 }finally{dom.window.close();}
});
test('X unsave targets only its own explicit saved button and never re-toggles an unsaved post',()=>{
 const dom=make(xBody(),target.url);try{let count=0,quoted=0;const button=dom.window.document.querySelector('button');button.onclick=()=>{count++;button.dataset.testid='bookmark';button.setAttribute('aria-label','Bookmark');};dom.window.document.querySelector('article article button').onclick=()=>quoted++;
 const api=dom.window.SaveXUnsave;assert.equal(api.inspect(target).state,'saved');assert.equal(api.act(target).clicked,true);assert.equal(api.inspect(target).state,'unsaved');assert.equal(api.act(target).clicked,false);assert.equal(count,1);assert.equal(quoted,0);
 }finally{dom.window.close();}
});
test('X refuses the wrong signed-in account, wrong post URL and ambiguous controls',()=>{
 const dom=make(xBody('other'),target.url);try{const api=dom.window.SaveXUnsave;assert.equal(api.inspect(target),null);assert.equal(api.act(target).clicked,false);dom.window.document.querySelector('a').href='/one';assert.equal(api.inspect({...target,url:'https://x.com/i/status/67890'}),null);dom.window.document.querySelector('article').append(dom.window.document.querySelector('button').cloneNode(true));assert.equal(api.inspect(target),null);
 }finally{dom.window.close();}
});
test('X detail-page bookmark counts are recognized as already unsaved and are never clicked',()=>{
 const dom=make(xBody(),target.url);try{
  const button=dom.window.document.querySelector('button');button.dataset.testid='bookmark';button.setAttribute('aria-label','235 Bookmarks. Bookmark');let clicks=0;button.onclick=()=>clicks++;
  assert.equal(dom.window.SaveXUnsave.inspect(target).state,'unsaved');assert.equal(dom.window.SaveXUnsave.act(target).clicked,false);assert.equal(clicks,0);
 }finally{dom.window.close();}
});
const igBody=()=>`<nav><a href="/one/" aria-label="Profile">Profile</a></nav><main><article><a href="/p/ExactPost/"><time>Today</time></a><section><button><svg aria-label="Like"></svg></button><button><svg aria-label="Comment"></svg></button><button id="save"><svg aria-label="Remove"></svg></button></section><section class="comments"><button id="comment-delete"><svg aria-label="Remove"></svg></button></section></article></main>`;
const igTarget={url:'https://www.instagram.com/p/ExactPost/',platform:'instagram',account:'@one'};
test('Instagram identifies the post action strip and handles only an explicit global-unsave confirmation',()=>{
 const dom=make(igBody(),igTarget.url);try{let clicks=0,removed=0;const {document}=dom.window;document.querySelector('#comment-delete').onclick=()=>removed++;
 document.querySelector('#save').onclick=()=>{clicks++;const dialog=document.createElement('div');dialog.setAttribute('role','dialog');dialog.innerHTML='<h2>Remove from saved?</h2><button>Remove</button><button>Cancel</button>';dialog.querySelector('button').onclick=()=>{document.querySelector('#save svg').setAttribute('aria-label','Save');dialog.remove();};document.body.append(dialog);};
 const api=dom.window.SaveXUnsave;assert.equal(api.inspect(igTarget).state,'saved');assert.equal(api.act(igTarget).clicked,true);assert.equal(api.hasConfirmation(igTarget),true);assert.equal(api.confirm(igTarget).clicked,true);assert.equal(api.inspect(igTarget).state,'unsaved');assert.equal(api.act(igTarget).clicked,false);assert.equal(clicks,1);assert.equal(removed,0);
 }finally{dom.window.close();}
});
test('Instagram fails closed for comment-removal controls, unrelated recommendations, collection-only dialogs and account mismatches',()=>{
 const dom=make(igBody(),igTarget.url);try{const api=dom.window.SaveXUnsave,doc=dom.window.document;
 assert.equal(api.inspect({...igTarget,account:'@other'}),null);doc.querySelector('#save').hidden=true;assert.equal(api.inspect(igTarget),null);
 doc.querySelector('article a').href='/p/OtherPost/';assert.equal(api.inspect(igTarget),null);
 const dialog=doc.createElement('div');dialog.setAttribute('role','dialog');dialog.innerHTML='<p>Remove from collection?</p><button>Remove</button>';doc.body.append(dialog);assert.equal(api.confirm(igTarget).clicked,false);
 }finally{dom.window.close();}
});
test('Instagram supports the desktop div-based navigation and post layout without confusing recommended posts or comment links',()=>{
 const body=`<aside><div><a href="/">Home</a><a href="/direct/inbox/">Messages</a><a href="/explore/">Search</a><a href="/one/"><img alt="one's profile picture"></a></div></aside><main><div><a href="/writer/"><img alt="writer's profile picture"></a><a href="/p/ExactPost/c/123/"><time>Comment date</time></a><div><section><button><svg aria-label="Like"></svg></button><button><svg aria-label="Comment"></svg></button><div role="button"><div role="button" id="own-save"><svg aria-label="Remove"></svg></div></div></section><a href="/writer/reel/ExactPost/"><time>Today</time></a></div></div><div><a href="/writer/reel/Recommendation/">Recommended</a><button><svg aria-label="Remove"></svg></button></div></main>`;
 const dom=make(body,igTarget.url);try{const api=dom.window.SaveXUnsave,doc=dom.window.document;let count=0;doc.querySelector('#own-save').onclick=()=>count++;
 assert.equal(api.inspect(igTarget).state,'saved');assert.equal(api.act(igTarget).clicked,true);assert.equal(count,1);
 doc.querySelector('a[href="/writer/reel/ExactPost/"]').href='/writer/reel/Another/';assert.equal(api.inspect(igTarget),null);
 }finally{dom.window.close();}
});
