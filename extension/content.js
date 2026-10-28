(() => {
  'use strict';
  if (document.getElementById('xian-extension-host')) return;
  let channel=crypto.randomUUID();
  const extensionOrigin=chrome.runtime.getURL('').replace(/\/$/,''),panelURL=chrome.runtime.getURL('panel.html');
  let frameReady=false,shadow,fallback,fallbackTitle,fallbackDetail,reconnectButton,healthTimer,retryTimer,waiting,retries=0,failed=false,disconnected=false;
  let host, frame, profile=null, lastHandle='', latest=null, drag=null, pending=[], captureTimer, refreshTimer;
  let panelHeight=720;
  let position={x:Math.max(12,innerWidth-390),y:80,collapsed:false};
  const runtimeAlive=()=>{try{return !!chrome.runtime?.id;}catch{return false;}};
  const ask=async message=>{try{if(!runtimeAlive())throw new Error('Extension context invalidated');const r=await chrome.runtime.sendMessage(message);if(!r?.ok)throw new Error(r?.error||'扩展连接已断开，请刷新 X 页面。');return r.data;}catch(error){if(!runtimeAlive()||/Extension context invalidated/i.test(error.message))disconnect();throw error;}};
  const send=message=>frameReady&&frame?.contentWindow?.postMessage({source:'xian-parent-v1',channel,...message},extensionOrigin);
  const showError=e=>{if(!disconnected)send({type:'error',error:e.message||String(e)});};
  function connectionState(status,title,detail){
    if(!host||!fallback)return;host.dataset.xianStatus=status;fallbackTitle.textContent=title;fallbackDetail.textContent=detail;fallback.hidden=false;if(frame)frame.style.visibility='hidden';
    reconnectButton.textContent=position.collapsed?'𝕏':disconnected?'刷新 X 页面':'重新连接';reconnectButton.title=title+'：'+detail;
  }
  function disconnect(){
    disconnected=true;frameReady=false;waiting=null;clearInterval(healthTimer);clearInterval(refreshTimer);clearTimeout(retryTimer);
    connectionState('updated','扩展连接已断开','扩展可能已重载或更新，请刷新 X 页面以恢复。');
  }
  function syncFrame(){send({type:'collapsed',value:position.collapsed});if(latest)send({type:'state',data:latest});else send({type:'locked'});}
  function probe(){
    if(!frame||waiting||disconnected||failed)return;waiting={id:crypto.randomUUID(),at:Date.now()};
    // The probe contains no account data; it can reach an empty frame after a failed navigation.
    frame.contentWindow?.postMessage({source:'xian-parent-v1',channel,type:'ping',id:waiting.id},'*');
  }
  function recover(){
    if(retryTimer||disconnected)return;frameReady=false;waiting=null;
    if(++retries>3){failed=true;connectionState('failed','洞府暂时无法加载','自动重连未成功，可点击重新连接；数据仍保存在本机。');return;}
    connectionState('reconnecting','正在重新连接洞府','面板加载中，修行数据不会被清空。');
    retryTimer=setTimeout(()=>{retryTimer=null;connectPanel();},1000*2**(retries-1));
  }
  function connectPanel(){
    if(!runtimeAlive()){disconnect();return;}frameReady=false;waiting=null;channel=crypto.randomUUID();
    connectionState(retries?'reconnecting':'loading','正在加载洞府','正在确认面板连接…');
    const old=frame;frame=document.createElement('iframe');const current=frame;
    frame.title='X 修仙 · 创作者洞府';frame.allow='autoplay';frame.setAttribute('scrolling','no');
    Object.assign(frame.style,{position:'absolute',inset:'0',width:'100%',height:'100%',border:'0',display:'block',colorScheme:'dark',background:'#0b1a1b',visibility:'hidden'});
    frame.addEventListener('load',()=>{if(current!==frame||failed||disconnected)return;frameReady=false;waiting=null;connectionState('loading','正在加载洞府','正在确认面板连接…');probe();});
    frame.addEventListener('error',()=>{if(current===frame)recover();});
    frame.src=panelURL+'#'+channel;shadow.prepend(frame);old?.remove();probe();
  }
  function checkPanel(){
    if(!runtimeAlive()){disconnect();return;}if(document.hidden||!host)return;
    if(!host.isConnected&&document.body){document.body.append(host);connectPanel();return;}
    if(failed||retryTimer)return;if(waiting){if(Date.now()-waiting.at>8000)recover();}else probe();
  }
  function startHealth(){clearInterval(healthTimer);if(!disconnected)healthTimer=setInterval(checkPanel,2000);}
  function clamp() {
    if(!host)return;if(fallback){fallback.dataset.collapsed=String(position.collapsed);reconnectButton.textContent=position.collapsed?'𝕏':disconnected?'刷新 X 页面':'重新连接';}const w=position.collapsed?56:Math.min(372,innerWidth-20),h=position.collapsed?56:Math.min(panelHeight,innerHeight-24);
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
    if(!runtimeAlive()){disconnect();return;}
    const observerOrigin=event.origin===location.origin||event.origin===extensionOrigin||event.origin==='null';
    if(observerOrigin&&event.data?.source==='xian-studio-raw-v1'&&profile&&location.pathname.startsWith('/i/account_analytics')){ask({type:'studioRaw',handle:profile.handle,raw:event.data.raw}).then(data=>{latest=data;send({type:'state',data});}).catch(showError);return;}
    if(observerOrigin&&event.data?.source==='xian-studio-v1'&&profile&&location.pathname.startsWith('/i/account_analytics')){ask({type:'studio',handle:profile.handle,rows:event.data.rows}).then(data=>{latest=data;send({type:'state',data});}).catch(showError);return;}
    if(observerOrigin&&event.data?.source==='xian-created-v1'&&profile){const t=event.data.value;if(t?.author===profile.handle&&t.source==='published'){schedule({users:[],tweets:[t]});if(t.reply)globalThis.XianFeedback.replyPlus(t.id);}return;}
    if(observerOrigin&&event.data?.source==='xian-observer-diagnostic-v1'&&profile){ask({type:'diagnostic',handle:profile.handle,value:event.data.value}).catch(()=>{});return;}
    if(observerOrigin && event.data?.source==='xian-observer-v1'){
      if(profile&&event.data.payload&&Array.isArray(event.data.payload.tweets)&&Array.isArray(event.data.payload.users))schedule(event.data.payload);return;
    }
    if(!frame||(event.source!==null&&event.source!==frame.contentWindow)||(![extensionOrigin,'null'].includes(event.origin))||event.data?.source!=='xian-panel-v1'||event.data.channel!==channel)return;
    const m=event.data;
    if(m.type==='ready'){frameReady=true;syncFrame();probe();return;}
    if(m.type==='pong'&&waiting?.id===m.id){
      waiting=null;if(!m.painted){recover();return;}const needsSync=!frameReady;frameReady=true;retries=0;failed=false;clearTimeout(retryTimer);retryTimer=null;
      host.dataset.xianStatus='ready';fallback.hidden=true;frame.style.visibility='visible';if(needsSync)syncFrame();return;
    }
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
    if(m.type==='share'&&profile){
      if(m.handle!==profile.handle){send({type:'shareResult',id:m.id,ok:false,error:'当前账号已变化，请重新生成分享。'});return;}
      ask({type:'sharePanel',handle:profile.handle,text:m.text,image:m.image}).then(()=>send({type:'shareResult',id:m.id,ok:true})).catch(error=>send({type:'shareResult',id:m.id,ok:false,error:error.message}));return;
    }
    if(['settings','reward','snooze','dismissReminder'].includes(m.type)&&profile){const h=profile.handle;ask({type:m.type,handle:h,value:m.value}).then(data=>{if(lastHandle===h){latest=data;send({type:'state',data});if(m.type==='settings'||m.type==='reward')send({type:'notice',text:'已保存到此账号的本地洞府。'});}}).catch(showError);}
  });
  async function mount(){
    if(!document.body)return setTimeout(mount,100);
    if(location.hash==='#xian-background'){await identify();let timer=setInterval(()=>{identify();readReward();readProfile();if(location.pathname.startsWith('/i/account_analytics')){if(profile)ask({type:'diagnostic',handle:profile.handle,value:{operation:'studio-page',shape:[document.readyState,document.title,'primary='+!!document.querySelector('[data-testid=primaryColumn]')],resources:performance.getEntriesByType('resource').map(e=>{try{const u=new URL(e.name);return ['https://x.com','https://api.x.com'].includes(u.origin)&&(/\/i\/api\//.test(u.pathname)||u.origin==='https://api.x.com')&&!/grok|jwt|token|chat|message/i.test(u.pathname)?u.pathname:null;}catch{return null;}}).filter(Boolean).slice(-30)}}).catch(()=>{});}},1500);setTimeout(()=>clearInterval(timer),65000);return;}
    host=document.createElement('div');host.id='xian-extension-host';Object.assign(host.style,{position:'fixed',zIndex:'2147483600',colorScheme:'dark',border:'0',borderRadius:'15px',overflow:'hidden',background:'#0b1a1b',boxShadow:'0 14px 60px #0007'});
    shadow=host.attachShadow({mode:'closed'});
    const style=document.createElement('style');style.textContent=`#connection{position:absolute;inset:0;box-sizing:border-box;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:14px;padding:24px;background:#0b1a1b;border:1px solid #b59c67;border-radius:14px;color:#ede7d4;font:12px/1.6 -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;text-align:center}#connection[hidden]{display:none}.mark{font:38px Georgia,serif;color:#7fdbb7}.detail{color:#a0b0ab;margin:0}button{font:inherit;cursor:pointer;border:1px solid #89754e;border-radius:5px;background:#173e34;color:#e6c587;padding:6px 14px}#connection[data-collapsed="true"]{padding:0;gap:0}#connection[data-collapsed="true"] .copy{display:none}#connection[data-collapsed="true"] button{width:54px;height:54px;border:0;border-radius:13px;padding:0;color:#7fdbb7;font:30px Georgia,serif}`;shadow.append(style);
    fallback=document.createElement('div');fallback.id='connection';fallback.setAttribute('role','status');fallback.dataset.collapsed=String(position.collapsed);
    const mark=document.createElement('span');mark.className='mark copy';mark.textContent='𝕏';fallbackTitle=document.createElement('strong');fallbackTitle.className='copy';fallbackDetail=document.createElement('p');fallbackDetail.className='detail copy';
    reconnectButton=document.createElement('button');reconnectButton.type='button';reconnectButton.setAttribute('aria-label','恢复 X 修仙面板');reconnectButton.onclick=()=>{if(disconnected||!runtimeAlive()){location.reload();return;}retries=0;failed=false;clearTimeout(retryTimer);retryTimer=null;connectPanel();};
    fallback.append(mark,fallbackTitle,fallbackDetail,reconnectButton);shadow.append(fallback);document.body.append(host);clamp();connectPanel();startHealth();
    try{position={...position,...await ask({type:'getPosition'})};}catch(e){showError(e);}clamp();await identify();if(profile&&latest?.settings.autoReward)ask({type:'scanStudio',handle:profile.handle}).catch(()=>{});
    // A light observer catches SPA account changes; a timer ensures midnight resets even on an idle page.
    let debounce;new MutationObserver(()=>{clearTimeout(debounce);debounce=setTimeout(()=>{identify();readReward();},400);}).observe(document.body,{subtree:true,childList:true});
    startRefresh();
  }
  function startRefresh(){
    clearInterval(refreshTimer);if(disconnected)return;
    refreshTimer=setInterval(()=>{identify().then(refresh);readReward();readProfile();if(profile)ask({type:'diagnostic',handle:profile.handle,value:{resources:performance.getEntriesByType('resource').map(e=>{try{const u=new URL(e.name);return u.origin===location.origin&&u.pathname.includes('/i/api/')?u.pathname.split('/').pop():null;}catch{return null;}}).filter(Boolean).slice(-15)}}).catch(()=>{});if(profile&&latest?.settings.autoReward&&(!latest.reward||Date.now()-latest.reward.at>300000))ask({type:'scanStudio',handle:profile.handle}).catch(()=>{});},15000);
  }
  chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&profile&&changes['account:'+profile.handle])refresh();});
  chrome.runtime.onMessage.addListener(m=>{if(m.type==='resize'){panelHeight=Math.max(300,Math.min(720,Math.ceil(Number(m.height)||720)));clamp();return;}
    if(m.type==='attention'){if(position.collapsed){position.collapsed=false;clamp();}return;}
    if(m.type==='toggle'){position.collapsed=!position.collapsed;clamp();ask({type:'position',value:position}).catch(showError);}});
  addEventListener('resize',clamp);
  addEventListener('pagehide',()=>{clearInterval(refreshTimer);clearInterval(healthTimer);clearTimeout(captureTimer);});
  addEventListener('pageshow',e=>{if(e.persisted&&host){waiting=null;startRefresh();startHealth();checkPanel();refresh();}});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&host){waiting=null;checkPanel();refresh();}});mount();
})();
