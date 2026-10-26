const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');const C=require('../extension/core.js');
function harness(){
 const local={},session={},alarms=new Map(),removed=[],listeners={},notifications=[],tabs=[],updateCalls=[];let id=70;
 const store=data=>({get:async key=>key==null?structuredClone(data):{[key]:structuredClone(data[key])},set:async value=>Object.assign(data,structuredClone(value))});
 const listener=name=>({addListener:fn=>listeners[name]=fn});
 const chrome={storage:{local:store(local),session:store(session)},runtime:{id:'test',onMessage:listener('message'),onStartup:listener('startup'),onInstalled:listener('installed'),getURL:path=>'chrome-extension://test/'+path},tabs:{onRemoved:listener('remove'),create:async spec=>{const t={id:++id,...spec};tabs.push(t);return t;},update:async(n,spec)=>{const t=tabs.find(t=>t.id===n);if(t)Object.assign(t,spec);return t;},remove:async n=>removed.push(n),sendMessage:async()=>{}},action:{onClicked:listener('action')},alarms:{get:async n=>alarms.get(n),clear:async n=>alarms.delete(n),create:async(n,s)=>alarms.set(n,s),onAlarm:listener('alarm')},notifications:{clear:async()=>{},create:async(...args)=>notifications.push(args),onButtonClicked:listener('notification')}};
 const context=vm.createContext({chrome,URL,console,Date,Math,Map,Promise,fetch:async()=>({json:async()=>({format:'x-account-overview',publishing:true,version:2})}),XianCore:C,XianUpdates:{checkForUpdates:async force=>{updateCalls.push(force);return{status:'current'};}},importScripts:()=>{}});vm.runInContext(fs.readFileSync(require.resolve('../extension/background.js'),'utf8'),context);
 const msg=(message,tab=1,url='https://x.com/home')=>new Promise(resolve=>listeners.message(message,{tab:{id:tab,url}},resolve));
 const updateMsg=(message,sender)=>new Promise(resolve=>listeners.message(message,sender,resolve));
 return {msg,local,session,alarms,removed,tabs,listeners,notifications,updateMsg,updateCalls};
}
test('worker serializes cross-tab updates and isolates account storage',async()=>{
 const h=harness();assert.equal((await h.msg({type:'identify',profile:{handle:'tester'}},1,'https://example.com')).ok,false);
 await h.msg({type:'identify',profile:{handle:'tester',name:'A'}});await h.msg({type:'identify',profile:{handle:'tester',name:'A'}},2);
 const t=n=>({id:String(n),author:'tester',at:Date.now(),reply:false,views:1});
 await Promise.all([h.msg({type:'ingest',handle:'tester',payload:{tweets:[t(1)]}}),h.msg({type:'ingest',handle:'tester',payload:{tweets:[t(2)]}},2)]);
 assert.equal(Object.keys(h.local['account:tester'].tweets).length,2);
 await h.msg({type:'identify',profile:{handle:'other'}});assert.equal((await h.msg({type:'snapshot',handle:'tester'})).ok,false);assert.equal((await h.msg({type:'snapshot',handle:'other'})).data.profile.handle,'other');
});
test('snoozing survives new profile data and does not send early notifications',async()=>{
 const h=harness();await h.msg({type:'identify',profile:{handle:'tester'}});await h.msg({type:'ingest',handle:'tester',payload:{tweets:[{id:'1',author:'tester',at:Date.now()-2*3600000,reply:false,views:1}]}});
 await h.msg({type:'snooze',handle:'tester'});const when=h.alarms.get('remind:tester').when;await h.msg({type:'ingest',handle:'tester',payload:{users:[{handle:'tester',followers:10}]}});assert.equal(h.alarms.get('remind:tester').when,when);
 await h.listeners.alarm({name:'remind:tester'});assert.equal(h.notifications.length,0);
});
test('background studio sync advances silently and closes only its own verified account tab',async()=>{
 const h=harness();await h.msg({type:'identify',profile:{handle:'tester'}});await h.msg({type:'scanReward',handle:'tester'});await h.msg({type:'scanReward',handle:'tester'});assert.equal(h.tabs.length,1);const id=h.tabs[0].id,url=h.tabs[0].url;
 await h.msg({type:'identify',profile:{handle:'tester'}},id,url);await h.msg({type:'reward',handle:'tester',value:{qualified90d:133300,source:'official-page',precision:100,raw:'133.3K'}},id,url);
 assert.equal(h.local['account:tester'].reward.source,'official-page');assert.equal(h.tabs[0].active,false);assert.equal(h.tabs[0].url.includes('account_analytics'),true);await h.listeners.alarm({name:'scan-timeout:'+id});assert.equal(h.tabs[0].url.includes('/tester#xian-background'),true);await h.listeners.alarm({name:'scan-timeout:'+id});assert.deepEqual(h.removed,[id]);assert.equal(h.local['account:tester'].days[C.day()].rewardTrack.baseline,133300);
});
test('background reward sync cancels on changed login; failed reads do not write zero',async()=>{
 const h=harness();await h.msg({type:'identify',profile:{handle:'tester'}});await h.msg({type:'scanReward',handle:'tester'});const t=h.tabs[0];assert.equal((await h.msg({type:'identify',profile:{handle:'other'}},t.id,t.url)).ok,false);assert.deepEqual(h.removed,[t.id]);assert.equal(h.local['account:tester'].reward,null);assert.equal(h.local['account:other'],undefined);
});
test('due reminder requests persistent high-priority notification; acknowledgement is saved',async()=>{const h=harness();await h.msg({type:'identify',profile:{handle:'tester'}});await h.msg({type:'ingest',handle:'tester',payload:{tweets:[{id:'99',author:'tester',at:Date.now()-2*3600000,reply:false,views:1}]}});await h.listeners.alarm({name:'remind:tester'});const options=h.notifications.at(-1)[1];assert.equal(options.requireInteraction,true);assert.equal(options.priority,2);assert.equal(options.silent,false);const result=await h.msg({type:'dismissReminder',handle:'tester'});assert.equal(result.data.reminder.acknowledgedPost,result.data.lastPost);});

test('one silent sync reads reward, publishing plus impressions, and fresh own followers before reporting completion',async()=>{
 const h=harness();await h.msg({type:'identify',profile:{handle:'tester',followers:100}});const alarm=h.alarms.get('sync:tester');await h.msg({type:'identify',profile:{handle:'tester'}},2);assert.equal(h.alarms.get('sync:tester'),alarm);
 await h.msg({type:'scanStudio',handle:'tester'});const id=h.tabs[0].id;let url=h.tabs[0].url;await h.msg({type:'identify',profile:{handle:'tester'}},id,url);await h.msg({type:'reward',handle:'tester',value:{qualified90d:133300,source:'official-page'}},id,url);
 url=h.tabs[0].url;const stamp=Date.parse(C.day(Date.now(),'UTC')+'T00:00:00Z');const point=(engagement_type,count)=>({timestamp:stamp,engagement_type,count});
 const result=await h.msg({type:'studioRaw',handle:'tester',raw:{hourly_backfill:[point('TweetCreate',5),point('ReplyCreate',77),point('Displayed',5911)]}},id,url);
 assert.equal(result.ok,true);assert.equal(result.data.today.posts,5);assert.equal(result.data.today.replies,77);assert.equal(h.tabs[0].active,false);assert.equal(h.tabs[0].url.includes('/tester#xian-background'),true);
 assert.equal(h.local['account:tester'].sync.running,true);url=h.tabs[0].url;
 await h.msg({type:'ingest',handle:'tester',payload:{users:[{handle:'other',followers:500}]}},id,url);assert.deepEqual(h.removed,[]);
 await h.msg({type:'ingest',handle:'tester',payload:{users:[{handle:'tester',followers:104}]}},id,url);
 assert.deepEqual(h.removed,[id]);const sync=h.local['account:tester'].sync;assert.equal(sync.running,false);assert.equal(sync.complete,true);assert.ok(sync.lastCompletedAt);assert.deepEqual(Object.keys(sync.results),['reward','overview','profile']);
});
test('timed-out stages do not claim that all background data synced',async()=>{
 const h=harness();await h.msg({type:'identify',profile:{handle:'tester'}});await h.msg({type:'scanStudio',handle:'tester'});const id=h.tabs[0].id;
 for(let i=0;i<3;i++)await h.listeners.alarm({name:'scan-timeout:'+id});assert.equal(h.local['account:tester'].sync.complete,false);assert.equal(h.local['account:tester'].sync.lastCompletedAt,null);
});

test('manual sync starts a fresh round immediately without creating duplicate running jobs',async()=>{
 const h=harness();await h.msg({type:'identify',profile:{handle:'tester'}});await h.msg({type:'scanStudio',handle:'tester',manual:true});const id=h.tabs[0].id;await h.msg({type:'scanStudio',handle:'tester',manual:true});assert.equal(h.tabs.length,1);
 for(let i=0;i<3;i++)await h.listeners.alarm({name:'scan-timeout:'+id});await h.msg({type:'scanStudio',handle:'tester'});assert.equal(h.tabs.length,1);await h.msg({type:'scanStudio',handle:'tester',manual:true});assert.equal(h.tabs.length,2);assert.equal(h.tabs[1].active,false);
});

test('update checks accept only the extension panel and do not require an X account',async()=>{
 const h=harness();
 for(const sender of [{id:'test',url:'https://x.com/home',tab:{id:1,url:'https://x.com/home'}},{id:'other',url:'chrome-extension://test/panel.html'},{id:'test',url:'chrome-extension://test/diagnostics.html'}])assert.equal((await h.updateMsg({type:'checkUpdates',force:true},sender)).ok,false);
 assert.equal(h.updateCalls.length,0);
 const result=await h.updateMsg({type:'checkUpdates',force:true},{id:'test',url:'chrome-extension://test/panel.html#channel'});assert.equal(result.ok,true);assert.equal(result.data.status,'current');assert.deepEqual(h.updateCalls,[true]);
});
