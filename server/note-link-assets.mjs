import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

// Explicit local ESM assets for the unbundled UI; never expose node_modules as
// a directory or load a remote script to recognize links in private notes.
const require=createRequire(import.meta.url);
const linkifyPath=import.meta.resolve('linkify-it');
const dependencyRequire=createRequire(linkifyPath);
const unicodePath=new URL('./index.mjs',pathToFileURL(dependencyRequire.resolve('uc.micro')));
const withoutMap=value=>value.replace(/^\/\/# sourceMappingURL=.*$/gm,'');
const [linkify,unicode,tlds]=await Promise.all([readFile(new URL(linkifyPath),'utf8'),readFile(unicodePath,'utf8'),readFile(require.resolve('tlds'),'utf8')]);
export const noteLinkAssets=new Map([
  ['/vendor/note-linkify.mjs',withoutMap(linkify).replace('from "uc.micro"','from "./note-unicode.mjs"')],
  ['/vendor/note-unicode.mjs',withoutMap(unicode)],
  ['/vendor/note-tlds.mjs',`export default ${tlds};`]
]);
