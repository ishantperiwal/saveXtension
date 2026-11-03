import { LinkifyIt } from '/vendor/note-linkify.mjs';
import tlds from '/vendor/note-tlds.mjs';
import { noteUrlSegments } from './note-urls.js';
const linkify=new LinkifyIt({fuzzyLink:true,fuzzyEmail:false}).tlds(tlds);
export function syncNoteLinks(field){
  const preview=field.parentElement.querySelector('.note-link-preview');
  if(!preview)return;
  if(document.activeElement===field){preview.hidden=true;return;}
  if(preview.noteValue!==field.value){
    preview.noteValue=field.value;
    const parts=noteUrlSegments(field.value,linkify),hasLinks=parts.some(part=>part.href);
    preview.replaceChildren(...(hasLinks?parts.map(part=>{
      const node=document.createElement(part.href?'a':'span');node.textContent=part.text;
      if(part.href){node.href=part.href;node.target='_blank';node.rel='noopener noreferrer';}
      else node.setAttribute('aria-hidden','true');
      return node;
    }):[]));
    field.classList.toggle('has-note-links',hasLinks);
  }
  preview.hidden=!field.classList.contains('has-note-links')||document.activeElement===field;
  if(!preview.hidden)preview.scrollTop=0;
}
