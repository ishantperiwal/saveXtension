import { BUSY } from '../public/busy-messages.js';
import { randomBytes } from 'node:crypto';
import { HttpError, text } from './domain.mjs';
export function unsaveQueue(store, sync) {
  store.db.exec(`CREATE TABLE IF NOT EXISTS unsave_requests (
    id TEXT PRIMARY KEY,post_id INTEGER NOT NULL,
    platform TEXT NOT NULL,url TEXT NOT NULL,external_id TEXT NOT NULL,account TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued',phase TEXT NOT NULL DEFAULT 'checking',owner TEXT,deleted INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,message TEXT NOT NULL DEFAULT ''
  )`);
  if(!store.db.prepare('PRAGMA table_info(unsave_requests)').all().some(column=>column.name==='verify_only'))store.db.exec('ALTER TABLE unsave_requests ADD COLUMN verify_only INTEGER NOT NULL DEFAULT 0');
  if(!store.db.prepare('PRAGMA table_info(unsave_requests)').all().some(column=>column.name==='board_id'))store.db.exec('ALTER TABLE unsave_requests ADD COLUMN board_id INTEGER; ALTER TABLE unsave_requests ADD COLUMN board_url TEXT');
  store.db.prepare("UPDATE unsave_requests SET status='uncertain',message='The app restarted. Check the original post before trying again.' WHERE status='running'").run();
  if (sync.status().nativeSocial?.enabled) store.db.prepare("UPDATE unsave_requests SET status='failed',message='The app restarted. Confirm again to unsave.' WHERE status='queued'").run();
  const confirmations = new Map();
  const latest = () => store.db.prepare('SELECT * FROM unsave_requests ORDER BY created_at DESC,rowid DESC LIMIT 1').get() || null;
  const accounts = post => [...new Map(post.accounts.filter(a => (post.platform==='x'?/^@[A-Za-z0-9_]{1,30}$/:/^@[\w.]{1,100}$/).test(a)).map(a=>[a.toLowerCase(),a])).values()];
  function postFor(id) { const post=store.post(id); if (!post || !['x','instagram','pinterest'].includes(post.platform)) throw new HttpError(404,'This save cannot be unsaved.'); return post; }
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
  return {
    status,busy,diagnostics,
    acknowledge(id) { this.status();const job=store.db.prepare('SELECT status FROM unsave_requests WHERE id=?').get(id);if(job&&['queued','running'].includes(job.status))throw new HttpError(409,'Unsave is still running.');store.db.prepare('DELETE FROM unsave_requests WHERE id=?').run(id);return {ok:true}; },
    prepare(id) {
      const post=postFor(id), choices=accounts(post); if (!choices.length) throw new HttpError(409,'Sync this account before unsaving this post.');
      for(const [key,value] of confirmations)if(value.expires<Date.now())confirmations.delete(key);
      const nonce=randomBytes(24).toString('hex'), expires=Date.now()+300000;
      confirmations.set(nonce,{id:post.id,url:post.url,accounts:choices,expires});
      return {nonce,expires,accounts:choices};
    },
    confirm(id,input) {
      const proof=confirmations.get(input.nonce),post=postFor(id);
      if(input.confirmed!==true || !proof || proof.id!==post.id || proof.url!==post.url || proof.expires<Date.now())throw new HttpError(400,'Open the confirmation again before unsaving.');
      const account=proof.accounts.find(a=>a.toLowerCase()===String(input.account).toLowerCase());
      if(!account || !accounts(post).some(a=>a.toLowerCase()===account.toLowerCase()))throw new HttpError(400,'Choose an account that has this post saved.');
      checkIdle();const browser=sync.status().browser;
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
    claim(instance,capable) {
      const job=status();if(!capable || !instance || job?.status!=='queued' || ['queued','running'].includes(sync.status().job?.status))return null;
      store.db.prepare("UPDATE unsave_requests SET status='running',owner=?,updated_at=?,message='Checking the post and account…' WHERE id=? AND status='queued'").run(instance,Date.now(),job.id);return latest();
    },
    act(id,instance) {
      const job=owned(id,instance),post=postFor(job.post_id);
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
