'use strict';
importScripts('core.js');
chrome.storage.local.set({runtimeBuild:'20261026-layout-polish-v7'});
const C = XianCore, sessions = new Map();
let queue = Promise.resolve();
const serial = fn => { const task = queue.then(fn); queue = task.catch(()=>{}); return task; };
const key = h => `account:${h}`;
const validSender = sender => sender.tab && /^https:\/\/(x|twitter)\.com\//.test(sender.tab.url || '');
async function read(h) { return (await chrome.storage.local.get(key(h)))[key(h)]; }
async function save(a) { await chrome.storage.local.set({[key(a.profile.handle)]:a}); }
async function schedule(a) {
  const name = `remind:${a.profile.handle}`; await chrome.alarms.clear(name);
  if (!a.settings.reminderEnabled || !a.lastPost) return;
  const when = Math.max(a.lastPost + a.settings.reminderMinutes * 60000,a.snoozeUntil||0);
  if (when <= Date.now() && a.remindedPost === a.lastPost && !a.snoozeUntil) return;
  await chrome.alarms.create(name,{when:Math.max(Date.now()+1000,when)});
}
async function ensureSync(a){const name='sync:'+a.profile.handle;if(a.settings.autoReward){const alarm=await chrome.alarms.get(name);if(!alarm||alarm.periodInMinutes!==5)await chrome.alarms.create(name,{periodInMinutes:5,delayInMinutes:5});}else await chrome.alarms.clear(name);}
const studioURL=(kind,h)=>kind==='reward'?'https://x.com/i/jf/creators/original_content_rewards#xian-background':kind==='overview'?'https://x.com/i/account_analytics/overview#xian-background':`https://x.com/${h}#xian-background`;
async function startStudio(h,manual=false){
  const sync=(await chrome.storage.session.get('rewardSync')).rewardSync||{jobs:{},attempts:{}};
  if(Object.keys(sync.jobs).length||(!manual&&Date.now()-(sync.attempts[h]||0)<300000))return;
  sync.attempts[h]=Date.now();const tab=await chrome.tabs.create({url:studioURL('reward',h),active:false});
  sync.jobs[tab.id]={handle:h,at:Date.now(),kind:'reward',remaining:['overview','profile'],results:{}};await chrome.storage.session.set({rewardSync:sync});const a=await read(h);if(a){a.sync={...a.sync,running:true,startedAt:Date.now()};await save(a);}await chrome.alarms.create(`scan-timeout:${tab.id}`,{when:Date.now()+60000});
}
async function nextStudio(tabId,success=false){
  const sync=(await chrome.storage.session.get('rewardSync')).rewardSync||{jobs:{},attempts:{}};const job=sync.jobs[tabId];if(!job)return;
  await chrome.alarms.clear(`scan-timeout:${tabId}`);job.results||={};job.results[job.kind]={ok:success,at:Date.now()};
  const next=job.remaining?.shift();
  if(next){job.kind=next;await chrome.storage.session.set({rewardSync:sync});await chrome.tabs.update(tabId,{url:studioURL(next,job.handle),active:false});await chrome.alarms.create(`scan-timeout:${tabId}`,{when:Date.now()+60000});}
  else{delete sync.jobs[tabId];await chrome.storage.session.set({rewardSync:sync});const a=await read(job.handle);if(a){const complete=['reward','overview','profile'].every(k=>job.results[k]?.ok);a.sync={running:false,startedAt:job.at,at:Date.now(),complete,results:job.results,lastCompletedAt:complete?Date.now():a.sync?.lastCompletedAt||null};await save(a);}await chrome.tabs.remove(tabId).catch(()=>{});}
}
async function applyCachedStudio(a){
  const key='studioRaw:'+a.profile.handle,cache=(await chrome.storage.session.get(key))[key];if(!cache)return;
  const schema=await fetch(chrome.runtime.getURL('studio-schema.json'),{cache:'no-store'}).then(r=>r.json());
  if(cache.appliedVersion===schema.version)return;
  let changed=false;for(const row of C.parseStudioSchema(cache.raw,schema,cache.at))changed=C.recordStudio(a,row,cache.at)||changed;
  cache.appliedVersion=schema.version;await chrome.storage.session.set({[key]:cache});if(changed)await save(a);return C.parseStudioSchema(cache.raw,schema,cache.at);
}
async function process(message,sender) {
  if (!validSender(sender)) throw new Error('只能在 X 页面使用。');
  const tabId = sender.tab.id;
  if (message.type === 'identify') {
    const profile = C.user(message.profile);
    if (!profile) { sessions.delete(tabId);await chrome.storage.session.set({['identity:'+tabId]:null}); return {locked:true}; }
    const syncState=(await chrome.storage.session.get('rewardSync')).rewardSync||{jobs:{},attempts:{}};
    const job=syncState.jobs[tabId];
    if(job&&job.handle!==profile.handle){delete syncState.jobs[tabId];await chrome.storage.session.set({rewardSync:syncState});await chrome.tabs.remove(tabId);throw new Error('X 登录账号已变化，本次后台核对取消。');}
    sessions.set(tabId, profile.handle);await chrome.storage.session.set({['identity:'+tabId]:profile.handle});
    const a = await read(profile.handle) || C.blank(profile);
    C.ingest(a,{users:[profile]}); await save(a); await schedule(a);await ensureSync(a);
    return C.snapshot(a);
  }
  if (message.type === 'position') {
    const p = message.value || {};
    const position = { x:Math.max(0,Number(p.x)||0), y:Math.max(0,Number(p.y)||0), collapsed:p.collapsed===true };
    await chrome.storage.local.set({position}); return position;
  }
  if (message.type === 'getPosition') return (await chrome.storage.local.get('position')).position || null;
  const h = sessions.get(tabId)||(await chrome.storage.session.get('identity:'+tabId))['identity:'+tabId]; if (!h || h !== C.handle(message.handle)) throw new Error('等待当前账号确认。');
  const a = await read(h); if (!a) throw new Error('账号尚未建立。');
  if (message.type === 'ingest') {
    const p = message.payload || {};
    C.ingest(a,{tweets:Array.isArray(p.tweets)?p.tweets.slice(0,1500):[], users:Array.isArray(p.users)?p.users.slice(0,500):[]});
    await save(a); await schedule(a);const sync=(await chrome.storage.session.get('rewardSync')).rewardSync;const ownProfile=(Array.isArray(p.users)?p.users:[]).map(C.user).some(u=>u?.handle===h&&u.followers!=null&&(!a.profile.id||!u.id||a.profile.id===u.id));if(sync?.jobs[tabId]?.kind==='profile'&&ownProfile)await nextStudio(tabId,true);
  } else if (message.type === 'settings') {
    const previousZone = a.settings.timeZone;
    a.settings = C.settings(message.value);
    if (previousZone !== a.settings.timeZone) throw new Error('首版固定使用原记录时区，避免历史日界线错位。');
    await save(a); await schedule(a);await ensureSync(a);
  } else if (message.type === 'reward') {
    const value=message.value||{};
    const official=value.source==='official-page'&&new URL(sender.url||sender.tab.url).pathname==='/i/jf/creators/original_content_rewards';
    if(!C.recordReward(a,{...value,source:official?'official-page':'manual'}))throw new Error('请填写近 90 天官方曝光进度。');
    await save(a);
    if(official){
      const sync=(await chrome.storage.session.get('rewardSync')).rewardSync||{jobs:{},attempts:{}};
      if(sync.jobs[tabId]?.handle===h&&sync.jobs[tabId].kind==='reward')await nextStudio(tabId,true);
    }
  } else if(message.type==='diagnostic'){
    const v=message.value||{},clean={};for(const k of ['operation','tweets','users','keys','resources','shape'])if(v[k]!==undefined)clean[k]=v[k];const previous=(await chrome.storage.session.get('diagnostic')).diagnostic||{};const operations={...(previous.operations||{})};if(clean.operation)operations[clean.operation]={tweets:clean.tweets,users:clean.users,shape:clean.shape,resources:clean.resources};const report={...previous,...clean,operations:Object.fromEntries(Object.entries(operations).slice(-20))};await chrome.storage.session.set({diagnostic:report});await chrome.storage.local.set({diagnostic:report});
  } else if(message.type==='studioRaw'){
    if(!new URL(sender.url||sender.tab.url).pathname.startsWith('/i/account_analytics'))throw new Error('工作室来源不匹配。');const raw=message.raw;if(!raw||typeof raw!=='object'||JSON.stringify(raw).length>8000000)throw new Error('工作室数据格式异常。');
    await chrome.storage.session.set({['studioRaw:'+h]:{raw,at:Date.now(),appliedVersion:null}});await chrome.storage.local.set({studioSample:{series:raw.current_time_series,hourly:raw.hourly_backfill,relationship:raw.relationship_counts,verified:raw.verified_follower_count}});const rows=await applyCachedStudio(a);const today=rows?.find(row=>row.date===C.day(Date.now(),'UTC'));const sync=(await chrome.storage.session.get('rewardSync')).rewardSync;if(sync?.jobs[tabId]?.kind==='overview'&&today?.posts!=null&&today?.replies!=null&&today?.totalViews!=null)await nextStudio(tabId,true);
  } else if(message.type==='studio'){
    if(!new URL(sender.url||sender.tab.url).pathname.startsWith('/i/account_analytics'))throw new Error('工作室来源不匹配。');
    let changed=false;for(const row of (Array.isArray(message.rows)?message.rows:[]).slice(0,370))changed=C.recordStudio(a,row)||changed;
    if(changed)await save(a);
  } else if(message.type==='studioDone'){
    const sync=(await chrome.storage.session.get('rewardSync')).rewardSync;if(sync?.jobs[tabId]?.kind==='overview')await nextStudio(tabId);
  } else if(message.type==='scanReward'||message.type==='scanStudio'){
    await startStudio(h,message.manual===true);
  } else if (message.type === 'snooze') {
    a.snoozeUntil=Date.now()+15*60000;a.reminderAckFor=null;await save(a);await schedule(a);
  } else if(message.type==='dismissReminder'){a.reminderAckFor=a.lastPost;a.remindedPost=a.lastPost;await save(a);await chrome.notifications.clear(`xian:${h}`);
  } else if (message.type !== 'snapshot') throw new Error('未知操作。');
  if(message.type==='snapshot')await applyCachedStudio(a).catch(()=>{});
  return C.snapshot(a);
}
chrome.runtime.onMessage.addListener((message,sender,sendResponse) => {
  serial(()=>process(message,sender)).then(data=>sendResponse({ok:true,data})).catch(error=>sendResponse({ok:false,error:error.message})); return true;
});
chrome.tabs.onRemoved.addListener(id=>serial(async()=>{sessions.delete(id);await chrome.storage.session.set({['identity:'+id]:null});const sync=(await chrome.storage.session.get('rewardSync')).rewardSync,job=sync?.jobs[id];if(job){delete sync.jobs[id];await chrome.storage.session.set({rewardSync:sync});const a=await read(job.handle);if(a){a.sync={...a.sync,running:false,complete:false,at:Date.now()};await save(a);}}}));
chrome.action.onClicked.addListener(tab=> { if (tab.id && /^https:\/\/(x|twitter)\.com\//.test(tab.url||'')) chrome.tabs.sendMessage(tab.id,{type:'toggle'}).catch(()=>{}); else chrome.tabs.create({url:'https://x.com/home'}); });
chrome.alarms.onAlarm.addListener(alarm=>serial(async()=>{
  if(alarm.name.startsWith('scan-timeout:')){await nextStudio(Number(alarm.name.slice(13)));return;}
  if(alarm.name.startsWith('sync:')){const a=await read(alarm.name.slice(5));if(a?.settings.autoReward)await startStudio(a.profile.handle);return;}
  if (!alarm.name.startsWith('remind:')) return;
  const h=alarm.name.slice(7),a=await read(h); if (!a || !a.settings.reminderEnabled || !a.lastPost) return;
  if (Date.now() < Math.max(a.lastPost+a.settings.reminderMinutes*60000,a.snoozeUntil||0)-1000) return;
  a.remindedPost=a.lastPost;a.snoozeUntil=null; await save(a);
  await chrome.notifications.create(`xian:${h}`,{type:'basic',requireInteraction:true,priority:2,silent:false,iconUrl:'assets/icon128.png',title:'X 修仙 · 该撰写功法了',message:`@${h}，距离上次发推已过 ${Math.floor((Date.now()-a.lastPost)/60000)} 分钟。记录一个新想法吧。`,buttons:[{title:'去撰写'},{title:'稍后 15 分钟'}]});
}));
chrome.notifications.onButtonClicked.addListener((id,index)=>serial(async()=>{if (!id.startsWith('xian:')) return; if(index===0){const a=await read(id.slice(5));if(a){a.reminderAckFor=a.lastPost;await save(a);}await chrome.tabs.create({url:'https://x.com/compose/post'});} else {const a=await read(id.slice(5));if(a){a.snoozeUntil=Date.now()+900000;a.reminderAckFor=null;await save(a);await schedule(a);}}}));
chrome.runtime.onStartup.addListener(()=>serial(async()=> {const all=await chrome.storage.local.get(null);for(const [k,a] of Object.entries(all))if(k.startsWith('account:')) {await schedule(a);await ensureSync(a);}}));
chrome.runtime.onInstalled.addListener(()=>serial(async()=>{const all=await chrome.storage.local.get(null);for(const [k,a]of Object.entries(all))if(k.startsWith('account:')){await schedule(a);await ensureSync(a);if(a.settings.autoReward)await startStudio(a.profile.handle);}}));
// Wakeup recovery also runs after an unpacked-extension reload; all reads stay in inactive tabs.
serial(async()=>{const state=(await chrome.storage.session.get('rewardSync')).rewardSync;
  for(const [id,job]of Object.entries(state?.jobs||{})){
    const tab=await chrome.tabs.get(Number(id)).catch(()=>null);
    if(tab?.url===studioURL(job.kind,job.handle)){await chrome.tabs.update(Number(id),{url:tab.url,active:false});await chrome.alarms.create(`scan-timeout:${id}`,{when:Date.now()+60000});}
    else{delete state.jobs[id];const a=await read(job.handle);if(a){a.sync={...a.sync,running:false,complete:false,at:Date.now()};await save(a);}}
  }
  if(state)await chrome.storage.session.set({rewardSync:state});
  const all=await chrome.storage.local.get(null);for(const [key,a]of Object.entries(all))if(key.startsWith('account:')&&a.settings.autoReward)await startStudio(a.profile.handle);
});
