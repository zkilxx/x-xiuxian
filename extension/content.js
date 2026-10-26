(() => {
  'use strict';
  if (document.getElementById('xian-extension-host')) return;
  const channel=crypto.randomUUID();
  let frameReady=false;
  let host, frame, profile=null, lastHandle='', latest=null, drag=null, pending=[], captureTimer, refreshTimer;
  let panelHeight=720;
  let position={x:Math.max(12,innerWidth-390),y:80,collapsed:false};
  const ask=async message=>{const r=await chrome.runtime.sendMessage(message);if(!r?.ok)throw new Error(r?.error||'扩展连接已断开，请刷新 X 页面。');return r.data;};
  const send=message=>frameReady&&frame?.contentWindow?.postMessage({source:'xian-parent-v1',channel,...message},chrome.runtime.getURL('').slice(0,-1));
  const showError=e=>send({type:'error',error:e.message||String(e)});
  function clamp() {
    if(!host)return;const w=position.collapsed?56:Math.min(372,innerWidth-20),h=position.collapsed?56:Math.min(panelHeight,innerHeight-24);
    position.x=Math.max(10,Math.min(position.x,innerWidth-w-10));position.y=Math.max(10,Math.min(position.y,innerHeight-h-10));
    Object.assign(host.style,{left:position.x+'px',top:position.y+'px',width:w+'px',height:h+'px'});
    send({type:'collapsed',value:position.collapsed});
  }
  function findProfile() {
    const button=document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"]');
    const link=document.querySelector('[data-testid="AppTabBar_Profile_Link"]');
    if(!button||!link)return null;
    const h=globalThis.XianCore.handle((link.getAttribute('href')||'').split('/')[1]);
    const visible=button.innerText.match(/@([A-Za-z0-9_]{1,15})\b/);
    if(!h||(visible&&h!==globalThis.XianCore.handle(visible[1])))return null;
    const image=button.querySelector('img');
    const lines=button.innerText.split('\n').map(s=>s.trim()).filter(s=>s&&s!=='-'&&!s.startsWith('@'));
    return globalThis.XianCore.user({handle:h,name:image?.alt||lines[0]||h,avatar:image?.src});
  }
  async function identify() {
    const next=findProfile();
    if(!next){ if(lastHandle){lastHandle='';profile=null;latest=null;send({type:'locked'});await ask({type:'identify',profile:null}).catch(showError);} return; }
    if(next.handle===lastHandle)return;
    profile=next;lastHandle=next.handle;pending=[];latest=null;send({type:'locked'});
    try {const data=await ask({type:'identify',profile:next});if(lastHandle!==next.handle)return;latest=data;send({type:'state',data});window.postMessage({source:'xian-request-buffer'},location.origin);readReward();readProfile();flush();}catch(e){showError(e);}
  }
  async function flush(){
    if(!profile||!pending.length)return;
    const items=pending.splice(0,80),h=profile.handle;
    try{const data=await ask({type:'ingest',handle:h,payload:{users:items.flatMap(i=>i.users||[]),tweets:items.flatMap(i=>i.tweets||[]).filter(t=>t.source==='published')}});if(lastHandle===h){latest=data;send({type:'state',data});}}catch(e){showError(e);}
  }
  function schedule(payload){pending.push(payload);clearTimeout(captureTimer);captureTimer=setTimeout(flush,500);}
  let rewardSignature='';
  async function readReward(){
    if(!profile||location.pathname!=='/i/jf/creators/original_content_rewards')return;
    const region=document.querySelector('[data-testid="primaryColumn"]');if(!region)return;
    const labels=[...region.querySelectorAll('p,span')].filter(e=> /(?:过去|過去)\s*90\s*(?:天|日)[\s\S]*(?:已验证|已驗證)[\s\S]*(?:首页|首頁)[\s\S]*曝光|(?:last|past)\s*90\s*days[\s\S]*verified[\s\S]*(?:home|timeline)[\s\S]*impressions/i.test(e.textContent));
    for(const label of labels){
      let block=label;
      for(let i=0;i<5&&block&&block!==region;i++,block=block.parentElement){
        const candidates=[...block.querySelectorAll('p,span')].filter(e=>e.getClientRects().length>0).map(e=>globalThis.XianCore.displayNumber(e.textContent)).filter(Boolean);
        if(candidates.length!==1)continue;
        const h=profile.handle,n=candidates[0],signature=h+':'+n.raw+':'+globalThis.XianCore.day();
        if(signature===rewardSignature)return;
        try{const data=await ask({type:'reward',handle:h,value:{qualified90d:n.value,precision:n.precision,raw:n.raw,source:'official-page'}});if(lastHandle===h){rewardSignature=signature;latest=data;send({type:'state',data});}}catch(e){showError(e);}return;
      }
    }
  }
  let profileSignature='';
  function readProfile(){
    if(!profile||location.pathname.split('/')[1]?.toLowerCase()!==profile.handle)return;
    const candidates=[...document.querySelectorAll('a[href]')].filter(a=>{const href=a.getAttribute('href')||'';return href===`/${profile.handle}/verified_followers`||href===`/${profile.handle}/followers`;});
    for(const a of candidates){const m=a.innerText.match(/([\d,]+)\s*(?:关注者|粉丝|位跟隨者|Followers)/i);if(!m)continue;const n=globalThis.XianCore.number(m[1].replace(/,/g,''));if(n==null||String(n)===profileSignature)continue;profileSignature=String(n);schedule({users:[{...profile,followers:n}],tweets:[]});}
  }
  async function refresh(){
    if(!profile)return;const h=profile.handle;
    try{const data=await ask({type:'snapshot',handle:h});if(lastHandle===h){latest=data;send({type:'state',data});}}catch(e){showError(e);}
  }
  window.addEventListener('message',event=>{
    const observerOrigin=event.origin===location.origin||event.origin===chrome.runtime.getURL('').replace(/\/$/,'')||event.origin==='null';
    if(observerOrigin&&event.data?.source==='xian-studio-raw-v1'&&profile&&location.pathname.startsWith('/i/account_analytics')){ask({type:'studioRaw',handle:profile.handle,raw:event.data.raw}).then(data=>{latest=data;send({type:'state',data});}).catch(showError);return;}
    if(observerOrigin&&event.data?.source==='xian-studio-v1'&&profile&&location.pathname.startsWith('/i/account_analytics')){ask({type:'studio',handle:profile.handle,rows:event.data.rows}).then(data=>{latest=data;send({type:'state',data});}).catch(showError);return;}
    if(observerOrigin&&event.data?.source==='xian-created-v1'&&profile){const t=event.data.value;if(t?.author===profile.handle&&t.source==='published'){schedule({users:[],tweets:[t]});if(t.reply)globalThis.XianFeedback.replyPlus(t.id);}return;}
    if(observerOrigin&&event.data?.source==='xian-observer-diagnostic-v1'&&profile){ask({type:'diagnostic',handle:profile.handle,value:event.data.value}).catch(()=>{});return;}
    if(observerOrigin && event.data?.source==='xian-observer-v1'){
      if(profile&&event.data.payload&&Array.isArray(event.data.payload.tweets)&&Array.isArray(event.data.payload.users))schedule(event.data.payload);return;
    }
    if(!frame||(event.source!==null&&event.source!==frame.contentWindow)||(![chrome.runtime.getURL('').replace(/\/$/,''),'null'].includes(event.origin))||event.data?.source!=='xian-panel-v1'||event.data.channel!==channel)return;
    const m=event.data;
    if(m.type==='ready'){frameReady=true;send({type:'collapsed',value:position.collapsed});if(latest)send({type:'state',data:latest});else send({type:'locked'});return;}
    if(m.type==='drag-start'){drag={x:position.x,y:position.y,screenX:m.screenX,screenY:m.screenY};return;}
    if(m.type==='drag-move'&&drag){position.x=drag.x+m.screenX-drag.screenX;position.y=drag.y+m.screenY-drag.screenY;clamp();return;}
    if(m.type==='drag-end'){drag=null;ask({type:'position',value:position}).catch(showError);return;}
    if(m.type==='move-key'){position.x+=Number(m.dx)||0;position.y+=Number(m.dy)||0;clamp();ask({type:'position',value:position}).catch(showError);return;}
    if(m.type==='resize'){panelHeight=Math.max(300,Math.min(720,Math.ceil(Number(m.height)||720)));clamp();return;}
    if(m.type==='attention'){if(position.collapsed){position.collapsed=false;clamp();}return;}
    if(m.type==='toggle'){position.collapsed=!position.collapsed;clamp();ask({type:'position',value:position}).catch(showError);return;}
    if(m.type==='refresh'){identify().then(refresh);return;}
    if(m.type==='scanReward'&&profile){ask({type:'scanReward',handle:profile.handle}).then(()=>send({type:'notice',text:'正在后台核对 X 原创内容奖励进度…'})).catch(showError);return;}
    if(m.type==='sync'&&profile){ask({type:'scanStudio',handle:profile.handle,manual:true}).then(()=>send({type:'notice',text:'正在后台读取创作者工作室…'})).catch(showError);return;}
    if(['settings','reward','snooze','dismissReminder'].includes(m.type)&&profile){const h=profile.handle;ask({type:m.type,handle:h,value:m.value}).then(data=>{if(lastHandle===h){latest=data;send({type:'state',data});if(m.type==='settings'||m.type==='reward')send({type:'notice',text:'已保存到此账号的本地洞府。'});}}).catch(showError);}
  });
  async function mount(){
    if(!document.body)return setTimeout(mount,100);
    if(location.hash==='#xian-background'){await identify();let timer=setInterval(()=>{identify();readReward();readProfile();if(location.pathname.startsWith('/i/account_analytics')){if(profile)ask({type:'diagnostic',handle:profile.handle,value:{operation:'studio-page',shape:[document.readyState,document.title,'primary='+!!document.querySelector('[data-testid=primaryColumn]')],resources:performance.getEntriesByType('resource').map(e=>{try{const u=new URL(e.name);return ['https://x.com','https://api.x.com'].includes(u.origin)&&(/\/i\/api\//.test(u.pathname)||u.origin==='https://api.x.com')&&!/grok|jwt|token|chat|message/i.test(u.pathname)?u.pathname:null;}catch{return null;}}).filter(Boolean).slice(-30)}}).catch(()=>{});}},1500);setTimeout(()=>clearInterval(timer),65000);return;}
    host=document.createElement('div');host.id='xian-extension-host';Object.assign(host.style,{position:'fixed',zIndex:'2147483600',colorScheme:'dark',border:'0',borderRadius:'15px',overflow:'hidden',boxShadow:'0 14px 60px #0007'});
    const shadow=host.attachShadow({mode:'closed'});frame=document.createElement('iframe');frame.src=chrome.runtime.getURL('panel.html')+'#'+channel;frame.title='X 修仙 · 创作者洞府';frame.allow='autoplay';frame.setAttribute('scrolling','no');frame.addEventListener('load',()=>{frameReady=true;send({type:'collapsed',value:position.collapsed});if(latest)send({type:'state',data:latest});});Object.assign(frame.style,{width:'100%',height:'100%',border:'0',display:'block',colorScheme:'dark'});shadow.append(frame);document.body.append(host);
    try{position={...position,...await ask({type:'getPosition'})};}catch(e){showError(e);}clamp();await identify();if(profile&&latest?.settings.autoReward)ask({type:'scanStudio',handle:profile.handle}).catch(()=>{});
    // A light observer catches SPA account changes; a timer ensures midnight resets even on an idle page.
    let debounce;new MutationObserver(()=>{clearTimeout(debounce);debounce=setTimeout(()=>{identify();readReward();},400);}).observe(document.body,{subtree:true,childList:true});
    refreshTimer=setInterval(()=>{identify().then(refresh);readReward();readProfile();if(profile)ask({type:'diagnostic',handle:profile.handle,value:{resources:performance.getEntriesByType('resource').map(e=>{try{const u=new URL(e.name);return u.origin===location.origin&&u.pathname.includes('/i/api/')?u.pathname.split('/').pop():null;}catch{return null;}}).filter(Boolean).slice(-15)}}).catch(()=>{});if(profile&&latest?.settings.autoReward&&(!latest.reward||Date.now()-latest.reward.at>300000))ask({type:'scanStudio',handle:profile.handle}).catch(()=>{});},15000);
  }
  chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&profile&&changes['account:'+profile.handle])refresh();});
  chrome.runtime.onMessage.addListener(m=>{if(m.type==='resize'){panelHeight=Math.max(300,Math.min(720,Math.ceil(Number(m.height)||720)));clamp();return;}
    if(m.type==='attention'){if(position.collapsed){position.collapsed=false;clamp();}return;}
    if(m.type==='toggle'){position.collapsed=!position.collapsed;clamp();ask({type:'position',value:position}).catch(showError);}});
  addEventListener('resize',clamp);addEventListener('pagehide',()=>{clearInterval(refreshTimer);clearTimeout(captureTimer);});mount();
})();
