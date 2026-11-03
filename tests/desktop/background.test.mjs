import test from 'node:test';
import assert from 'node:assert/strict';
import{_electron}from'playwright';
import{expect}from'@playwright/test';
import{mkdtemp,mkdir,cp,symlink,writeFile,readFile,rm}from'node:fs/promises';
import{join,resolve}from'node:path';
import{tmpdir}from'node:os';
import{createRequire}from'node:module';
const require=createRequire(import.meta.url);

test('native probes and wakeups keep Chrome closed; note links use the default browser and bookmark setup opens Chrome explicitly',{timeout:60000},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'savex-background-')),appPath=join(dir,'application'),callsPath=join(dir,'browser-calls.jsonl');await mkdir(appPath);
 for(const name of ['desktop','server','public','extension'])await cp(resolve(name),join(appPath,name),{recursive:true});await cp(resolve('package.json'),join(appPath,'package.json'));await symlink(resolve('node_modules'),join(appPath,'node_modules'),process.platform==='win32'?'junction':'dir');
 await writeFile(join(appPath,'desktop/browser.mjs'),`import{appendFile}from'node:fs/promises';export async function openSyncBrowser(url,options={}){await appendFile(${JSON.stringify(callsPath)},JSON.stringify({url,options})+'\\n');}export async function focusSyncBrowser(){await appendFile(${JSON.stringify(callsPath)},JSON.stringify({focus:true})+'\\n');}`);
 const env={...process.env,SAVEX_DESKTOP_DATA_DIR:join(dir,'library'),SAVEX_DESKTOP_LEGACY_ORIGIN:'http://localhost:1',SAVEX_DESKTOP_DISABLE_AUTO_SYNC:'1'};delete env.ELECTRON_RUN_AS_NODE;
 const desktop=await _electron.launch({executablePath:require('electron'),args:[appPath],env});
 const calls=async()=>{try{return(await readFile(callsPath,'utf8')).trim().split('\n').filter(Boolean).map(line=>JSON.parse(line));}catch(error){if(error.code==='ENOENT')return[];throw error;}};
 try{
  const page=await desktop.firstWindow();await page.waitForSelector('[data-action="settings"]');const origin=new URL(page.url()).origin,headers={Origin:origin};
  // The launcher is a recorder: this cannot open or activate the user's Chrome.
  await page.evaluate(()=>window.saveXDesktop.connect('PROBE_EXTENSION'));
  assert.equal((await calls()).length,0);
  const helperVersion=JSON.parse(await readFile(join(appPath,'extension/manifest.json'),'utf8')).version;
  const heartbeat=await page.request.post(origin+'/api/extension/jobs',{headers,data:{instance:'test-helper',ready:true,unsave:true,version:helperVersion,bookmarksSupported:true,bookmarksReady:true,desktopBookmarks:true,accountSwitching:true,selectedAccounts:true,syncModes:true,instagramCollections:true,instagramSaveLists:true}});assert.equal(heartbeat.ok(),true);
  await page.request.post(origin+'/api/posts/import',{headers,data:{posts:[{url:'https://www.instagram.com/reel/BackgroundTest/',accounts:['@one'],notes:'contemporarytype.com'}]}});await page.route('https://**/*',route=>route.abort());await page.reload();
  await desktop.evaluate(({shell})=>{globalThis.openedNoteLinks=[];shell.openExternal=async url=>{globalThis.openedNoteLinks.push(url);};});
  await page.locator('.note-link-preview').getByRole('link',{name:'contemporarytype.com',exact:true}).click();
  await expect.poll(()=>desktop.evaluate(()=>globalThis.openedNoteLinks)).toEqual(['https://contemporarytype.com/']);
  await page.evaluate(async()=>{await window.saveXDesktop.connect('PROBE_EXTENSION');await window.saveXDesktop.connect('WAKE_SYNC');});assert.equal((await calls()).length,0);
  await page.getByRole('button',{name:'Settings & backups'}).click();
  await expect(page.getByRole('button',{name:'Add X account',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Add Instagram account',exact:true})).toBeVisible();
  // Only an explicitly requested Chrome bookmark setup opens the browser.
  await page.evaluate(()=>window.saveXDesktop.connect('OPEN_BOOKMARK_SETUP'));assert.equal((await calls()).length,1);assert.equal((await calls())[0].options.background,false);
 }finally{await desktop.close();await rm(dir,{recursive:true,force:true});}
});
