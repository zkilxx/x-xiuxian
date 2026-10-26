const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const source=fs.readFileSync(require.resolve('../extension/updates.js'),'utf8');
const endpoint='https://api.github.com/repos/zkilxx/x-xiuxian/releases/latest';
function release(version='0.1.10'){
  return{tag_name:'v'+version,draft:false,prerelease:false,assets:[{name:`x-xiuxian-v${version}.zip`,state:'uploaded',browser_download_url:`https://github.com/zkilxx/x-xiuxian/releases/download/v${version}/x-xiuxian-v${version}.zip`}]};
}
function harness(){
  const storage={},calls=[];let now=1800000000000,version='0.1.9',failure=false,value=release(),block=null,writeFailure=false;
  class Clock extends Date{static now(){return now;}}
  const chrome={runtime:{getManifest:()=>({version})},storage:{local:{get:async key=>({[key]:storage[key]}),set:async value=>{if(writeFailure)throw new Error('Storage unavailable');Object.assign(storage,structuredClone(value));}}}};
  const fetch=async(url,options)=>{calls.push({url,options});if(block)await block;if(failure)throw new Error('Offline');return{ok:true,json:async()=>structuredClone(value)};};
  const context=vm.createContext({chrome,URL,Date:Clock,AbortSignal,fetch});vm.runInContext(source,context);
  return{api:context.XianUpdates,calls,storage,setNow:v=>now=v,advance:v=>now+=v,setVersion:v=>version=v,setFailure:v=>failure=v,setRelease:v=>value=v,setBlock:v=>block=v,setWriteFailure:v=>writeFailure=v};
}
test('update versions compare numerically, reject preview tags and handle four components',()=>{
  const {api}=harness();
  assert.equal(api.isNewerVersion('v0.1.10','0.1.9'),true);assert.equal(api.isNewerVersion('1.0','0.99.99'),true);
  assert.equal(api.isNewerVersion('0.1.9.1','0.1.9'),true);assert.equal(api.isNewerVersion('0.1.9','0.1.9.0'),false);
  for(const v of ['0.1.8','v0.1.10-beta.1','latest','1.2.3.4.5','https://evil.test'])assert.equal(api.isNewerVersion(v,'0.1.9'),false);
});
test('public update request omits credentials and returns only this repository package',async()=>{
  const h=harness(),r=await h.api.checkForUpdates();assert.equal(r.status,'available');assert.equal(r.currentVersion,'0.1.9');assert.equal(r.latestVersion,'0.1.10');
  assert.equal(r.downloadURL,release().assets[0].browser_download_url);assert.equal(h.calls[0].url,endpoint);
  assert.equal(h.calls[0].options.credentials,'omit');assert.equal(h.calls[0].options.referrerPolicy,'no-referrer');assert.equal(h.calls[0].options.redirect,'error');assert.equal(h.calls[0].options.body,undefined);
  assert.ok(h.calls[0].options.signal);assert.equal(Object.keys(h.storage).join(','),'xianUpdateCheck');
});
test('six-hour cache rechecks installed version and manual checking bypasses it',async()=>{
  const h=harness();await h.api.checkForUpdates();h.advance(5*3600000);await h.api.checkForUpdates();assert.equal(h.calls.length,1);
  h.setVersion('0.1.10');assert.equal((await h.api.checkForUpdates()).status,'current');assert.equal(h.calls.length,1);
  await h.api.checkForUpdates(true);assert.equal(h.calls.length,2);h.advance(6*3600000);await h.api.checkForUpdates();assert.equal(h.calls.length,3);
});
test('simultaneous panel checks share one pending network request',async()=>{
  const h=harness();let unblock;h.setBlock(new Promise(resolve=>unblock=resolve));const a=h.api.checkForUpdates(),b=h.api.checkForUpdates(true);assert.equal(a,b);unblock();await Promise.all([a,b]);assert.equal(h.calls.length,1);
});
test('offline checks never claim latest and retry backoff is fifteen minutes',async()=>{
  const h=harness();h.setFailure(true);const r=await h.api.checkForUpdates();assert.equal(r.status,'error');assert.equal(r.failed,true);assert.equal(r.checkedAt,null);
  h.advance(14*60000);await h.api.checkForUpdates();assert.equal(h.calls.length,1);
  h.advance(60000);await h.api.checkForUpdates();assert.equal(h.calls.length,2);
  await h.api.checkForUpdates(true);assert.equal(h.calls.length,3);
});
test('failed refresh retains a known newer release with its previous successful timestamp',async()=>{
  const h=harness(),good=await h.api.checkForUpdates();h.advance(7*3600000);h.setFailure(true);const r=await h.api.checkForUpdates();
  assert.equal(r.status,'available');assert.equal(r.failed,true);assert.equal(r.checkedAt,good.checkedAt);assert.equal(r.downloadURL,good.downloadURL);
});
test('draft or prerelease metadata is rejected and untrusted package links fall back to release page',async()=>{
  for(const key of ['draft','prerelease']){const h=harness(),v=release();v[key]=true;h.setRelease(v);assert.equal((await h.api.checkForUpdates()).status,'error');}
  for(const url of ['https://evil.test/update.zip','https://github.com/other/repo/releases/download/v0.1.10/x-xiuxian-v0.1.10.zip','https://github.com/zkilxx/x-xiuxian/releases/download/v0.1.10/x-xiuxian-v0.1.10.zip?redirect=bad','javascript:alert(1)']){
    const h=harness(),v=release();v.assets[0].browser_download_url=url;h.setRelease(v);const r=await h.api.checkForUpdates();assert.equal(r.status,'available');assert.equal(r.downloadURL,'');assert.equal(r.releaseURL,'https://github.com/zkilxx/x-xiuxian/releases/tag/v0.1.10');
  }
});
test('missing ZIP keeps a valid release link; storage failure does not suppress a successful check',async()=>{
  const h=harness(),v=release();v.assets=[];h.setRelease(v);h.setWriteFailure(true);const r=await h.api.checkForUpdates();assert.equal(r.status,'available');assert.equal(r.failed,false);assert.equal(r.downloadURL,'');assert.ok(r.releaseURL.endsWith('/v0.1.10'));
});
