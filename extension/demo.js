/* Deliberate demo-only fixture. It never runs on x.com or inside the extension panel. */
(() => {
  document.getElementById('demo-reply').onclick=()=>XianFeedback.replyPlus('demo-'+Date.now());
  const C=XianCore,host=document.getElementById('demo-host'),frame=host.querySelector('iframe'),now=Date.now();
  let a=C.blank({handle:'wanderer',name:'云游散人',avatar:'',followers:1280,id:'123'});
  let payload={users:[{handle:'wanderer',name:'云游散人',followers:1272}],tweets:[]};
  const zone=a.settings.timeZone,today=C.day(now,zone);let last=now-45*60000;if(C.day(last,zone)!==today)last=now-1000;
  for(let i=0;i<2;i++)payload.tweets.push({id:String(100+i),author:'wanderer',authorId:'123',at:last-i*1000,reply:false,views:i?4840:8000});
  for(let i=0;i<12;i++)payload.tweets.push({id:String(200+i),author:'wanderer',authorId:'123',at:last-i*1000,reply:true,views:i===0?510:250});
  C.ingest(a,payload,now-60000);C.ingest(a,{users:[{handle:'wanderer',name:'云游散人',followers:1280}]},now);
  a.days[C.day(now-86400000,zone)]={date:C.day(now-86400000,zone),posts:3,replies:24,postViews:18420,replyViews:6028,followerDelta:12};
  C.recordReward(a,{qualified90d:129400,raw:'129.4K',precision:100,source:'official-page'},now-2*86400000);C.recordReward(a,{qualified90d:131900,raw:'131.9K',precision:100,source:'official-page'},now-86400000);C.recordReward(a,{qualified90d:132600,raw:'132.6K',precision:100,source:'official-page'},now-3600000);C.recordReward(a,{qualified90d:134600,raw:'134.6K',precision:100,source:'official-page'},now);
  C.recordStudio(a,{date:today,taskTimeZone:'UTC',posts:2,replies:12,postViews:12840,replyViews:3260,totalViews:16100},now);
  a.sync={running:false,complete:true,at:now,lastCompletedAt:now};
  const send=m=>frame.contentWindow.postMessage({source:'xian-parent-v1',...m},location.origin);let drag=null,collapsed=false;
  addEventListener('message',e=>{if(e.source!==frame.contentWindow||e.origin!==location.origin||e.data?.source!=='xian-panel-v1')return;const m=e.data;
    if(m.type==='ready'||m.type==='refresh'){send({type:'state',data:C.snapshot(a)});send({type:'collapsed',value:collapsed});}
    else if(m.type==='settings'){a.settings=C.settings(m.value);send({type:'state',data:C.snapshot(a)});send({type:'notice',text:'演示功法已更新。'});}
    else if(m.type==='reward'){C.recordReward(a,{...m.value,source:'manual'});send({type:'state',data:C.snapshot(a)});}
    else if(m.type==='dismissReminder'){a.reminderAckFor=a.lastPost;send({type:'state',data:C.snapshot(a)});}
    else if(m.type==='snooze'){a.snoozeUntil=Date.now()+900000;a.reminderAckFor=null;send({type:'state',data:C.snapshot(a)});}
    else if(m.type==='resize'){host.style.height=Math.min(720,innerHeight-24,Math.max(300,m.height))+'px';}
    else if(m.type==='attention'){if(collapsed){collapsed=false;host.style.width='372px';host.style.height='min(720px, calc(100dvh - 48px))';send({type:'collapsed',value:false});}}
    else if(m.type==='toggle'){collapsed=!collapsed;host.style.width=collapsed?'56px':'372px';host.style.height=collapsed?'56px':'min(720px, calc(100dvh - 48px))';send({type:'collapsed',value:collapsed});}
    else if(m.type==='drag-start'){const r=host.getBoundingClientRect();drag={x:r.left,y:r.top,sx:m.screenX,sy:m.screenY};}
    else if(m.type==='drag-move'&&drag){host.style.left=Math.max(10,Math.min(innerWidth-host.offsetWidth-10,drag.x+m.screenX-drag.sx))+'px';host.style.top=Math.max(10,Math.min(innerHeight-host.offsetHeight-10,drag.y+m.screenY-drag.sy))+'px';}
    else if(m.type==='drag-end')drag=null;
    else if(m.type==='move-key'){const r=host.getBoundingClientRect();host.style.left=Math.max(10,Math.min(innerWidth-host.offsetWidth-10,r.left+m.dx))+'px';host.style.top=Math.max(10,Math.min(innerHeight-host.offsetHeight-10,r.top+m.dy))+'px';}
    else send({type:'notice',text:'这是演示界面；安装插件后会在 X 上执行此操作。'});
  });
})();
