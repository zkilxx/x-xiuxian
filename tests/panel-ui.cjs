// Browser plugin not available. Real unpacked extension with mocked X; profiles and evidence are retained.
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const root=path.resolve(__dirname,'..'),extension=process.env.XIAN_TEST_EXTENSION||path.join(root,'extension');let context;
async function main(){
 const profile=await fs.mkdtemp(path.join(os.tmpdir(),'xian-panel-profile-')),output=await fs.mkdtemp(path.join(os.tmpdir(),'xian-panel-qa-'));
 console.log('PANEL_QA_OUTPUT='+output);
 context=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,viewport:{width:1050,height:850},args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
 const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
 await worker.evaluate(async()=>{const a=XianCore.blank({handle:'tester',name:'测试道友',followers:1280});a.settings.autoReward=false;a.settings.reminderEnabled=false;XianCore.ingest(a,{tweets:[{id:'123',author:'tester',at:Date.now(),reply:false,views:3}]});await chrome.storage.local.set({'account:tester':a});});
 await context.route('**/*',r=>{const u=new URL(r.request().url());if(u.protocol==='chrome-extension:')return r.continue();if(u.origin==='https://x.com')return r.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><html><head><meta charset="utf-8"><title>X panel fixture</title></head><body><button data-testid="SideNav_AccountSwitcher_Button">测试道友<br>@tester</button><a data-testid="AppTabBar_Profile_Link" href="/tester">Profile</a></body></html>'});if(u.hostname==='api.github.com')return r.fulfill({contentType:'application/json',body:JSON.stringify({tag_name:'v0.1.19',draft:false,prerelease:false,assets:[]})});return r.abort();});
 const page=await context.newPage(),errors=[];context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));page.on('pageerror',e=>errors.push(e.message));
 await page.goto('https://x.com/home');assert.equal(await page.title(),'X panel fixture');
 const panel=()=>page.frames().find(f=>f.url().includes('/panel.html#'));
 await page.waitForFunction(()=>document.querySelector('#xian-extension-host'));
 async function ready(){await page.waitForFunction(()=>document.querySelector('#xian-extension-host')?.dataset.xianStatus==='ready',{},{timeout:20000});const f=panel();assert.ok(f);await f.locator('#name').getByText('测试道友',{exact:true}).waitFor({state:'attached'});return f;}
 if(process.env.XIAN_BASELINE==='1'){
  for(let i=0;i<100&&!panel();i++)await page.waitForTimeout(100);const f=panel();await f.locator('#name').getByText('测试道友',{exact:true}).waitFor();await f.goto('about:blank');await page.waitForTimeout(2200);
  assert.equal(panel(),undefined);await page.screenshot({path:path.join(output,'baseline-white.png')});console.log('BASELINE REPRODUCED: iframe load on about:blank leaves no panel and no recovery.');return;
 }
 let f=await ready();assert.equal(await f.locator('#posts').textContent(),'1 / 3');
 await f.goto('about:blank');await page.waitForFunction(()=>document.querySelector('#xian-extension-host').dataset.xianStatus!=='ready');await page.screenshot({path:path.join(output,'expanded-fallback.png')});f=await ready();assert.equal(await f.locator('#posts').textContent(),'1 / 3');console.log('PASS empty iframe recovers expanded panel without clearing account data');
 await f.locator('#minimize').click();await f.locator('#orb').waitFor({state:'visible'});await f.goto('about:blank');await page.waitForFunction(()=>document.querySelector('#xian-extension-host').dataset.xianStatus!=='ready');await page.screenshot({path:path.join(output,'orb-fallback.png')});f=await ready();assert.equal(await f.locator('#orb').isVisible(),true);await f.locator('#orb').click();await f.locator('#shell').waitFor({state:'visible'});console.log('PASS empty iframe recovers collapsed icon and preserves collapse state');
 await f.evaluate(()=>document.querySelector('link[href="panel.css"]').remove());f=await readyAfterFailure();assert.equal(await f.locator('#posts').textContent(),'1 / 3');console.log('PASS missing stylesheet triggers reload instead of accepting an unstyled panel');
 async function readyAfterFailure(){await page.waitForFunction(()=>document.querySelector('#xian-extension-host').dataset.xianStatus!=='ready',{},{timeout:6000});return ready();}
 await page.evaluate(()=>document.querySelector('#xian-extension-host').remove());f=await ready();assert.equal(await page.locator('#xian-extension-host').count(),1);console.log('PASS removed host is restored once');
 await page.evaluate(()=>{dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));});
 await f.goto('about:blank');f=await ready();console.log('PASS page-cache resume restarts liveness checks');
 // Force consecutive handshake failures without changing production code or network data.
 await context.addInitScript(()=>{if(location.pathname==='/panel.html')addEventListener('message',e=>{if(e.data?.type==='ping'&&sessionStorage.getItem('qa-panel-failure')==='1'){e.stopImmediatePropagation();parent.postMessage({source:'xian-panel-v1',channel:e.data.channel,type:'pong',id:e.data.id,painted:false},'*');}},true);});
 await f.evaluate(()=>sessionStorage.setItem('qa-panel-failure','1'));await f.goto('about:blank');
 await page.waitForFunction(()=>document.querySelector('#xian-extension-host').dataset.xianStatus==='failed',{},{timeout:30000});
 await page.screenshot({path:path.join(output,'retry-limit.png')});
 const attempts=await page.evaluate(()=>document.querySelector('#xian-extension-host').dataset.xianStatus);await page.waitForTimeout(2500);assert.equal(await page.evaluate(()=>document.querySelector('#xian-extension-host').dataset.xianStatus),attempts);
 await panel().evaluate(()=>sessionStorage.removeItem('qa-panel-failure'));await clickRecovery();f=await ready();assert.equal(await f.locator('#posts').textContent(),'1 / 3');console.log('PASS bounded retries stop on persistent failure; native retry button restores panel and data');
 async function clickRecovery(){
  const client=await context.newCDPSession(page),tree=await client.send('DOM.getDocument',{depth:-1,pierce:true});
  function find(n){if(n.nodeName==='BUTTON'&&n.attributes?.includes('恢复 X 修仙面板'))return n;for(const child of [...n.children||[],...n.shadowRoots||[]]){const result=find(child);if(result)return result;}}
  const button=find(tree.root);assert.ok(button);const{quads}=await client.send('DOM.getContentQuads',{nodeId:button.nodeId});const q=quads[0];await page.mouse.click((q[0]+q[2]+q[4]+q[6])/4,(q[1]+q[3]+q[5]+q[7])/4);await client.detach();
 }
 await page.setViewportSize({width:390,height:650});await f.waitForFunction(()=>innerWidth<=372&&innerHeight<=626);assert.equal(await f.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:path.join(output,'recovered-compact.png')});
 // Simulate a dead extension port in the real content-script world; a user refresh must recover.
 const client=await context.newCDPSession(page),worlds=[];client.on('Runtime.executionContextCreated',e=>worlds.push(e.context));await client.send('Runtime.enable');
 const world=worlds.find(w=>w.auxData?.isDefault===false&&w.origin.startsWith('chrome-extension://'));assert.ok(world);
 const injected=await client.send('Runtime.evaluate',{contextId:world.id,expression:`chrome.runtime.sendMessage=()=>Promise.reject(new Error('Extension context invalidated'));document.dispatchEvent(new Event('visibilitychange'));`,returnByValue:true});assert.equal(injected.exceptionDetails,undefined);await client.detach();
 await page.waitForFunction(()=>document.querySelector('#xian-extension-host')?.dataset.xianStatus==='updated',{},{timeout:10000});await page.screenshot({path:path.join(output,'extension-updated.png')});
 await clickRecovery();f=await ready();assert.equal(await f.locator('#posts').textContent(),'1 / 3');console.log('PASS simulated dead runtime port: native refresh button reconnects and retains data');
 // Actual runtime.reload unloads command-line unpacked extensions in this headless build.
 // Verify the stale page guidance separately, without claiming that headless re-registration is a desktop reload test.
 await worker.evaluate(()=>setTimeout(()=>chrome.runtime.reload(),0)).catch(()=>{});
 await page.waitForFunction(()=>document.querySelector('#xian-extension-host')?.dataset.xianStatus==='updated',{},{timeout:15000});assert.deepEqual(errors.filter(e=>!/Extension context invalidated|context.*destroyed/i.test(e)),[]);console.log('PASS actual extension unload shows refresh guidance; no unexpected page errors');
 console.log('PASS panel lifecycle regression; no real X account or publishing used.');console.log('Retained profile:',profile);
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(context)await context.close();});
