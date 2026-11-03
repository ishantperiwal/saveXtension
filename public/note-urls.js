export function noteUrlSegments(text,linkify){
  const parts=[];let cursor=0;
  for(const match of linkify.match(text)||[]){
    let href;
    try{
      if(/^https?:\/\/[^\s/?#]*@/i.test(text.slice(match.index).split(/\s/)[0]))continue;
      const url=new URL(!match.schema?`https://${match.raw}`:match.schema==='//'?`https:${match.raw}`:match.url);
      if(!['http:','https:'].includes(url.protocol)||url.username||url.password)continue;
      href=url.href;
    }catch{continue;}
    if(match.index>cursor)parts.push({text:text.slice(cursor,match.index)});
    parts.push({text:text.slice(match.index,match.lastIndex),href});cursor=match.lastIndex;
  }
  if(cursor<text.length)parts.push({text:text.slice(cursor)});
  return parts;
}
