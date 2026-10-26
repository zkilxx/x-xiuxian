const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');const C=require('../extension/core.js');
function bridge(response,status=200){
 const events=[];class XHR{open(){}send(){}addEventListener(){}}
 const state={XianCore:C,URL,Request,location:{origin:'https://x.com',href:'https://x.com/home',pathname:'/home'},document:{querySelector:()=>({getAttribute:()=>'/tester'})},XMLHttpRequest:XHR,fetch:async()=>new Response(JSON.stringify(response),{status}),addEventListener(){},postMessage:m=>events.push(m),setTimeout,Promise,Date,Map,WeakSet,WeakMap};
 const ctx=vm.createContext(state);vm.runInContext('window=globalThis;',ctx);vm.runInContext(fs.readFileSync(require.resolve('../extension/bridge.js'),'utf8'),ctx);return {ctx,events};
}
const settle=()=>new Promise(r=>setTimeout(r,25));
test('publishing success records the returned tweet ID and request reply kind, with no post body crossing worlds',async()=>{
 const h=bridge({data:{create_tweet:{tweet_results:{result:{__typename:'Tweet',rest_id:'987654321',legacy:{created_at:new Date().toUTCString()},core:{user_results:{result:{rest_id:'42',core:{screen_name:'tester',name:'Tester'}}}}}}}}});
 await h.ctx.fetch('https://x.com/i/api/graphql/hash/CreateTweet',{method:'POST',body:JSON.stringify({variables:{tweet_text:'DO NOT STORE THIS BODY',reply:{in_reply_to_tweet_id:'10'}}})});await settle();
 const messages=h.events.filter(e=>e.source==='xian-created-v1');assert.equal(messages.length,1);assert.equal(messages[0].value.reply,true);assert.equal(messages[0].value.id,'987654321');assert.equal(messages[0].value.author,'tester');assert.equal(JSON.stringify(h.events).includes('DO NOT STORE THIS BODY'),false);
 const a=C.blank({handle:'tester'});C.ingest(a,{tweets:[messages[0].value,messages[0].value]});assert.equal(C.snapshot(a).today.replies,1);
});
test('failed publishing and GraphQL errors never increment counts',async()=>{
 for(const [payload,status]of [[{errors:[{message:'denied'}]},200],[{data:{create_tweet:{tweet_results:{result:{rest_id:'123'}}}}},403]]){
  const h=bridge(payload,status);await h.ctx.fetch('https://x.com/i/api/graphql/hash/CreateTweet',{method:'POST',body:'{}'});await settle();assert.equal(h.events.filter(e=>e.source==='xian-created-v1').length,0);
 }
});

test('account overview capture carries only the allowed metric series for background reconciliation',async()=>{
 const raw={current_time_series:[{timestamp:1792972800000,engagement_type:'TweetCreate',count:5}],hourly_backfill:[{timestamp:1792972800000,engagement_type:'ReplyCreate',count:77}],relationship_counts:{followers:6065},verified_follower_count:'5073'};
 const h=bridge({data:{viewer_v2:{user_results:{result:{...raw,do_not_capture:'PRIVATE_EXTRA'}}}}});h.ctx.location.pathname='/i/account_analytics/overview';await h.ctx.fetch('https://x.com/i/api/graphql/hash/accountOverviewDailyQuery');await settle();const messages=h.events.filter(x=>x.source==='xian-studio-raw-v1');assert.equal(messages.length,1);assert.equal(messages[0].raw.hourly_backfill[0].count,77);assert.equal(messages[0].raw.do_not_capture,undefined);
});
