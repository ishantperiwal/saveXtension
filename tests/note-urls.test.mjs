import test from 'node:test';
import assert from 'node:assert/strict';
import { LinkifyIt } from 'linkify-it';
import {createRequire} from 'node:module';
import {noteUrlSegments} from '../public/note-urls.js';
import {noteLinkAssets} from '../server/note-link-assets.mjs';
const tlds=createRequire(import.meta.url)('tlds');
const linkify=new LinkifyIt({fuzzyLink:true,fuzzyEmail:false}).tlds(tlds);
test('notes recognize bare domains, www, explicit URLs, unicode and paths without absorbing trailing punctuation',()=>{
 const text='Try contemporarytype.com, www.example.design/tools?x=1&y=2 and https://example.com/a_(b). Also bücher.de.';
 const parts=noteUrlSegments(text,linkify);
 assert.equal(parts.map(part=>part.text).join(''),text);
 assert.deepEqual(parts.filter(part=>part.href).map(part=>part.href),['https://contemporarytype.com/','https://www.example.design/tools?x=1&y=2','https://example.com/a_(b)','https://xn--bcher-kva.de/']);
});
test('notes remain exact plain text and never make executable schemes, credentials, emails or code filenames clickable',()=>{
 for(const text of ['javascript:alert(1)','data:text/html,<script>alert(1)</script>','file:///tmp/example','mailto:person@example.com','ftp://example.com/file','https://user:password@example.com/private','app.js and styles.css']){
  const parts=noteUrlSegments(text,linkify);assert.equal(parts.map(part=>part.text).join(''),text);assert.equal(parts.some(part=>part.href),false,text);
 }
 assert.equal(noteLinkAssets.size,3);
 assert.match(noteLinkAssets.get('/vendor/note-linkify.mjs'),/from "\.\/note-unicode.mjs"/);
});
