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
