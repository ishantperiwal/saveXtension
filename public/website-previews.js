import { PRELOAD_SCREENS } from './preview-policy.js';
const cards=new Map(),cache=new Map();let running=0,scheduled=false;
function schedule(){if(!scheduled){scheduled=true;requestAnimationFrame(()=>{scheduled=false;pump();});}}
const observer=new ResizeObserver(schedule);
for(const type of ['scroll','resize'])window.addEventListener(type,schedule,{passive:true});
function apply(element,data){
  if(!element.isConnected)return;
  const description=element.querySelector('.bookmark-description');
  description.textContent=data.description||'';description.hidden=!data.description;
  const media=element.querySelector('.bookmark-media'),image=media.querySelector('img');
  if(data.image){
    image.onload=()=>{if(element.isConnected){media.hidden=false;element.dataset.websiteState='ready';}};
    image.onerror=()=>{media.hidden=true;cache.set(element.dataset.websiteUrl,{...data,image:null});};
    image.alt=data.imageAlt||'';image.src=data.image;
  }
  element.dataset.websiteState='ready';
}
function pump(){
  const height=innerHeight,candidates=[];
  for(const [element,item]of cards){
    if(!element.isConnected){observer.unobserve(element);cards.delete(element);continue;}
    if(item.started)continue;
    const rect=element.getBoundingClientRect();
    if(!rect.height||rect.bottom < -height*PRELOAD_SCREENS||rect.top>height*(1+PRELOAD_SCREENS))continue;
    candidates.push({element,item,visible:rect.bottom>0&&rect.top<height,distance:Math.abs((rect.top+rect.bottom)/2-height/2)});
  }
  candidates.sort((a,b)=>Number(b.visible)-Number(a.visible)||a.distance-b.distance);
  for(const {element,item}of candidates){
    if(running>=3)break;
    item.started=true;
    const cached=cache.get(element.dataset.websiteUrl);
    if(cached){apply(element,cached);continue;}
    running++;element.dataset.websiteState='loading';
    fetch(`/api/posts/${element.closest('.save-card').dataset.postId}/website-preview`)
      .then(response=>{if(!response.ok)throw new Error('No preview');return response.json();})
      .then(data=>{cache.set(element.dataset.websiteUrl,data);apply(element,data);})
      .catch(()=>{element.dataset.websiteState='unavailable';})
      .finally(()=>{running--;schedule();});
  }
}
export function mountWebsitePreviews(root){
  for(const element of root.querySelectorAll('.bookmark-preview[data-website-url]')){
    if(cards.has(element))continue;
    cards.set(element,{started:false});observer.observe(element);
  }
  schedule();
}
