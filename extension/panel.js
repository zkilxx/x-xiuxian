(() => {
  'use strict';
  const $=id=>document.getElementById(id),C=XianCore;
  const fmt=n=>n==null?'—':new Intl.NumberFormat('en-US').format(n);
  let state=null,noticeTimer,tab='home',parentOrigin=null,sharing=false,shareTimer,shareId;const channel=location.hash.slice(1);
  const tell=message=>parent.postMessage({source:'xian-panel-v1',channel,...message},parentOrigin||'*');
  function select(next){tab=next;document.querySelectorAll('.view').forEach(e=>e.hidden=e.id!==next);document.querySelectorAll('nav button').forEach(e=>{e.classList.toggle('selected',e.dataset.tab===next);e.setAttribute('aria-pressed',e.dataset.tab===next?'true':'false');});$('scroll').scrollTop=0;if(next==='history')history();fitPanel();}
  let fitFrame=0,lastFitHeight=0;
  function fitPanel(){cancelAnimationFrame(fitFrame);fitFrame=requestAnimationFrame(()=>{const shell=$('shell'),main=$('scroll'),view=$(tab);if(!shell||!main||!view||shell.hidden)return;const style=getComputedStyle(main);const content=view.getBoundingClientRect().height+parseFloat(style.paddingTop)+parseFloat(style.paddingBottom);const fixed=shell.getBoundingClientRect().height-main.getBoundingClientRect().height;const height=Math.ceil(content+fixed);if(Math.abs(height-lastFitHeight)>1){lastFitHeight=height;tell({type:'resize',height});}});}
  const text=(id,value)=>{const el=$(id);if(el)el.textContent=value;};
  function rewardDelta(id,track,date){
    const delta=Number.isFinite(track?.delta)?track.delta:null;
    text(id,delta==null?'—':`${track.approximate?'约 ':''}${delta>=0?'+':''}${fmt(delta)}`);
    $(id).classList.toggle('negative',delta<0);$(id).classList.toggle('unknown',delta==null);
    $(id).title=delta==null?`${date||''} 没有飞升进度记录`.trim():track.partial?`${date} 首次观测后净增，非完整全天`:`${date} 最新进度减前一天末次进度（滚动净变化）`;
  }
  let checkingUpdate=false,updateRequested=false;
  const installedVersion=globalThis.chrome?.runtime?.getManifest?.().version||'0.1.19';
  text('installed-version','v'+installedVersion);
  async function checkUpdates(force=false){
    if(checkingUpdate)return;
    if(!globalThis.chrome?.runtime?.id){text('update-status','安装插件后检测');$('update-check').disabled=true;return;}
    checkingUpdate=true;updateRequested=true;$('update-check').disabled=true;text('update-status','正在检查…');
    try{
      const response=await chrome.runtime.sendMessage({type:'checkUpdates',force});if(!response?.ok)throw new Error();
      const r=response.data,available=r.status==='available';
      text('installed-version','v'+r.currentVersion);$('update-download').hidden=!available;
      if(available){$('update-download').href=r.downloadURL||r.releaseURL;text('update-download','v'+r.latestVersion+' ↗');$('update-download').title='下载新版，解压后替换原插件文件并重新加载';}
      text('update-status',r.failed?(available?'上次发现新版':'检查失败，可重试'):available?'发现新版':r.status==='current'?'已是最新版本':'检查失败，可重试');
      $('update-bar').classList.toggle('has-update',available);
      $('update-check').title=r.checkedAt?'上次成功检查：'+new Date(r.checkedAt).toLocaleString('zh-CN'):'检查 GitHub 最新正式版本';
    }catch{text('update-status','检查失败，可重试');}
    finally{checkingUpdate=false;$('update-check').disabled=false;}
  }
  const setProgress=(id,value,max)=>{const p=$(id);p.max=max;p.value=Math.min(value||0,max);};
  function sharingState(value){sharing=value;$('share').disabled=value||!state;$('share').textContent=value?'分享中':'↗ 分享';}
  async function share(){
    if(sharing||!state)return;
    if(!globalThis.chrome?.runtime?.id)return notice('安装插件后可将文字和面板图片放入 X 编辑栏。');
    clearTimeout(noticeTimer);$('notice').hidden=true;$('notice').textContent='';shareId=crypto.randomUUID();sharingState(true);select('home');
    try{
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      const snapshot=structuredClone(state),summary=XianShare.text(snapshot);
      const avatar=chrome.runtime.sendMessage({type:'shareAvatar',handle:snapshot.profile.handle}).then(r=>r?.ok?r.data:'').catch(()=>'');
      const image=await XianShare.capture($('shell'),avatar);image.filename=`X修仙-${snapshot.profile.handle}-${snapshot.today.date}.png`;
      if(state?.profile.handle!==snapshot.profile.handle)throw new Error('当前账号已变化，请重新生成分享。');
      shareTimer=setTimeout(()=>{sharingState(false);notice('分享等待超时，请检查新标签页，避免重复添加。',true);},90000);
      tell({type:'share',id:shareId,handle:snapshot.profile.handle,text:summary,image});
    }catch(error){sharingState(false);notice('分享失败：'+error.message,true);}
  }
  function render(data){
    state=data;$('locked').hidden=true;
    $('share').disabled=sharing;
    const {profile:p,settings:s,today:t}=data;
    text('name',p.name);text('handle','@'+p.handle);const studioDay=data.taskTimeZone==='UTC';
    text('day',(data.taskDate||t.date)?.slice(5).replace('-','月')+'日'+(studioDay?' · UTC':''));
    $('day').title=studioDay?'工作室按 UTC 日期统计，北京时间每天 08:00 换日':`按 ${s.timeZone} 日期统计`;
    text('realm',t.posts>=s.posts&&t.replies>=s.replies?'今日功成':t.posts+t.replies>0?'炼气 · 渐入佳境':'炼气 · 初入仙途');
    if(p.avatar&&/^https:\/\/pbs\.twimg\.com\/profile_images\//.test(p.avatar)){$('avatar').src=p.avatar;$('avatar').hidden=false;$('avatar-fallback').hidden=true;}else{$('avatar').hidden=true;$('avatar-fallback').hidden=false;}
    text('posts',`${t.posts} / ${s.posts}`);text('replies',`${t.replies} / ${s.replies}`);
    const taskKinds=['posts','replies'].filter(k=>t.taskSync?.[k]);
    const taskHint=taskKinds.length===2?(t.taskSync.posts.held||t.taskSync.replies.held?'后台对账中 · 保留新发布':'工作室发布统计 · 已校正'):taskKinds.length===1?(taskKinds[0]==='posts'?'发推已对账 · 回推待确认':'回推已对账 · 发推待确认'):'本地记数 · 等待工作室对账';
    text('task-source',taskHint+(studioDay?' · 北京时间 08:00 换日':''));
    setProgress('posts-progress',t.posts,s.posts);setProgress('replies-progress',t.replies,s.replies);
    text('total-views',fmt((data.studioToday||t.studio)?.totalViews));
    text('followers',fmt(p.followers));text('follower-delta',t.followerDelta==null?'—':(t.followerDelta>=0?'+':'')+fmt(t.followerDelta));
    text('followers-hint',t.followerStart==null?'后台静默读取粉丝总数':`净增基准：${new Date(t.followerStartAt||t.firstSeenAt).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',timeZone:s.timeZone})} 首次观测 · 非全天新增`);
    const r=data.reward;
    setProgress('reward-progress',r?.qualified90d||0,500000);
    text('qualified90',`${r?.precision>1?'约 ':''}${r?.qualified90d==null?'—':(r.qualified90d/10000).toFixed(2)+'W'} / 50W 曝光`);
    const yesterday=new Date(Date.parse(t.date+'T00:00:00Z')-86400000).toISOString().slice(0,10);
    rewardDelta('reward-yesterday',data.history?.find(row=>row.date===yesterday)?.rewardTrack,yesterday);
    rewardDelta('reward-today',t.rewardTrack,t.date);
    text('reward-percent',r?.qualified90d!=null?(Math.min(100,r.qualified90d/500000*100).toFixed(1)+'%'):'待读取');
    const sync=data.sync;const syncedAt=sync?.lastCompletedAt;
    text('synced',!s.autoReward?'后台同步已关闭':sync?.running?'后台同步中…':syncedAt?'后台已同步 '+new Date(syncedAt).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',timeZone:s.timeZone})+(sync.complete?'':' · 部分待读取'):sync?.complete===false?'部分数据待读取':'每 5 分钟后台同步');
    $('status-dot').classList.toggle('active',!!syncedAt&&s.autoReward);
    const form=$('settings-form');
    if(!form.contains(document.activeElement))for(const [key,value]of Object.entries(s)){const input=form.elements.namedItem(key);if(input){if(input.type==='checkbox')input.checked=value;else input.value=value;}}
    text('timezone','修行、曝光：UTC（北京时间 08:00 换日）；粉丝、飞升日志：'+s.timeZone);
    for(const id of ['sync','reward-edit','snooze','scan-reward'])if($(id))$(id).disabled=false;
    $('snooze').disabled=!data.lastPost||!s.reminderEnabled;if(tab==='history')history();timer();fitPanel();
  }
  let audio=null,playedKey=null,attentionKey=null;
  function ring(key){if(!audio||audio.state!=='running'||playedKey===key)return;playedKey=key;for(let i=0;i<3;i++){const o=audio.createOscillator(),g=audio.createGain(),at=audio.currentTime+i*.28;o.type='sine';o.frequency.value=i===1?1174:880;g.gain.setValueAtTime(0,at);g.gain.linearRampToValueAtTime(.07,at+.025);g.gain.exponentialRampToValueAtTime(.001,at+.2);o.connect(g);g.connect(audio.destination);o.start(at);o.stop(at+.23);}}
  function armAudio(){try{audio ||= new (window.AudioContext||window.webkitAudioContext)();audio.resume().then(()=>{if(!$('reminder-alert').hidden)ring(attentionKey);}).catch(()=>{});}catch{}}
  document.addEventListener('pointerdown',armAudio,{once:true});document.addEventListener('keydown',armAudio,{once:true});
  function reminderVisible(due,key,minutes){$('reminder-alert').hidden=!due;$('shell').classList.toggle('urgent',due);$('orb').classList.toggle('urgent',due);if(due){text('reminder-message',`距离上次发推已过 ${minutes} 分钟，写下一个新想法吧。`);if(attentionKey!==key){attentionKey=key;tell({type:'attention'});}ring(key);}}
  function timer(){
    if(!state?.lastPost){reminderVisible(false,null,0);text('last-post','上次发推 · 待读取');text('countdown','—:—');text('countdown-label','下次发推成功后开始计时');return;}
    const mins=Math.max(0,Math.floor((Date.now()-state.lastPost)/60000));
    text('last-post','上次发推 · '+(mins<60?mins+' 分钟前':mins<1440?Math.floor(mins/60)+' 小时前':Math.floor(mins/1440)+' 天前'));
    if(!state.settings.reminderEnabled){reminderVisible(false,null,0);text('countdown','已关闭');text('countdown-label','可在功法中开启');return;}
    const deadline=Math.max(state.lastPost+state.settings.reminderMinutes*60000,state.reminder?.snoozeUntil||0);const remain=Math.ceil((deadline-Date.now())/1000);
    reminderVisible(remain<=0&&state.reminder?.acknowledgedPost!==state.lastPost,String(state.lastPost)+':'+deadline,mins);
    text('countdown',remain<=0?(state.reminder?.acknowledgedPost===state.lastPost?'已提醒':'该动笔了'):`${String(Math.floor(remain/60)).padStart(2,'0')}:${String(remain%60).padStart(2,'0')}`);
    text('countdown-label',remain<=0?'把今日所得写下来':'距下次修行提醒');
  }
  function history(){
    const list=$('history-list');list.replaceChildren();
    const date=$('history-date').value;const entries=(state?.history||[]).filter(r=>!date||r.date===date);
    if(!entries.length){const p=document.createElement('p');p.className='hint';p.textContent='这一天尚未留下修行记录。';list.append(p);return;}
    for(const r of entries){const row=document.createElement('article');row.className='history-entry';const title=document.createElement('strong');title.textContent=r.date;row.append(title);const p=document.createElement('p');p.textContent=`发推 ${r.posts??0} · 回推 ${r.replies??0} · 净增 ${r.followerDelta==null?'—':(r.followerDelta>=0?'+':'')+r.followerDelta}`;row.append(p);if(r.rewardTrack){const rp=document.createElement('p');rp.textContent=`飞升进度 ${fmt(r.rewardTrack.baseline)} → ${fmt(r.rewardTrack.latest)} · ${r.rewardTrack.partial?'首次观测为基准':'前日末值为基准'}`;row.append(rp);const detail=document.createElement('details');const summary=document.createElement('summary');summary.textContent='查看进度变动记录';detail.append(summary);for(const sample of r.rewardTrack.samples){const line=document.createElement('p');line.textContent=new Date(sample.at).toLocaleTimeString('zh-CN',{timeZone:state.settings.timeZone})+' · '+sample.raw+' · '+(sample.source==='official-page'?'官方页面':'手动校准');detail.append(line);}row.append(detail);}if(r.taskCorrections?.length){const details=document.createElement('details');const summary=document.createElement('summary');summary.textContent='查看修行校正记录';details.append(summary);for(const c of r.taskCorrections){const line=document.createElement('p');line.textContent=(c.kind==='posts'?'发推':'回推')+' '+c.before+' → '+c.after+' · '+new Date(c.at).toLocaleTimeString('zh-CN',{timeZone:state.settings.timeZone});details.append(line);}row.append(details);}const sub=document.createElement('small');sub.textContent=`总曝光 ${fmt(r.studio?.totalViews)}${r.rewardTrack?' · 飞升净增 '+(r.rewardTrack.approximate?'约 ':'')+(r.rewardTrack.delta>=0?'+':'')+fmt(r.rewardTrack.delta):''} · 已读快照`;row.append(sub);list.append(row);}
  }
  function notice(message,error=false){clearTimeout(noticeTimer);$('notice').hidden=false;$('notice').textContent=message;$('notice').style.background=error?'#613f30':'#23493e';noticeTimer=setTimeout(()=>{$('notice').hidden=true;},8000);}
  addEventListener('message',e=>{
    if((e.source!==null&&e.source!==parent)||e.data?.source!=='xian-parent-v1'||(channel?e.data.channel!==channel:false)||!(/^https:\/\/(x|twitter)\.com$/.test(e.origin)||/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(e.origin)||(channel&&(e.origin==='null'||e.origin===location.origin))))return;
    parentOrigin=e.origin==='null'?null:e.origin;const m=e.data;
    if(m.type==='state')render(m.data);
    else if(m.type==='collapsed'){const wasHidden=$('shell').hidden;$('shell').hidden=m.value;$('orb').hidden=!m.value;if(wasHidden&&!m.value){lastFitHeight=0;fitPanel();checkUpdates();}else if(!m.value&&!updateRequested)checkUpdates();}
    else if(m.type==='locked'){state=null;text('name','静候道友');text('handle','等待 X 登录账号');$('locked').hidden=false;$('avatar').hidden=true;$('avatar').removeAttribute('src');$('avatar-fallback').hidden=false;for(const id of ['total-views','followers','follower-delta'])text(id,'—');text('posts','—');text('replies','—');setProgress('posts-progress',0,3);setProgress('replies-progress',0,20);text('daily-qualified','待读取');text('qualified90','— / 50W 曝光');rewardDelta('reward-yesterday',null);rewardDelta('reward-today',null);text('reward-percent','待读取');$('status-dot').classList.remove('active');text('verified-followers','— / 500');setProgress('reward-progress',0,500000);text('synced','等待账号确认');$('history-list').replaceChildren();select('home');for(const id of ['sync','share','reward-edit','snooze','scan-reward'])if($(id))$(id).disabled=true;timer();}
    else if(m.type==='shareResult'&&m.id===shareId){clearTimeout(shareTimer);sharingState(false);notice(m.ok?'文字和面板图片已放入 X 编辑栏，核对后发布。':'分享失败：'+m.error,!m.ok);}
    else if(m.type==='error')notice(m.error,true);else if(m.type==='notice')notice(m.text);
  });
  document.querySelectorAll('nav button').forEach(b=>b.addEventListener('click',()=>select(b.dataset.tab)));
  $('update-check').onclick=()=>checkUpdates(true);
  $('share').onclick=share;
  $('settings-tab').onclick=()=>select('settings');$('minimize').onclick=()=>tell({type:'toggle'});$('sync').onclick=()=>tell({type:'sync'});
  if($('scan-reward'))$('scan-reward').onclick=()=>tell({type:'scanReward'});
  if($('reward-edit'))$('reward-edit').onclick=()=>{select('reward');const r=state?.reward;for(const k of ['qualified90d','verifiedFollowers'])$('reward-form').elements.namedItem(k).value=r?.date===state?.today.date?r?.[k]??'':'';};
  $('snooze').onclick=()=>{tell({type:'snooze'});notice('15 分钟后再次提醒。');};
  $('history-date').oninput=()=>{history();fitPanel();};
  $('reminder-snooze').onclick=()=>{if(state)state.reminder={snoozeUntil:Date.now()+900000,acknowledgedPost:null};tell({type:'snooze'});reminderVisible(false,null,0);};
  $('reminder-dismiss').onclick=()=>{if(state)state.reminder={...state.reminder,acknowledgedPost:state.lastPost};tell({type:'dismissReminder'});reminderVisible(false,null,0);};
  $('reminder-write').onclick=()=>{if(state)state.reminder={...state.reminder,acknowledgedPost:state.lastPost};tell({type:'dismissReminder'});reminderVisible(false,null,0);};
  $('settings-form').onsubmit=e=>{e.preventDefault();if(!state)return notice('请先登录 X 并确认账号。',true);const f=new FormData(e.currentTarget),value={...state.settings};for(const k of ['posts','replies','reminderMinutes','dailyQualifiedGoal'])if(f.has(k))value[k]=Number(f.get(k));value.reminderEnabled=e.currentTarget.elements.reminderEnabled.checked;value.autoReward=e.currentTarget.elements.autoReward.checked;tell({type:'settings',value});};
  $('reward-form').onsubmit=e=>{e.preventDefault();if(!state)return;const f=new FormData(e.currentTarget);const value=Object.fromEntries(['qualified90d','verifiedFollowers'].map(k=>[k,f.get(k)===''?null:Number(f.get(k))]));tell({type:'reward',value});select('home');};
  $('export').onclick=()=>{if(!state)return;const blob=new Blob([JSON.stringify({app:'X 修仙',version:'0.1.19',exportedAt:new Date().toISOString(),...state},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`X修仙-${state.profile.handle}-${state.today.date}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);};
  function draggable(element,isOrb=false){let start=null,moved=false;element.addEventListener('pointerdown',e=>{if(e.target.closest('button,a')&&!isOrb)return;if(e.button!==0)return;start={x:e.screenX,y:e.screenY};moved=false;element.setPointerCapture(e.pointerId);tell({type:'drag-start',screenX:e.screenX,screenY:e.screenY});});element.addEventListener('pointermove',e=>{if(!start)return;if(Math.abs(e.screenX-start.x)+Math.abs(e.screenY-start.y)>4)moved=true;tell({type:'drag-move',screenX:e.screenX,screenY:e.screenY});});const end=()=>{if(!start)return;start=null;tell({type:'drag-end'});};element.addEventListener('pointerup',()=>{end();if(isOrb&&!moved)tell({type:'toggle'});});element.addEventListener('pointercancel',end);element.addEventListener('lostpointercapture',end);element.addEventListener('keydown',e=>{const d={ArrowLeft:[-10,0],ArrowRight:[10,0],ArrowUp:[0,-10],ArrowDown:[0,10]}[e.key];if(d){e.preventDefault();tell({type:'move-key',dx:d[0],dy:d[1]});}else if(isOrb&&(e.key==='Enter'||e.key===' ')){e.preventDefault();tell({type:'toggle'});}});}
  draggable($('drag'));draggable($('orb'),true);$('avatar').onerror=()=>{$('avatar').hidden=true;$('avatar-fallback').hidden=false;};
  setInterval(timer,1000);setInterval(()=>{if(!document.hidden&&!$('shell').hidden)checkUpdates();},60*60*1000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!$('shell').hidden)checkUpdates();});
  addEventListener('resize',fitPanel);document.addEventListener('toggle',fitPanel,true);document.fonts?.ready.then(fitPanel);tell({type:'ready'});fitPanel();
})();
