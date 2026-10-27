// Render the actual panel with demo data; never connect to a signed-in browser.
const {chromium}=require('playwright');
const fs=require('node:fs/promises');
const path=require('node:path');
const http=require('node:http');
const root=path.resolve(__dirname,'..');
const web=path.join(root,'extension');
const images=path.join(root,'docs/images');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.webp':'image/webp'};
let browser,server;
async function main(){
  await fs.mkdir(images,{recursive:true});
  server=http.createServer(async(req,res)=>{
    try{
      const file=path.resolve(web,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
      if(!file.startsWith(web+path.sep)){res.writeHead(403).end();return;}
      const body=await fs.readFile(file);res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});res.end(body);
    }catch{res.writeHead(404).end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  browser=await chromium.launch({channel:'chromium',headless:true});
  const context=await browser.newContext({viewport:{width:420,height:840},deviceScaleFactor:2,timezoneId:'Asia/Shanghai',reducedMotion:'reduce'});
  const base=`http://127.0.0.1:${server.address().port}`;
  await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
  const page=await context.newPage();
  await page.clock.install({time:new Date('2026-10-26T09:00:00Z')});
  await page.clock.pauseAt(new Date('2026-10-26T09:00:01Z'));
  await page.goto(base+'/demo.html');
  const panel=page.frameLocator('iframe');
  await panel.locator('#name').getByText('云游散人',{exact:true}).waitFor();
  await page.evaluate(()=>document.fonts.ready);
  await panel.locator('body').evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].filter(i=>!i.hidden&&i.src).map(i=>i.decode().catch(()=>{})));});
  async function settle(){await page.clock.runFor(300);await page.waitForFunction(()=>{const host=document.querySelector('#demo-host');return host.offsetHeight>300&&host.offsetHeight<816;});}
  await settle();
  await page.locator('#demo-host').screenshot({path:path.join(images,'panel-home.png')});
  await panel.locator('.ascension').screenshot({path:path.join(images,'ascension.png')});
  await panel.locator('footer').screenshot({path:path.join(images,'footer-actions.png')});
  await panel.locator('[data-tab="history"]').click();await settle();
  await panel.locator('#history-list details').first().evaluate(e=>e.open=true);await settle();
  await page.locator('#demo-host').screenshot({path:path.join(images,'panel-history.png')});
  await panel.locator('[data-tab="settings"]').click();await settle();
  await page.locator('#demo-host').screenshot({path:path.join(images,'panel-settings.png')});
  await panel.locator('[data-tab="home"]').click();await settle();
  await page.clock.fastForward(16*60*1000);await settle();
  await panel.locator('#reminder-alert').waitFor({state:'visible'});
  await page.locator('#demo-host').screenshot({path:path.join(images,'panel-reminder.png')});
  await panel.locator('#reminder-dismiss').click();
  await panel.locator('#minimize').click();await page.clock.runFor(100);
  await page.locator('#demo-host').screenshot({path:path.join(images,'floating-logo.png')});
  console.log('Documentation screenshots saved to docs/images (demo profile, fixed date, local requests only).');
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));});
