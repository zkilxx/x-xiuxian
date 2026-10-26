/* MAIN world: observe only already-requested X post/profile responses. No API requests, tokens, headers or text cross worlds. */
(() => {
  'use strict';
  if(location.hash==='#xian-background'&&location.pathname.startsWith('/i/account_analytics')){try{Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'visible'});Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>true});}catch{}}
  if (window.__xianObserverV1) return;
  window.__xianObserverV1 = true;
  const debugBuffer=[];
  const debug=(url,result)=>{try{const operation=new URL(url,location.href).pathname.split('/').pop();const value={operation,...result};debugBuffer.push(value);if(debugBuffer.length>8)debugBuffer.shift();window.postMessage({source:'xian-observer-diagnostic-v1',value},location.origin);}catch{}};
  const operations = /\/(?:UserTweets(?:AndReplies)?|UserByScreenName|UserByRestId|SearchTimeline|CreateTweet|HomeTimeline|HomeLatestTimeline|TweetDetail)(?:\?|$)/;
  const allowed = raw => { try { const u = new URL(raw, location.href); return !/(?:grok|jwt|token|chat|directmessage|inbox)/i.test(u.pathname) && ['https://x.com','https://twitter.com','https://api.x.com'].includes(u.origin) && (u.pathname.includes('/graphql/') || u.pathname.includes('/analytics/')) && (operations.test(u.pathname) || /\/(?:User|Tweet|Search|AccountAnalytics|Creator|Analytics)[^/]*$/.test(u.pathname) || /\/i\/account_analytics/.test(location.pathname)); } catch { return false; } };
  const backlog=[],analyticsBuffer=[],rawBuffer=[];
  window.addEventListener('message',e=>{if(e.data?.source==='xian-request-buffer'){for(const payload of backlog)window.postMessage({source:'xian-observer-v1',payload},location.origin);for(const raw of rawBuffer)window.postMessage({source:'xian-studio-raw-v1',raw},location.origin);for(const rows of analyticsBuffer)window.postMessage({source:'xian-studio-v1',rows},location.origin);for(const value of debugBuffer)window.postMessage({source:'xian-observer-diagnostic-v1',value},location.origin);}});
  const send = (data,url) => {
    try { const shape=[];const inspect=(v,path,d)=>{if(!v||typeof v!=='object'||d>5||shape.length>=25)return;shape.push(path+':'+Object.keys(v).slice(0,12).join(','));for(const [k,value]of Object.entries(v).slice(0,8))inspect(value,path+'.'+k,d+1);};inspect(data,'root',0);{const result=data?.data?.viewer_v2?.user_results?.result;if(result?.current_time_series){const trim=(v,d=0)=>{if(d>6)return '[depth]';if(Array.isArray(v))return {length:v.length,items:v.slice(0,3).map(x=>trim(x,d+1))};if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).slice(0,30).map(([k,x])=>[k,trim(x,d+1)]));return v;};shape.unshift('studio-v4 '+JSON.stringify({length:result.current_time_series.length,sample:trim(result.current_time_series.slice(0,3)),fields:trim({relationship:result.relationship_counts,verified:result.verified_follower_count})}));const raw={current_time_series:result.current_time_series,hourly_backfill:result.hourly_backfill,legacy_current_follow_metrics:result.legacy_current_follow_metrics,relationship_counts:result.relationship_counts,verified_follower_count:result.verified_follower_count};if(JSON.stringify(raw).length<8000000){rawBuffer.length=0;rawBuffer.push(raw);window.postMessage({source:'xian-studio-raw-v1',raw},location.origin);}}}const clean = globalThis.XianCore.extract(data);const rows=globalThis.XianCore.analytics(data);if(rows.length&&location.pathname.startsWith('/i/account_analytics')){analyticsBuffer.push(rows);if(analyticsBuffer.length>8)analyticsBuffer.shift();window.postMessage({source:'xian-studio-v1',rows},location.origin);}debug(url,{tweets:clean.tweets.length,users:clean.users.length,keys:Object.keys(data).slice(0,10),shape}); if (clean.tweets.length || clean.users.length) { backlog.push(clean); if(backlog.length>12)backlog.shift(); window.postMessage({ source:'xian-observer-v1', payload:clean }, location.origin); } } catch { /* X schema drift must never break X */ }
  };
  async function metadata(input, options){
    const url=typeof input==='string'||input instanceof URL?String(input):input?.url;
    const isCreate=/\/CreateTweet[^/]*(?:\?|$)/.test(new URL(url,location.href).pathname);
    if(!isCreate)return null;
    let variables={};try{let body=options?.body;if(typeof body!=='string'&&input instanceof Request)body=await input.clone().text();variables=JSON.parse(body||'{}').variables||{};if(typeof variables==='string')variables=JSON.parse(variables);}catch{}
    const link=document.querySelector('[data-testid="AppTabBar_Profile_Link"]');
    const author=globalThis.XianCore.handle((link?.getAttribute('href')||'').split('/')[1]);
    return {author,reply:!!variables.reply?.in_reply_to_tweet_id};
  }
  const createdBuffer=[];
  window.addEventListener('message',e=>{if(e.data?.source==='xian-request-buffer')for(const value of createdBuffer)window.postMessage({source:'xian-created-v1',value},location.origin);});
  function created(data,meta){
    if(!meta?.author)return;
    let raw=data?.data?.create_tweet?.tweet_results?.result||data?.data?.create_tweet?.tweet_result?.result;
    if(raw?.tweet)raw=raw.tweet;
    if(!/^\d+$/.test(String(raw?.rest_id||'')))return;
    const parsed=globalThis.XianCore.tweet(raw);
    const value={id:String(raw.rest_id),author:parsed?.author||meta.author,authorId:parsed?.authorId||null,
      at:parsed?.at||Date.now(),reply:Boolean(parsed?.reply||meta.reply),views:parsed?.views??null,source:'published'};
    createdBuffer.push(value);if(createdBuffer.length>30)createdBuffer.shift();
    window.postMessage({source:'xian-created-v1',value},location.origin);
  }
  const originalFetch = window.fetch;
  window.fetch = function (...args) {
    const meta=metadata(args[0],args[1]);
    const result = originalFetch.apply(this,args);
    const url = typeof args[0] === 'string' || args[0] instanceof URL ? String(args[0]) : args[0]?.url;
    if (allowed(url)) result.then(response => { if (response.ok) response.clone().text().then(body => { if (body.length < 12000000) { try { const data=JSON.parse(body);send(data,url);meta.then(m=>created(data,m)); } catch {} } }).catch(()=>{}); }).catch(()=>{});
    return result;
  };
  const open = XMLHttpRequest.prototype.open, xhrSend = XMLHttpRequest.prototype.send;
  const tracked = new WeakSet(),xhrURLs=new WeakMap();
  XMLHttpRequest.prototype.open = function (method,url,...rest) { xhrURLs.set(this,String(url));if (allowed(String(url))) tracked.add(this); else tracked.delete(this); return open.call(this,method,url,...rest); };
  XMLHttpRequest.prototype.send = function (...args) {
    const meta=metadata(xhrURLs.get(this)||'',{body:args[0]});
    if (tracked.has(this)) this.addEventListener('load',function () { if (this.status < 200 || this.status >= 300) return; try { if (this.responseType === 'json') {send(this.response,this.responseURL);meta.then(m=>created(this.response,m));} else if (!this.responseType || this.responseType === 'text') { if (this.responseText.length < 12000000) {const data=JSON.parse(this.responseText);send(data,this.responseURL);meta.then(m=>created(data,m));} } } catch {} },{once:true});
    return xhrSend.apply(this,args);
  };
})();
