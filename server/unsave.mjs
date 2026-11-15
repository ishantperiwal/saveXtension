import { BUSY } from '../public/busy-messages.js';
import { randomBytes } from 'node:crypto';
import { HttpError, text } from './domain.mjs';
export function unsaveQueue(store, sync, { countChromeBookmarks } = {}) {
  store.db.exec(`CREATE TABLE IF NOT EXISTS unsave_requests (
    id TEXT PRIMARY KEY,post_id INTEGER NOT NULL,
    platform TEXT NOT NULL,url TEXT NOT NULL,external_id TEXT NOT NULL,account TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued',phase TEXT NOT NULL DEFAULT 'checking',owner TEXT,deleted INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,message TEXT NOT NULL DEFAULT ''
  )`);
  if(!store.db.prepare('PRAGMA table_info(unsave_requests)').all().some(column=>column.name==='verify_only'))store.db.exec('ALTER TABLE unsave_requests ADD COLUMN verify_only INTEGER NOT NULL DEFAULT 0');
  if(!store.db.prepare('PRAGMA table_info(unsave_requests)').all().some(column=>column.name==='board_id'))store.db.exec('ALTER TABLE unsave_requests ADD COLUMN board_id INTEGER; ALTER TABLE unsave_requests ADD COLUMN board_url TEXT');
  // A Chrome bookmark: how many copies Chrome's files held across every profile when it was confirmed, and how many the extension found in its own.
  if(!store.db.prepare('PRAGMA table_info(unsave_requests)').all().some(column=>column.name==='chrome_copies'))store.db.exec('ALTER TABLE unsave_requests ADD COLUMN chrome_copies INTEGER; ALTER TABLE unsave_requests ADD COLUMN chrome_found INTEGER');
  store.db.prepare("UPDATE unsave_requests SET status='uncertain',message='The app restarted. Check the original post before trying again.' WHERE status='running'").run();
  if (sync.status().nativeSocial?.enabled) store.db.prepare("UPDATE unsave_requests SET status='failed',message='The app restarted. Confirm again to unsave.' WHERE status='queued'").run();
  const confirmations = new Map();
  const latest = () => store.db.prepare('SELECT * FROM unsave_requests ORDER BY created_at DESC,rowid DESC LIMIT 1').get() || null;
  // Chrome has no accounts here, so a bookmark has one fixed owner.
  const accounts = post => post.platform==='chrome'?['Chrome']:[...new Map(post.accounts.filter(a => (post.platform==='x'?/^@[A-Za-z0-9_]{1,30}$/:/^@[\w.]{1,100}$/).test(a)).map(a=>[a.toLowerCase(),a])).values()];
  function postFor(id) { const post=store.post(id); if (!post || !['x','instagram','pinterest','chrome'].includes(post.platform)) throw new HttpError(404,'This save cannot be unsaved.'); return post; }
  function status() {
    const job=latest();
    if (job && ['queued','running'].includes(job.status) && Date.now()-job.created_at>(job.status==='queued'?90000:180000)) {
      store.db.prepare('UPDATE unsave_requests SET status=?,message=?,updated_at=? WHERE id=?').run(job.phase==='clicked'?'uncertain':'failed',job.phase==='clicked'?'Couldn’t verify the unsave. Check the original post before trying again.':'The request expired. Confirm again to unsave.',Date.now(),job.id);
    }
    return latest();
  }
  const busy = () => ['queued','running'].includes(status()?.status);
  const diagnostics=()=>{try{const value=JSON.parse(store.get('unsave_diagnostics')||'[]');return Array.isArray(value)?value.slice(-10):[];}catch{return[];}};
  function checkIdle() { if (busy()) throw new HttpError(409,BUSY.unsaveAgain.title); sync.giveWay(); if (['queued','running'].includes(sync.status().job?.status)) throw new HttpError(409,BUSY.unsave.title); }
  function owned(id, instance) { const job=status(); if (!job || job.id!==id || job.owner!==instance) throw new HttpError(404,'Unsave request not found for this browser.'); if(job.status!=='running')throw new HttpError(409,'This unsave request has ended.'); return job; }
  // The extension in real Chrome deletes bookmarks; the desktop app's own worker can't reach them.
  const helper=()=>{const current=sync.status();return current.nativeSocial?current.chromeBrowser:current.browser;};
  const helperReady=()=>{
    const chrome=helper();
    if(!chrome?.online)throw new HttpError(409,'Deleting a Chrome bookmark needs the saveXtension extension in Chrome. Connect it in Settings › Chrome extension, then try again.');
    if(!chrome.bookmarkDelete)throw new HttpError(409,'Your Chrome extension needs updating before it can delete bookmarks. Download it again from Settings › Chrome extension and load it in place of the old one.');
    if(!chrome.bookmarksReady)throw new HttpError(409,'Allow bookmarks for the saveXtension extension in Chrome, then try again.');
  };
  return {
    status,busy,diagnostics,
    acknowledge(id) { this.status();const job=store.db.prepare('SELECT status FROM unsave_requests WHERE id=?').get(id);if(job&&['queued','running'].includes(job.status))throw new HttpError(409,'Unsave is still running.');store.db.prepare('DELETE FROM unsave_requests WHERE id=?').run(id);return {ok:true}; },
    // How many copies of a Chrome bookmark Chrome's own files hold, across every profile, or null without them.
    // Unreadable files stop here rather than guess.
    async chromeCopies(id) {
      const post=postFor(id);if(post.platform!=='chrome'||!countChromeBookmarks)return null;
      helperReady();
      try{return await countChromeBookmarks(post.url);}catch{throw new HttpError(409,'Couldn’t read Chrome’s bookmark files to check this bookmark. Nothing was deleted.');}
    },
    prepare(id,copies=null) {
      const post=postFor(id), choices=accounts(post); if (!choices.length) throw new HttpError(409,'Sync this account before unsaving this post.');
      if(post.platform==='chrome')helperReady();else copies=null;
      if(copies!==null&&!(Number.isInteger(copies)&&copies>=0))throw new HttpError(400,'Couldn’t count this bookmark in Chrome.');
      for(const [key,value] of confirmations)if(value.expires<Date.now())confirmations.delete(key);
      const nonce=randomBytes(24).toString('hex'), expires=Date.now()+300000;
      confirmations.set(nonce,{id:post.id,url:post.url,accounts:choices,expires,copies});
      return {nonce,expires,accounts:choices,...(post.platform==='chrome'?{copies,folders:post.folders||[]}:{})};
    },
    confirm(id,input) {
      const proof=confirmations.get(input.nonce),post=postFor(id);
      if(input.confirmed!==true || !proof || proof.id!==post.id || proof.url!==post.url || proof.expires<Date.now())throw new HttpError(400,'Open the confirmation again before unsaving.');
      const account=proof.accounts.find(a=>a.toLowerCase()===String(input.account).toLowerCase());
      if(!account || !accounts(post).some(a=>a.toLowerCase()===account.toLowerCase()))throw new HttpError(400,'Choose an account that has this post saved.');
      checkIdle();
      if(post.platform==='chrome'){
        helperReady();
        confirmations.delete(input.nonce);
        const requestId=randomBytes(12).toString('hex'),now=Date.now();
        store.db.prepare('INSERT INTO unsave_requests(id,post_id,platform,url,external_id,account,created_at,updated_at,chrome_copies) VALUES(?,?,?,?,?,?,?,?,?)').run(requestId,post.id,post.platform,post.url,post.externalId,account,now,now,proof.copies);
        return latest();
      }
      const browser=sync.status().browser;
      const native=sync.status().nativeSocial;
      if(native && !native.accounts.some(item=>item.platform===post.platform&&item.handle.toLowerCase()===account.toLowerCase()&&item.status==='connected'))throw new HttpError(409,`Connect ${account} in saveXtension before unsaving.`);
      if(!browser?.online || !browser.ready || !browser.unsave)throw new HttpError(409,'Open Chrome and reload the browser helper, then try again.');
      confirmations.delete(input.nonce);
      const requestId=randomBytes(12).toString('hex'),now=Date.now();
      // A pin is unsaved from a board, so it needs one it's known to be on.
      const board=post.platform==='pinterest'?(post.collections||[]).find(item=>item.platform==='pinterest'&&item.url):null;
      if(post.platform==='pinterest'&&!board)throw new HttpError(409,'Sync this pin’s board before unsaving it.');
      store.db.prepare('INSERT INTO unsave_requests(id,post_id,platform,url,external_id,account,created_at,updated_at,board_id,board_url) VALUES(?,?,?,?,?,?,?,?,?,?)').run(requestId,post.id,post.platform,post.url,post.externalId,account,now,now,board?.id??null,board?.url??null);
      return latest();
    },
    // The person already unsaved this post on the site, in the post panel, so this only checks that it took.
    // Returns 'busy' if it has to wait its turn, and nothing if the post isn't one this account has saved here.
    expectUnsaved({platform,account,externalId,wait=false}) {
      const row=store.db.prepare('SELECT id FROM posts WHERE platform=? AND external_id=? AND archived=0').get(platform,externalId);
      if(!['x','instagram'].includes(platform)||!row||!accounts(store.post(row.id)).some(a=>a.toLowerCase()===account.toLowerCase()))return null;
      if(busy())return 'busy';
      // What a scan just noticed waits for that scan to finish, instead of cancelling it.
      if(!wait)sync.giveWay();
      if(['queued','running'].includes(sync.status().job?.status))return 'busy';
      const post=store.post(row.id),requestId=randomBytes(12).toString('hex'),now=Date.now();
      store.db.prepare('INSERT INTO unsave_requests(id,post_id,platform,url,external_id,account,created_at,updated_at,verify_only) VALUES(?,?,?,?,?,?,?,?,1)').run(requestId,post.id,post.platform,post.url,post.externalId,account,now,now);
      return latest();
    },
    // Social unsaves go to the app's own worker, Chrome bookmarks to the extension in Chrome.
    claim(instance,capable,kind='social') {
      const job=status();if(!capable || !instance || job?.status!=='queued' || (job.platform==='chrome')!==(kind==='chrome') || ['queued','running'].includes(sync.status().job?.status))return null;
      store.db.prepare("UPDATE unsave_requests SET status='running',owner=?,updated_at=?,message='Checking the post and account…' WHERE id=? AND status='queued'").run(instance,Date.now(),job.id);return latest();
    },
    act(id,instance,input={}) {
      const job=owned(id,instance),post=postFor(job.post_id);
      if(job.platform==='chrome'){
        const found=input.found;
        if(job.phase!=='checking'||post.url!==job.url||!Number.isInteger(found)||found<0||found>1000)throw new HttpError(409,'This delete is no longer available.');
        // None here but some in Chrome's files: they're in another profile, which this extension can't reach.
        if(!found&&job.chrome_copies>0)throw new HttpError(409,'This bookmark is in a different Chrome profile from the one with the saveXtension extension. Delete it there, or add the extension to that profile. Nothing was deleted.');
        store.db.prepare("UPDATE unsave_requests SET phase=?,chrome_found=?,updated_at=?,message='Deleting from Chrome and checking it’s gone…' WHERE id=?").run(found?'clicked':'checking',found,Date.now(),id);
        return {allowed:true};
      }
      if(job.verify_only)throw new HttpError(409,'This request only checks a post. It never unsaves one.');
      if(job.phase!=='checking' || post.url!==job.url || !accounts(post).some(a=>a.toLowerCase()===job.account.toLowerCase()))throw new HttpError(409,'This unsave action is no longer available.');
      store.db.prepare("UPDATE unsave_requests SET phase='clicked',updated_at=?,message='Unsaving and checking the result…' WHERE id=?").run(Date.now(),id);
      return {allowed:true};
    },
    finish(id,instance,input) {
      const job=owned(id,instance);let state=input.status;
      if(state==='succeeded') {
        const evidence=input.observations;
        if(!Array.isArray(evidence)||evidence.length!==2||evidence.some(o=>o?.state!=='unsaved'||o.externalId!==job.external_id||String(o.account).toLowerCase()!==job.account.toLowerCase()||!Number.isFinite(o.checkedAt)||Math.abs(Date.now()-o.checkedAt)>60000)||evidence[1].checkedAt-evidence[0].checkedAt<300)throw new HttpError(400,'Two fresh, account-matched unsaved checks are required.');
        store.db.exec('BEGIN IMMEDIATE');
        try {
          // What someone wrote or organized isn't lost to an unsave made while scrolling, so that save goes to Archive instead.
          const post=store.post(job.post_id),last=post.accounts.every(a=>a.toLowerCase()===job.account.toLowerCase()),keep=job.verify_only&&last&&(post.notes.trim()||post.topicsCurated);
          if(keep)store.db.prepare('UPDATE posts SET archived=1,updated_at=? WHERE id=?').run(new Date().toISOString(),post.id);
          if(job.platform==='chrome'){
            if(!Number.isInteger(job.chrome_found)||input.removed!==job.chrome_found)throw new HttpError(400,'The extension didn’t report what it deleted.');
            // Copies left in another profile would bring it back at the next read, so the card stays until they're gone too.
            const elsewhere=job.chrome_copies>job.chrome_found;
            if(!elsewhere)store.deletePost(job.post_id);
            store.db.prepare("UPDATE unsave_requests SET status='succeeded',deleted=?,message=?,updated_at=? WHERE id=?").run(+!elsewhere,elsewhere?'Deleted from this Chrome profile. It’s still bookmarked in another profile, so it stays in your library.':job.chrome_found?'Deleted from Chrome.':'It was already gone from Chrome. Removed from saveXtension.',Date.now(),id);
            store.db.exec('COMMIT');return latest();
          }
          const result=keep?{deleted:false}:job.platform==='pinterest'?store.pinLeftBoard(job.post_id,job.board_id):store.confirmSourceUnsave(job.post_id,job.account);
          store.db.prepare("UPDATE unsave_requests SET status='succeeded',deleted=?,message=?,updated_at=? WHERE id=?").run(+result.deleted,keep?'Unsaved. Moved to Archive because you added to it.':job.verify_only?'Unsaved, and removed from your library.':'Unsave verified.',Date.now(),id);
          store.db.exec('COMMIT');
        }catch(error){store.db.exec('ROLLBACK');throw error;}
      } else {
        state=job.phase==='clicked'?'uncertain':'failed';
        store.db.prepare('UPDATE unsave_requests SET status=?,message=?,updated_at=? WHERE id=?').run(state,text(input.message,300)||'Couldn’t verify the unsave. Check the original post before trying again.',Date.now(),id);
      }
      const result=latest();
      // Keep bounded, local timings after the UI acknowledges the job, so an
      // account switch can be distinguished from a slow post render next time.
      try{
        const timings={};
        for(const name of ['opening','account','post','checking','unsaving','verifying']){
          const value=input.diagnostics?.timings?.[name];
          if(Number.isFinite(value)&&value>=0&&value<=300000)timings[name]=Math.round(value);
        }
        store.set('unsave_diagnostics',JSON.stringify([...diagnostics(),{id:job.id,platform:job.platform,account:job.account,externalId:job.external_id,status:result.status,finishedAt:Date.now(),elapsedMs:Date.now()-job.created_at,accountSwitched:input.diagnostics?.accountSwitched===true,timings}].slice(-10)));
      }catch{/* A diagnostic write must never change an already verified result. */}
      return result;
    }
  };
}
