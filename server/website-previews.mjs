import { parse } from 'parse5';
import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
import { get as httpGet } from 'node:http';
import { get as httpsGet } from 'node:https';
import { createGunzip, createInflate, createBrotliDecompress } from 'node:zlib';

const blocked = new BlockList();
for (const [address, prefix] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.168.0.0',16],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',4],['240.0.0.0',4]]) blocked.addSubnet(address,prefix,'ipv4');
const globalV6 = new BlockList(); globalV6.addSubnet('2000::',3,'ipv6');
for (const [address,prefix] of [['2001::',23],['2001:db8::',32],['2002::',16],['3fff::',20]]) blocked.addSubnet(address,prefix,'ipv6');
export function publicIP(address) {
  return isIP(address)===4 ? !blocked.check(address,'ipv4') : isIP(address)===6 && globalV6.check(address,'ipv6') && !blocked.check(address,'ipv6');
}
export function publicWebsiteUrl(value, base) {
  const url=new URL(value,base),host=url.hostname.replace(/^\[|\]$/g,'').toLowerCase();
  if(!['https:','http:'].includes(url.protocol)||url.username||url.password||url.port||!host.includes('.')&&!isIP(host)||/\.(?:local|localhost|internal|home|lan|test|invalid)$/.test(host)||host==='localhost'||isIP(host)&&!publicIP(host))throw new Error('Not a public website.');
  url.hash=''; return url;
}
export function publicPageUrl(value,base){
  const url=publicWebsiteUrl(value,base);
  // A bookmark can contain a sign-in/share credential. Public preview requests
  // do not need it; keep the user's original clickable bookmark unchanged.
  for(const key of [...url.searchParams.keys()])if(/(?:^|[_-])(?:token|secret|password|session|authorization|auth|api[_-]?key|signature|jwt|credential)(?:$|[_-])/i.test(key))url.searchParams.delete(key);
  return url;
}
export async function publicAddress(host, resolve=lookup) {
  const values=await resolve(host,{all:true,verbatim:true});
  if(!values.length||values.some(value=>!publicIP(value.address)))throw new Error('Website resolved to a private address.');
  return values.find(value=>value.family===4)||values[0];
}

// Pin the checked address to the socket, rechecking every redirect. No browser
// cookies, scripts, local-network URLs or arbitrary ports are used for previews.
export async function downloadWebsite(value, kind='html', {resolve=lookup,open,timeout=8000}={}) {
  let url=(kind==='html'?publicPageUrl:publicWebsiteUrl)(value);const deadline=Date.now()+timeout,limit=kind==='image'?5*1024*1024:768*1024;
  for(let hop=0;hop<4;hop++) {
    const remaining=deadline-Date.now();if(remaining<=0)throw new Error('Preview timed out.');
    let timer;
    const address=await Promise.race([publicAddress(url.hostname.replace(/^\[|\]$/g,''),resolve),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Preview timed out.')),remaining);timer.unref();})]).finally(()=>clearTimeout(timer));
    const signal=AbortSignal.timeout(Math.max(1,deadline-Date.now()));
    const response=await new Promise((resolve,reject)=>{
      const request=(open||(url.protocol==='https:'?httpsGet:httpGet))(url,{agent:false,autoSelectFamily:false,signal,lookup:(_host,options,done)=>options.all?done(null,[address]):done(null,address.address,address.family),headers:{Accept:kind==='image'?'image/avif,image/webp,image/png,image/jpeg,image/gif':'text/html,application/xhtml+xml','Accept-Encoding':'gzip, deflate, br','User-Agent':'saveXtension/1.2 (+website previews)'}},resolve);
      request.on('error',reject);
    });
    if([301,302,303,307,308].includes(response.statusCode)) {
      response.destroy(); if(!response.headers.location)throw new Error('Invalid redirect.');
      url=(kind==='html'?publicPageUrl:publicWebsiteUrl)(response.headers.location,url);continue;
    }
    if(response.statusCode!==200){response.destroy();throw new Error('Website did not provide a preview.');}
    const type=(response.headers['content-type']||'').split(';')[0].trim().toLowerCase();
    if(kind==='html'?!['text/html','application/xhtml+xml'].includes(type):!['image/png','image/jpeg','image/webp','image/gif','image/avif'].includes(type)){response.destroy();throw new Error('Unsupported preview content.');}
    const encoding=response.headers['content-encoding'],decoder=encoding==='gzip'?createGunzip():encoding==='deflate'?createInflate():encoding==='br'?createBrotliDecompress():null;
    if(encoding&&encoding!=='identity'&&!decoder){response.destroy();throw new Error('Unsupported encoding.');}
    const stream=decoder?response.pipe(decoder):response,parts=[];let size=0;
    if(decoder)response.on('error',error=>decoder.destroy(error));
    try{for await(const part of stream){
      size+=part.length;if(size>limit)throw new Error('Preview is too large.');parts.push(part);
      // Link metadata lives in the head. Do not download a site's often much
      // larger body, hydration payloads, videos or other page resources.
      if(kind==='html'&&/<\/head\s*>/i.test(Buffer.concat(parts).toString('utf8')))break;
    }}
    finally{response.destroy();decoder?.destroy();}
    return {url:url.href,type,bytes:Buffer.concat(parts)};
  }
  throw new Error('Too many redirects.');
}

export function websiteMetadata(html, url) {
  const document=parse(html),head=document.childNodes.find(node=>node.tagName==='html')?.childNodes.find(node=>node.tagName==='head'),values=new Map();
  let title='',base=url,linkedImage='';
  const clean=(value,max=600)=>String(value||'').replace(/\s+/g,' ').trim().slice(0,max);
  for(const node of head?.childNodes||[]) {
    const attrs=Object.fromEntries((node.attrs||[]).map(attr=>[attr.name,attr.value]));
    if(node.tagName==='base'&&attrs.href)try{base=publicWebsiteUrl(attrs.href,url).href;}catch{}
    if(node.tagName==='meta'){const key=(attrs.property||attrs.name||'').toLowerCase();if(!values.has(key)&&attrs.content)values.set(key,attrs.content);}
    if(node.tagName==='title')title=(node.childNodes||[]).map(child=>child.value||'').join('');
    if(node.tagName==='link'&&attrs.rel?.split(/\s+/).includes('image_src'))linkedImage=attrs.href;
  }
  let image='';
  for(const value of [values.get('og:image:secure_url'),values.get('og:image'),values.get('og:image:url'),values.get('twitter:image'),values.get('twitter:image:src'),linkedImage]){
    if(value)try{image=publicWebsiteUrl(value,base).href;break;}catch{}
  }
  return {title:clean(values.get('og:title')||values.get('twitter:title')||title,200),description:clean(values.get('og:description')||values.get('twitter:description')||values.get('description'),360),image,imageAlt:clean(values.get('og:image:alt'),200)};
}

function queue(limit) {
  let active=0;const waiting=[];
  const pump=()=>{while(active<limit&&waiting.length){const {task,resolve,reject}=waiting.shift();active++;Promise.resolve().then(task).then(resolve,reject).finally(()=>{active--;pump();});}};
  return task=>new Promise((resolve,reject)=>{waiting.push({task,resolve,reject});pump();});
}
export function websitePreviews(store,{download=downloadWebsite}={}) {
  store.db.exec('CREATE TABLE IF NOT EXISTS website_previews (url TEXT PRIMARY KEY, metadata TEXT NOT NULL, updated_at INTEGER NOT NULL)');
  const pending=new Map(),images=new Map(),run=queue(3);let imageBytes=0;
  const cached=store.db.prepare('SELECT * FROM website_previews WHERE url=?');
  const save=store.db.prepare('INSERT OR REPLACE INTO website_previews(url,metadata,updated_at) VALUES(?,?,?)');
  async function metadata(value) {
    let url;try{url=publicPageUrl(value).href;}catch{return {title:'',description:'',image:'',imageAlt:'',unavailable:true};}
    const row=cached.get(url);
    if(row&&Date.now()-row.updated_at<(JSON.parse(row.metadata).unavailable?3600000:86400000))return JSON.parse(row.metadata);
    if(pending.has(url))return pending.get(url);
    const promise=run(async()=>{
      let data;
      try{const page=await download(url,'html');data=websiteMetadata(page.bytes.toString('utf8'),page.url);}
      catch{data={title:'',description:'',image:'',imageAlt:'',unavailable:true};}
      save.run(url,JSON.stringify(data),Date.now());return data;
    }).finally(()=>pending.delete(url));
    pending.set(url,promise);return promise;
  }
  async function image(value) {
    const meta=await metadata(value);if(!meta.image)return null;
    const key=meta.image,cachedImage=images.get(key);if(cachedImage&&Date.now()-cachedImage.at<1800000)return cachedImage;
    const pendingKey=`image:${key}`;if(pending.has(pendingKey))return pending.get(pendingKey);
    const promise=run(async()=>{
      try{
        const result={...await download(key,'image'),at:Date.now()};
        if(cachedImage){images.delete(key);imageBytes-=cachedImage.bytes.length;}
        while(imageBytes+result.bytes.length>24*1024*1024&&images.size){const oldest=images.keys().next().value;imageBytes-=images.get(oldest).bytes.length;images.delete(oldest);}
        images.set(key,result);imageBytes+=result.bytes.length;return result;
      }catch{return null;}
    }).finally(()=>pending.delete(pendingKey));pending.set(pendingKey,promise);return promise;
  }
  return {metadata,image};
}
