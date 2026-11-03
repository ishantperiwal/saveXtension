import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';
import { Readable } from 'node:stream';
import { gzipSync } from 'node:zlib';
import { Store } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';
import { publicIP, publicWebsiteUrl, publicPageUrl, publicAddress, downloadWebsite, websiteMetadata, websitePreviews } from '../server/website-previews.mjs';

const html='<html><head><title>Fallback</title><meta content="A &amp; B" property="og:title"><meta name="description" content="Plain description"><meta property="og:description" content="Website &lt;script&gt; caption"><meta property="og:image" content="/media/cover.png"><meta property="og:image:alt" content="Cover art"></head><body><script>throw Error("must not run")</script></body></html>';
test('website previews read Open Graph and Twitter metadata, entities, relative images and fallback descriptions without executing HTML',()=>{
 assert.deepEqual(websiteMetadata(html,'https://example.com/article'),{title:'A & B',description:'Website <script> caption',image:'https://example.com/media/cover.png',imageAlt:'Cover art'});
 const twitter=websiteMetadata('<head><base href="https://cdn.example.com/assets/"><meta name="twitter:image" content="cover.jpg"><meta name="twitter:title" content="Social title"><meta name="description" content="Summary"></head>','https://example.com/');
 assert.equal(twitter.image,'https://cdn.example.com/assets/cover.jpg');assert.equal(twitter.title,'Social title');assert.equal(twitter.description,'Summary');
 assert.equal(websiteMetadata('<head><meta property="og:image" content="http://127.0.0.1/private"><meta name="twitter:image" content="javascript:alert(1)"></head>','https://example.com/').image,'');
});
test('preview requests reject local networks, credentials, non-web protocols, alternate ports and mixed public/private DNS answers',async()=>{
 for(const url of ['http://localhost/','http://127.1/','http://0x7f000001/','http://10.1.2.3/','http://169.254.169.254/','http://[::1]/','http://[::ffff:127.0.0.1]/','https://user:pass@example.com/','file:///etc/passwd','https://example.com:3217/'])assert.throws(()=>publicWebsiteUrl(url));
 for(const ip of ['100.64.1.1','172.31.2.1','192.168.1.2','0.0.0.0','224.1.1.1','fc00::1','fe80::1','2001:db8::1','2002:7f00:1::'])assert.equal(publicIP(ip),false,ip);
 assert.equal(publicIP('8.8.8.8'),true);assert.equal(publicIP('2606:4700:4700::1111'),true);
 await assert.rejects(publicAddress('example.com',async()=>[{address:'8.8.8.8',family:4},{address:'127.0.0.1',family:4}]),/private/);
 assert.equal(publicPageUrl('https://example.com/article?mcp_token=private&chapter=2&access_token=private#intro').href,'https://example.com/article?chapter=2');
});
test('downloads pin checked DNS, follow only public redirects, decode compression and bound decompressed content',async()=>{
 const resolve=async()=>[{address:'8.8.8.8',family:4}];let opened=0,pinned;
 const open=(url,options,done)=>{
  opened++;options.lookup(url.hostname,{},(_error,address)=>pinned=address);
  const response=Readable.from([gzipSync(html)]);response.statusCode=200;response.headers={'content-type':'text/html','content-encoding':'gzip'};
  queueMicrotask(()=>done(response));return new EventEmitter();
 };
 const result=await downloadWebsite('https://example.com/', 'html',{resolve,open});assert.equal(result.bytes.toString(),html);assert.equal(pinned,'8.8.8.8');
 const redirect=(_url,_options,done)=>{opened++;const response=Readable.from([]);response.statusCode=302;response.headers={location:'http://127.0.0.1/private'};queueMicrotask(()=>done(response));return new EventEmitter();};
 await assert.rejects(downloadWebsite('https://example.com/','html',{resolve,open:redirect}),/public/);assert.equal(opened,2);
 const huge=(_url,_options,done)=>{const response=Readable.from([gzipSync('x'.repeat(800000))]);response.statusCode=200;response.headers={'content-type':'text/html','content-encoding':'gzip'};queueMicrotask(()=>done(response));return new EventEmitter();};
 await assert.rejects(downloadWebsite('https://example.com/','html',{resolve,open:huge}),/too large/);
});
test('metadata and images coalesce requests and cache results; unavailable pages and private bookmarks remain usable',async()=>{
 const store=new Store(':memory:');let reads=0;
 const download=async(url,kind)=>{reads++;await new Promise(resolve=>setTimeout(resolve,10));if(url.includes('broken'))throw Error('Unavailable');return{url,type:kind==='html'?'text/html':'image/png',bytes:Buffer.from(kind==='html'?html:'PNG')};};
 try{
  const previews=websitePreviews(store,{download});
  await Promise.all([previews.metadata('https://example.com/'),previews.metadata('https://example.com/#section')]);assert.equal(reads,1);
  await Promise.all([previews.image('https://example.com/'),previews.image('https://example.com/')]);assert.equal(reads,2);
  await previews.image('https://example.com/');assert.equal(reads,2);
  assert.equal((await previews.metadata('https://broken.example.com/')).unavailable,true);await previews.metadata('https://broken.example.com/');assert.equal(reads,3);
  assert.equal((await previews.metadata('http://localhost:3217/')).unavailable,true);assert.equal(reads,3);
 }finally{store.close();}
});
test('preview API serves only existing Chrome bookmark images through the local origin and does not alter the save',async()=>{
 const origin='http://localhost:3249',app=createApp({origin,websiteDownload:async(url,kind)=>({url,type:kind==='html'?'text/html':'image/png',bytes:Buffer.from(kind==='html'?html:'PNG')})});
 app.server.listen(3249,'127.0.0.1');await once(app.server,'listening');
 try{
  app.store.importPosts([{platform:'chrome',url:'https://example.com/article',bookmarkTitle:'My bookmark name',notes:'My note'},{url:'https://x.com/i/status/12345'}]);
  const post=app.store.posts({scope:'all'}).find(p=>p.platform==='chrome'),before=JSON.stringify(post);
  const response=await fetch(`${origin}/api/posts/${post.id}/website-preview`),data=await response.json();assert.equal(data.title,'A & B');assert.equal(data.image,`/api/posts/${post.id}/website-image`);
  const image=await fetch(origin+data.image);assert.equal(image.status,200);assert.equal(image.headers.get('content-type'),'image/png');assert.match(image.headers.get('cache-control'),/private/);
  assert.equal((await fetch(origin+data.image,{headers:{'Sec-Fetch-Site':'cross-site'}})).status,403);
  const social=app.store.posts({scope:'all'}).find(p=>p.platform==='x');assert.equal((await fetch(`${origin}/api/posts/${social.id}/website-preview`)).status,404);
  assert.equal(JSON.stringify(app.store.post(post.id)),before);
 }finally{await app.mcp.close();await new Promise(resolve=>app.server.close(resolve));app.store.close();}
});
