/* Shared, dependency-free data rules. Never stores post bodies or credentials. */
(function (root) {
  'use strict';
  const defaults = { posts: 3, replies: 20, reminderMinutes: 60, reminderEnabled: true, autoReward: true, dailyQualifiedGoal: 5556, timeZone: 'Asia/Shanghai' };
  const handle = x => String(x || '').replace(/^@/, '').toLowerCase().match(/^[a-z0-9_]{1,15}$/)?.[0] || '';
  const number = x => (typeof x === 'number' || typeof x === 'string') && x !== null && x !== undefined && x !== '' && Number.isFinite(Number(x)) && Number(x) >= 0 ? Math.floor(Number(x)) : null;
  function day(t = Date.now(), zone = defaults.timeZone) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t));
  }
  function user(raw) {
    const l = raw?.legacy || {}, c = raw?.core || {};
    const h = handle(c.screen_name || l.screen_name || raw?.screen_name || raw?.handle);
    if (!h) return null;
    const avatar = String(raw?.avatar?.image_url || l.profile_image_url_https || raw?.avatar || '');
    return { handle: h, id: /^\d+$/.test(String(raw?.rest_id || raw?.id || '')) ? String(raw.rest_id || raw.id) : null,
      name: String(c.name || l.name || raw?.name || h).slice(0, 100),
      avatar: /^https:\/\/pbs\.twimg\.com\/profile_images\//.test(avatar) ? avatar : '',
      followers: number(l.followers_count ?? raw?.relationship_counts?.followers_count ?? raw?.public_metrics?.followers_count ?? raw?.followers), verifiedFollowers: number(l.verified_followers_count ?? raw?.verifiedFollowers) };
  }
  function tweet(raw) {
    if (!raw || raw.__typename === 'TweetTombstone') return null;
    if (raw.tweet) return tweet(raw.tweet);
    const l = raw.legacy;
    if (!l || l.retweeted_status_result || !/^\d+$/.test(String(raw.rest_id || ''))) return null;
    const u = user(raw.core?.user_results?.result);
    const time = Date.parse(l.created_at);
    if (!u || !Number.isFinite(time)) return null;
    return { id: String(raw.rest_id), author: u.handle, authorId: u.id, at: time,
      reply: !!(l.in_reply_to_status_id_str || l.in_reply_to_status_id || l.in_reply_to_user_id_str || l.in_reply_to_user_id), views: number(raw.views?.count),
      quoted: !!l.is_quote_status };
  }
  function extract(data) {
    const tweets = new Map(), users = new Map(); let visited = 0;
    function walk(v, depth) {
      if (!v || typeof v !== 'object' || depth > 35 || ++visited > 45000) return;
      if (v.__typename === 'User' || (v.rest_id && v.legacy?.screen_name)) { const u = user(v); if (u) users.set(u.handle, u); }
      if (v.__typename === 'Tweet' || (v.rest_id && v.legacy?.created_at && v.core?.user_results)) { const t = tweet(v); if (t) tweets.set(t.id, t); }
      for (const value of Object.values(v)) walk(value, depth + 1);
    }
    walk(data, 0); return { tweets: [...tweets.values()].slice(0, 1500), users: [...users.values()].slice(0, 500) };
  }
  function settings(input = {}) {
    const n = (key, min, max) => Math.min(max, Math.max(min, number(input[key]) ?? defaults[key]));
    let timeZone = String(input.timeZone || defaults.timeZone);
    try { day(Date.now(), timeZone); } catch { timeZone = defaults.timeZone; }
    return { posts: n('posts', 1, 1000), replies: n('replies', 1, 10000), reminderMinutes: n('reminderMinutes', 1, 1440),
      dailyQualifiedGoal: n('dailyQualifiedGoal', 1, 10000000), reminderEnabled: input.reminderEnabled !== false, autoReward: input.autoReward !== false, timeZone };
  }
  function displayNumber(raw) {
    const text = String(raw || '').trim().replace(/,/g, '');
    const match = text.match(/^(\d+(?:\.\d+)?)\s*(K|M|B|万|萬|亿|億)?$/i);
    if (!match) return null;
    const scale = {K:1000,M:1000000,B:1000000000,'万':10000,'萬':10000,'亿':100000000,'億':100000000}[match[2]?.toUpperCase()] || 1;
    const decimals = (match[1].split('.')[1] || '').length;
    return { value: Math.round(Number(match[1])*scale), precision: match[2] ? scale/10**decimals : 1, raw:String(raw).trim() };
  }
  function recordReward(account, input, now = Date.now()) {
    const count = number(input.qualified90d); if (count === null) return false;
    const date = day(now, account.settings.timeZone), previous = account.reward;
    const r = account.days[date] ||= { date, firstSeenAt:now };
    if (!r.rewardTrack) {
      const yesterday = day(now-86400000, account.settings.timeZone);
      const prior = previous?.date === yesterday ? previous : null;
      r.rewardTrack = { baseline:prior?.qualified90d ?? count, baselineAt:prior?.at ?? now, baselineDate:prior?.date ?? date,
        baselinePrecision:prior?.precision || number(input.precision) || 1, partial:!prior, first:count, firstAt:now, samples:[] };
    }
    const track=r.rewardTrack, precision=Math.max(1,number(input.precision)||1);
    const value = { qualified90d:count, verifiedFollowers:number(input.verifiedFollowers) ?? previous?.verifiedFollowers ?? null,
      date, source:input.source==='official-page'?'official-page':'manual', at:now, precision, raw:String(input.raw||count).slice(0,32) };
    const last=track.samples.at(-1);
    if((!last&&count!==track.baseline)||(last&&last.value!==count))track.changeCount=(track.changeCount||0)+1;
    if(!last || last.value!==count || last.source!==value.source) track.samples.push({value:count,at:now,raw:value.raw,precision,source:value.source});
    track.samples=track.samples.slice(-200);track.latest=count;track.latestAt=now;track.delta=count-track.baseline;
    track.approximate=precision>1 || track.baselinePrecision>1;track.source=value.source;
    r.reward=value;account.reward=value;account.updatedAt=now;return true;
  }
  function analytics(data) {
    const rows=new Map();let visited=0;
    const aliases={postscreated:'posts',tweetscreated:'posts',postspublished:'posts',outboundposts:'posts',repliescreated:'replies',repliespublished:'replies',outboundreplies:'replies',postimpressions:'postViews',originalimpressions:'postViews',originalpostscreated:'posts',tweetscreated:'posts',postspublished:'posts',outboundposts:'posts',repliescreated:'replies',repliespublished:'replies',outboundreplies:'replies',postimpressions:'postViews',replyimpressions:'replyViews',repliesimpressions:'replyViews',totalimpressions:'totalViews',impressions:'totalViews',followerscount:'followers',followercount:'followers',verifiedfollowers:'verifiedFollowers',verifiedfollowerscount:'verifiedFollowers'};
    function walk(v,path,depth,inheritedDate){
      if(!v||typeof v!=='object'||depth>24||++visited>30000)return;
      let date=inheritedDate;const raw=v.date??v.day??v.timestamp??v.start_time??v.startTime;
      if(typeof raw==='string'&&/^\d{4}-\d{2}-\d{2}/.test(raw))date=raw.slice(0,10);
      else if(number(raw)!==null&&Number(raw)>1000000000){try{date=day(Number(raw)<100000000000?Number(raw)*1000:Number(raw));}catch{}}
      const collected={};
      for(const [key,value]of Object.entries(v)){
        const normalized=key.replace(/[^a-z]/gi,'').toLowerCase(),alias=aliases[normalized];
        const n=number(value);if(alias&&n!==null&&typeof value!=='object')collected[alias]=n;
      }
      const metric=String(v.metric_type??v.metricType??v.metric??v.name??'').replace(/[^a-z]/gi,'').toLowerCase();
      let name=aliases[metric],value=number(v.value??v.count??v.metric_value);
      if(name==='totalViews'&&/(?:reply|replies)/i.test(path))name='replyViews';
      if(name==='totalViews'&&/(?:original_posts|originalPosts|post_metrics|postMetrics)/.test(path))name='postViews';
      if(name&&value!==null)collected[name]=value;
      if(date&&Object.keys(collected).length)rows.set(date,{...rows.get(date),...collected,date});
      for(const [key,value]of Object.entries(v))walk(value,path+'.'+key,depth+1,date);
    }
    walk(data,'root',0,null);return [...rows.values()].slice(-370);
  }
  // Account overview's create metrics describe our own publishing, unlike Reply engagement.
  // Preserve the studio's UTC dates and prefer historical daily buckets over recent backfill.
  function overviewMetrics(raw, publishing=false) {
    const aggregate=items=>{const rows=new Map(),seen=new Set();
      for(const point of Array.isArray(items)?items:[]){
        const count=number(point?.count),stamp=number(point?.timestamp);
        if(count===null||!stamp)continue;
        const at=stamp<100000000000?stamp*1000:stamp;if(at>8640000000000000)continue;
        const date=new Date(at).toISOString().slice(0,10),kind=point.engagement_type;
        const key=at+':'+kind+':'+String(point.is_engaging_user_verified??'all');
        if(seen.has(key))continue;seen.add(key);
        const row=rows.get(date)||{date};rows.set(date,row);
        const field=kind==='Displayed'?'totalViews':publishing&&['TweetCreate','QuoteCreate'].includes(kind)?'posts':publishing&&kind==='ReplyCreate'?'replies':null;
        if(field)row[field]=(row[field]||0)+count;
      }
      // This operation returns all create metrics; an omitted creation kind on a returned day is zero.
      if(publishing)for(const row of rows.values()){row.posts??=0;row.replies??=0;row.taskTimeZone='UTC';}
      return rows;};
    const daily=aggregate(raw?.current_time_series),recent=aggregate(raw?.hourly_backfill);
    for(const [date,row]of recent)if(!daily.has(date))daily.set(date,row);
    return [...daily.values()].filter(row=>row.totalViews!=null||publishing).sort((a,b)=>a.date.localeCompare(b.date));
  }
  function overviewImpressions(raw){return overviewMetrics(raw).map(({date,totalViews})=>({date,totalViews}));}
  const taskDay=(account,at)=>day(at,account.taskTimeZone||account.settings.timeZone);
  function parseStudioSchema(raw,schema,now=Date.now()){
    if(schema.format==='x-account-overview')return overviewMetrics(raw,schema.publishing===true);
    const get=(obj,path)=>String(path||'').split('.').filter(Boolean).reduce((v,k)=>v?.[k],obj),rows=new Map();
    const dateOf=x=>{if(typeof x==='string'&&/^\d{4}-\d{2}-\d{2}/.test(x))return x.slice(0,10);const n=number(x);if(n>1000000000)return day(n<100000000000?n*1000:n);return null;};
    const add=(date,metric,value)=>{if(!date||!['posts','replies','postViews','replyViews','totalViews','followers','verifiedFollowers'].includes(metric))return;const n=number(value);if(n===null)return;rows.set(date,{...rows.get(date),date,[metric]:n});};
    for(const rule of schema.rules||[]){const outer=get(raw,rule.arrayPath);if(!Array.isArray(outer))continue;
      for(const item of outer){const points=rule.pointsField?get(item,rule.pointsField):[item];if(!Array.isArray(points))continue;for(const point of points){const date=dateOf(get(point,rule.dateField)||get(item,rule.dateField));
        if(rule.metrics)for(const [name,path]of Object.entries(rule.metrics))add(date,name,get(point,path));
        if(rule.metricField){const name=get(item,rule.metricField)??get(point,rule.metricField);add(date,rule.metricMap?.[String(name)],get(point,rule.valueField));}
        if(rule.metricsField){const metrics=get(point,rule.metricsField);if(Array.isArray(metrics))for(const m of metrics)add(date,rule.metricMap?.[String(get(m,rule.nameField))],get(m,rule.valueField));}
      }}
    }
    for(const [name,path]of Object.entries(schema.directFields||{}))add(day(now),name,get(raw,path));
    return [...rows.values()];
  }
  function reconcileTasks(account,input,now=Date.now()) {
    if(!/^\d{4}-\d{2}-\d{2}$/.test(String(input.date||'')))return false;
    const record=account.days[input.date] ||= {date:input.date,firstSeenAt:now};let changed=false;
    for(const kind of ['posts','replies']){
      const official=number(input[kind]);if(official===null)continue;record.taskSync ||= {};
      const local=Object.values(account.tweets).filter(t=>taskDay(account,t.at)===input.date&&t.reply===(kind==='replies'));
      const prior=record.taskSync[kind];if(prior&&now<prior.receivedAt)continue;
      const pending=prior?local.filter(t=>prior.ackSequence!=null?(t.sequence||0)>prior.ackSequence:(t.recordedAt||t.seenAt||t.at)>prior.ackAt):local;
      const before=prior?prior.baseline+pending.length:local.length;
      const hasRecent=pending.some(t=>now-(t.recordedAt||t.seenAt||t.at)<600000);
      const hold=official<before&&hasRecent;
      const next={baseline:hold?(prior?.baseline||0):official,ackAt:hold?(prior?.ackAt||account.createdAt-1):now,ackSequence:hold?(prior?.ackSequence??0):(account.eventSeq||0),official,receivedAt:now,held:hold};
      record.taskSync[kind]=next;
      const after=hold?before:official;
      if(before!==after){record.taskCorrections ||= [];record.taskCorrections.push({kind,before,after,at:now,source:'creator-studio'});record.taskCorrections=record.taskCorrections.slice(-100);}
      changed=true;
    }
    return changed;
  }
  function recordStudio(account, input, now=Date.now()) {
    if(!/^\d{4}-\d{2}-\d{2}$/.test(String(input.date||'')))return false;
    const record=account.days[input.date] ||= {date:input.date,firstSeenAt:now};
    if(input.taskTimeZone==='UTC'&&(number(input.posts)!==null||number(input.replies)!==null))account.taskTimeZone='UTC';
    reconcileTasks(account,input,now);const fields={};for(const key of ['posts','replies','postViews','replyViews','totalViews','followers','verifiedFollowers']){const n=number(input[key]);if(n!==null)fields[key]=n;}
    if(!Object.keys(fields).length)return false;
    record.studio={...record.studio,...fields,date:input.date,at:now,source:'creator-studio'};
    if(input.date===day(now,account.settings.timeZone)){
      if(fields.followers!=null)ingest(account,{users:[{...account.profile,followers:fields.followers}]},now);
      if(fields.verifiedFollowers!=null)account.profile.verifiedFollowers=fields.verifiedFollowers;
    }
    account.days[input.date]={...record,...summarize(account,input.date)};account.studioUpdatedAt=now;return true;
  }
  function blank(profile, now = Date.now()) {
    return { profile, eventSeq:0, settings: { ...defaults }, tweets: {}, days: {}, lastPost: null, updatedAt: null, createdAt: now, reward: null };
  }
  function summarize(account, date = day(Date.now(), account.settings.timeZone)) {
    const list = Object.values(account.tweets).filter(t => taskDay(account,t.at) === date);
    const posts = list.filter(t => !t.reply), replies = list.filter(t => t.reply);
    const sum = items => { const seen = items.filter(t => t.views !== null); return seen.length ? seen.reduce((n,t) => n + t.views, 0) : null; };
    const saved = account.days[date] || {};
    const task=(kind,list)=>{const r=saved.taskSync?.[kind];return r?r.baseline+list.filter(t=>r.ackSequence!=null?(t.sequence||0)>r.ackSequence:(t.recordedAt||t.seenAt||t.at)>r.ackAt).length:list.length;};
    return { ...saved, date, posts: task('posts',posts), replies: task('replies',replies), postViews: sum(posts), replyViews: sum(replies),
      postsWithViews: posts.filter(t => t.views !== null).length, repliesWithViews: replies.filter(t => t.views !== null).length,
      followerDelta: saved.followerLatest != null && saved.followerStart != null ? saved.followerLatest - saved.followerStart : null };
  }
  function ingest(account, payload, now = Date.now()) {
    const date = day(now, account.settings.timeZone), h = account.profile.handle;
    const record = account.days[date] ||= { date, firstSeenAt: now, followerStart: null, followerLatest: null };
    const own = (payload.users || []).map(user).find(u => u?.handle === h && (!account.profile.id || !u.id || u.id === account.profile.id));
    if (own) {
      account.profile = { ...account.profile, ...Object.fromEntries(Object.entries(own).filter(([,v]) => v !== null && v !== '')) };
      if (own.followers !== null) { if(record.followerStart==null)record.followerStartAt=now;record.followerStart ??= own.followers; record.followerLatest = own.followers; record.followersAt = now; }
    }
    for (const t of payload.tweets || []) {
      if (!t || !/^\d+$/.test(String(t.id)) || handle(t.author) !== h || (account.profile.id && t.authorId && t.authorId !== account.profile.id) || !Number.isFinite(t.at) || t.at > now + 60000 || typeof t.reply !== 'boolean') continue;
      const old = account.tweets[t.id];
      account.tweets[t.id] = { id: t.id, author: h, authorId: t.authorId || null, at: t.at, reply: t.reply, views: number(t.views) ?? old?.views ?? null, quoted: t.quoted === true, sequence:old?.sequence??(account.eventSeq=(account.eventSeq||0)+1), recordedAt:old?.recordedAt||now, seenAt: now };
      if (!t.reply) account.lastPost = Math.max(account.lastPost || 0, t.at);
    }
    account.updatedAt = now;
    // Archive each observed day before pruning individual tweet metadata after 120 days.
    const dates = new Set([date,taskDay(account,now),...Object.values(account.tweets).map(t=>taskDay(account,t.at))]);
    for (const d of dates) account.days[d] = { ...account.days[d], ...summarize(account, d) };
    const cutoff = now - 120 * 86400000;
    for (const [id, t] of Object.entries(account.tweets)) if (t.at < cutoff) delete account.tweets[id];
    const entries=Object.entries(account.tweets).sort((a,b)=>b[1].at-a[1].at);
    for(const [id] of entries.slice(20000)) delete account.tweets[id];
    return account;
  }
  function snapshot(account, now = Date.now()) {
    const current = day(now, account.settings.timeZone);
    const taskDate=taskDay(account,now),today=summarize(account,current),tasks=summarize(account,taskDate);
    for(const key of ['posts','replies','taskSync','taskCorrections'])today[key]=tasks[key];
    const studioToday=account.days[day(now,'UTC')]?.studio||null;
    return { profile: account.profile, settings: account.settings, today, taskDate, taskTimeZone:account.taskTimeZone||account.settings.timeZone, studioToday, sync:account.sync||null, lastPost: account.lastPost, updatedAt: account.updatedAt,
      reminder:{snoozeUntil:account.snoozeUntil||null,acknowledgedPost:account.reminderAckFor||null}, history: Object.values(account.days).sort((a,b)=>b.date.localeCompare(a.date)), reward: account.reward };
  }
  const api = { defaults, handle, number, day, user, tweet, extract, settings, displayNumber, recordReward, analytics, overviewMetrics, overviewImpressions, parseStudioSchema, reconcileTasks, recordStudio, blank, ingest, summarize, snapshot };
  root.XianCore = api; if (typeof module !== 'undefined') module.exports = api;
})(globalThis);

(()=>{
'use strict';
  let replyClick=null;const celebratedReplies=new Set();
  document.addEventListener('click',event=>{
    const button=event.target instanceof Element?event.target.closest('[data-testid="tweetButtonInline"],[data-testid="tweetButton"]'):null;
    if(!button||button.disabled||button.getAttribute('aria-disabled')==='true')return;
    const r=button.getBoundingClientRect();replyClick={x:r.x,y:r.y,width:r.width,height:r.height,at:Date.now()};
  },true);
  function replyPlus(id){
    if(!replyClick||Date.now()-replyClick.at>30000||celebratedReplies.has(id))return;
    const r=replyClick;replyClick=null;celebratedReplies.add(id);if(celebratedReplies.size>500)celebratedReplies.delete(celebratedReplies.values().next().value);
    const card=document.createElement('div');card.textContent='+1';card.setAttribute('aria-hidden','true');
    Object.assign(card.style,{position:'fixed',left:Math.max(6,Math.min(innerWidth-52,r.x+r.width/2-22))+'px',top:Math.max(8,r.y-32)+'px',zIndex:'2147483646',pointerEvents:'none',padding:'3px 10px',borderRadius:'7px',background:'#153e2ff2',border:'1px solid #7fe6ae',color:'#a5f4c4',font:'600 15px/20px -apple-system,BlinkMacSystemFont,sans-serif',boxShadow:'0 4px 14px #0003',opacity:'0'});
    document.body.append(card);const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
    const animation=card.animate([{opacity:0,transform:reduce?'none':'translateY(5px)'},{opacity:1,transform:'translateY(0)',offset:.18},{opacity:1,transform:reduce?'none':'translateY(-4px)',offset:.65},{opacity:0,transform:reduce?'none':'translateY(-12px)'}],{duration:1100,easing:'ease-out',fill:'forwards'});
    animation.finished.catch(()=>{}).finally(()=>card.remove());
  }

globalThis.XianFeedback={replyPlus};
})();

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
