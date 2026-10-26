// Real extension + mocked X/GitHub responses. Temporary profiles are retained.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const root=path.resolve(__dirname,'..');
let context;
async function main(){
  const profile=await fs.mkdtemp(path.join(os.tmpdir(),'xian-update-ui-'));
  const artifactRoot=path.join(root,'outputs/playwright');await fs.mkdir(artifactRoot,{recursive:true});
  const output=await fs.mkdtemp(path.join(artifactRoot,'updates-'));
  context=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,viewport:{width:1050,height:850},deviceScaleFactor:1,
    args:[`--disable-extensions-except=${path.join(root,'extension')}`,`--load-extension=${path.join(root,'extension')}`]});
  const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
  await worker.evaluate(async()=>{const a=XianCore.blank({handle:'tester',name:'测试道友',followers:1280});a.settings.autoReward=false;a.settings.reminderEnabled=false;await chrome.storage.local.set({'account:tester':a});});
  let mode='available',calls=0;
  const current=JSON.parse(await fs.readFile(path.join(root,'extension/manifest.json'),'utf8')).version;
  const parts=current.split('.').map(Number);parts[parts.length-1]++;const next=parts.join('.');
  await context.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.href==='https://api.github.com/repos/zkilxx/x-xiuxian/releases/latest'){
      calls++;
      if(mode==='error')return route.fulfill({status:503,body:'Unavailable'});
      const version=mode==='available'?next:current;
      return route.fulfill({contentType:'application/json',body:JSON.stringify({tag_name:'v'+version,draft:false,prerelease:false,assets:[{name:`x-xiuxian-v${version}.zip`,state:'uploaded',browser_download_url:`https://github.com/zkilxx/x-xiuxian/releases/download/v${version}/x-xiuxian-v${version}.zip`}]})});
    }
    if(url.origin==='https://x.com')return route.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><html><head><meta charset="utf-8"></head><body><button data-testid="SideNav_AccountSwitcher_Button">测试道友<br>@tester</button><a data-testid="AppTabBar_Profile_Link" href="/tester">Profile</a></body></html>'});
    if(url.protocol==='chrome-extension:')return route.continue();
    return route.abort();
  });
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const frameReady=page.waitForEvent('framenavigated',{predicate:f=>f.url().includes('/panel.html#')});
  await page.goto('https://x.com/home');const panel=await frameReady;
  await panel.locator('#name').getByText('测试道友',{exact:true}).waitFor();
  await panel.locator('#update-status').getByText('发现新版',{exact:true}).waitFor();
  await panel.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  assert.equal(calls,1);assert.equal(await panel.locator('#installed-version').textContent(),'v'+current);
  assert.equal(await panel.locator('#author-github').getAttribute('href'),'https://github.com/zkilxx/x-xiuxian');
  assert.equal(await panel.locator('#update-download').getAttribute('href'),`https://github.com/zkilxx/x-xiuxian/releases/download/v${next}/x-xiuxian-v${next}.zip`);
  const geometry=()=>panel.evaluate(()=>{const main=document.querySelector('main'),bar=document.getElementById('update-bar'),shell=document.getElementById('shell');return{main:main.getBoundingClientRect().height,bar:bar.getBoundingClientRect().height,shell:shell.getBoundingClientRect().height,rootOverflow:document.documentElement.scrollWidth>innerWidth};});
  const available=await geometry();await page.screenshot({path:path.join(output,'available.png')});
  mode='current';await panel.locator('#update-check').click();await panel.locator('#update-status').getByText('已是最新版本',{exact:true}).waitFor();
  assert.equal(await panel.locator('#update-download').isVisible(),false);assert.equal(calls,2);assert.deepEqual(await geometry(),available);
  mode='error';await panel.locator('#update-check').click();await panel.locator('#update-status').getByText('检查失败，可重试',{exact:true}).waitFor();
  assert.equal(calls,3);assert.deepEqual(await geometry(),available);
  mode='available';await panel.locator('#update-check').click();await panel.locator('#update-status').getByText('发现新版',{exact:true}).waitFor();assert.equal(calls,4);
  await panel.locator('#minimize').click();await panel.locator('#orb').waitFor({state:'visible'});
  const orb=await panel.evaluate(()=>({width:innerWidth,height:innerHeight,scroll:document.documentElement.scrollHeight}));assert.deepEqual(orb,{width:56,height:56,scroll:56});
  await panel.locator('#orb').click();await panel.locator('#shell').waitFor({state:'visible'});await panel.locator('#update-status').getByText('发现新版',{exact:true}).waitFor();assert.equal(calls,4);
  await page.setViewportSize({width:390,height:650});
  await panel.waitForFunction(()=>innerHeight<=626&&innerWidth<=372);
  assert.equal((await geometry()).rootOverflow,false);
  const header=await panel.evaluate(()=>({brand:document.querySelector('.brand').getBoundingClientRect().right,tools:document.querySelector('.tools').getBoundingClientRect().left,bar:document.getElementById('update-bar').getBoundingClientRect().bottom,height:innerHeight}));
  assert.ok(header.brand<header.tools);assert.ok(header.bar<=header.height);assert.deepEqual(errors,[]);
  await page.screenshot({path:path.join(output,'compact.png')});
  console.log('PASS: real extension automatic/manual updates, failure, cache, fixed layout, repository link, collapse and compact viewport.');
  console.log('Artifacts:',output);console.log('Retained isolated browser profile:',profile);
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(context)await context.close();});
