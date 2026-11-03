import test from 'node:test';
import assert from 'node:assert/strict';
import{_electron}from'playwright';
import{expect}from'@playwright/test';
import{mkdtemp,mkdir,cp,symlink,writeFile,readFile,rm}from'node:fs/promises';
import{join,resolve}from'node:path';
import{tmpdir}from'node:os';
import{createRequire}from'node:module';
const require=createRequire(import.meta.url);

test('connected desktop scans and unsaves launch no browser pages; reconnection is background-only and explicit setup stays visible',{timeout:60000},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'savex-background-')),appPath=join(dir,'application'),callsPath=join(dir,'browser-calls.jsonl');await mkdir(appPath);
 for(const name of ['desktop','server','public','extension'])await cp(resolve(name),join(appPath,name),{recursive:true});await cp(resolve('package.json'),join(appPath,'package.json'));await symlink(resolve('node_modules'),join(appPath,'node_modules'),process.platform==='win32'?'junction':'dir');
 await writeFile(join(appPath,'desktop/browser.mjs'),`import{appendFile}from'node:fs/promises';export async function openSyncBrowser(url,options={}){await appendFile(${JSON.stringify(callsPath)},JSON.stringify({url,options})+'\\n');}`);
 const env={...process.env,SAVEX_DESKTOP_DATA_DIR:join(dir,'library'),SAVEX_DESKTOP_LEGACY_ORIGIN:'http://localhost:1',SAVEX_DESKTOP_DISABLE_AUTO_SYNC:'1'};delete env.ELECTRON_RUN_AS_NODE;
 const desktop=await _electron.launch({executablePath:require('electron'),args:[appPath],env});
 const calls=async()=>{try{return(await readFile(callsPath,'utf8')).trim().split('\n').filter(Boolean).map(line=>JSON.parse(line));}catch(error){if(error.code==='ENOENT')return[];throw error;}};
 try{
  const page=await desktop.firstWindow();await page.waitForSelector('[data-action="settings"]');const origin=new URL(page.url()).origin,headers={Origin:origin};
  // The launcher is a recorder: this cannot open or activate the user's Chrome.
  assert.equal(await page.evaluate(()=>window.saveXDesktop.connect('PROBE_EXTENSION')),null);
  assert.equal((await calls()).length,1);assert.equal((await calls())[0].options.background,true);
  assert.equal(new URL((await calls())[0].url).searchParams.get('action'),'PROBE_EXTENSION');
  const heartbeat=await page.request.post(origin+'/api/extension/jobs',{headers,data:{instance:'test-helper',ready:true,unsave:true,version:'1.8.4',bookmarksSupported:true,bookmarksReady:true,accountSwitching:true,selectedAccounts:true,syncModes:true,instagramCollections:true,instagramSaveLists:true}});assert.equal(heartbeat.ok(),true);
  await page.request.post(origin+'/api/posts/import',{headers,data:{posts:[{url:'https://www.instagram.com/reel/BackgroundTest/',accounts:['@one'],notes:'Disposable test note'}]}});await page.route('https://**/*',route=>route.abort());await page.reload();
  await page.evaluate(async()=>{await window.saveXDesktop.connect('PROBE_EXTENSION');await window.saveXDesktop.connect('WAKE_SYNC');});assert.equal((await calls()).length,1);
  await page.getByRole('button',{name:'Refresh all sources',exact:true}).click();await page.getByRole('button',{name:'Quick scan',exact:true}).click();
  await expect.poll(async()=>(await(await page.request.get(origin+'/api/sync')).json()).job?.status).toBe('queued');assert.equal((await calls()).length,1);
  await page.request.post(origin+'/api/sync/stop',{headers,data:{}});await expect(page.getByRole('button',{name:'Unsave on Instagram',exact:true})).toBeEnabled({timeout:6000});
  await page.getByRole('button',{name:'Unsave on Instagram',exact:true}).click();await page.getByRole('checkbox',{name:'I understand this deletes the save.',exact:true}).check();await page.locator('#unsave-confirm').click();
  await expect.poll(async()=>(await(await page.request.get(origin+'/api/sync')).json()).unsave?.status).toBe('queued');assert.equal((await calls()).length,1);
  // Permission setup is deliberately requested by the user and may open Chrome.
  await page.evaluate(()=>window.saveXDesktop.connect('OPEN_SETUP'));assert.equal((await calls()).length,2);assert.equal((await calls())[1].options.background,false);
 }finally{await desktop.close();await rm(dir,{recursive:true,force:true});}
});
