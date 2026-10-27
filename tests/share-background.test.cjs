const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const C=require('../extension/core.js');const source=fs.readFileSync(require.resolve('../extension/share-background.js'),'utf8');
const png='data:image/png;base64,'+fs.readFileSync(require.resolve('../extension/assets/icon16.png')).toString('base64');
function harness(){
  const created=[],sent=[],requests=[],local={'account:tester':{profile:{avatar:'https://pbs.twimg.com/profile_images/123/avatar.png'}}},session={'identity:1':'tester'};let target='https://x.com/compose/post',failure=false;
  const chrome={runtime:{id:'test',getManifest:()=>({version:'1.0'})},storage:{local:{get:async k=>({[k]:local[k]})},session:{get:async k=>({[k]:session[k]})}},tabs:{create:async options=>{created.push(options);return{id:20};},get:async()=>({id:20,url:target}),sendMessage:async(id,message)=>{sent.push(message);return message.type==='XIAN_COMPOSER_PING'?{version:'1.0'}:{ok:!failure,error:'Upload failed'};}}};
  const context=vm.createContext({chrome,XianCore:C,URL,Date,AbortSignal,crypto:{randomUUID:()=> 'job-id'},setTimeout,btoa,fetch:async(url,options)=>{requests.push({url,options});return{ok:true,headers:{get:()=> 'image/png'},arrayBuffer:async()=>new Uint8Array([1,2,3]).buffer};}});vm.runInContext(source,context);
  return{api:context.XianSharing,created,sent,requests,local,session,setTarget:v=>target=v,setFailure:v=>failure=v};
}
const sender={id:'test',tab:{id:1,url:'https://x.com/home'}},request={handle:'tester',text:'@tester 修行记录',image:{dataURL:png,filename:'X修仙.png'}};
test('sharing rejects wrong source, changed identity and invalid images before creating a tab',async()=>{
  for(const invalid of [{id:'other',tab:sender.tab},{id:'test',tab:{id:1,url:'https://evil.test'}},{id:'test'}]){const h=harness();await assert.rejects(h.api.open(request,invalid));assert.equal(h.created.length,0);}
  const h=harness();h.session['identity:1']='other';await assert.rejects(h.api.open(request,sender),/账号/);assert.equal(h.created.length,0);
  const valid=harness();for(const image of [{dataURL:'data:text/html;base64,aGVsbG8='},{dataURL:'data:image/png;base64,iVBORw0KGgo'+'A'.repeat(7*1024*1024)}])await assert.rejects(valid.api.open({...request,image},sender),/无效/);assert.equal(valid.created.length,0);
});
test('sharing creates one new composer, forwards PNG and text, and releases its pending guard after failure',async()=>{
  const h=harness();assert.equal((await h.api.open(request,sender)).ok,true);assert.equal(h.created[0].url,'https://x.com/compose/post');assert.equal(h.created[0].active,true);
  const message=h.sent.find(m=>m.type==='XIAN_ATTACH_SHARE');assert.equal(message.text,request.text);assert.equal(message.image.dataURL,png);assert.equal(message.handle,'tester');
  h.setFailure(true);await assert.rejects(h.api.open(request,sender),/Upload failed/);h.setFailure(false);assert.equal((await h.api.open(request,sender)).ok,true);
});
test('sharing stops on login or navigation away instead of attaching to another page',async()=>{
  for(const url of ['https://x.com/i/flow/login','https://evil.test','https://x.com/home']){const h=harness();h.setTarget(url);await assert.rejects(h.api.open(request,sender));assert.equal(h.sent.filter(m=>m.type==='XIAN_ATTACH_SHARE').length,0);}
});
test('avatar export is limited to public X avatar URLs and sends no credentials',async()=>{
  const h=harness();assert.equal(await h.api.avatar('tester'),'data:image/png;base64,AQID');assert.equal(h.requests[0].options.credentials,'omit');assert.equal(h.requests[0].options.redirect,'error');
  for(const url of ['https://evil.test/photo.png','http://pbs.twimg.com/profile_images/123/avatar.png','https://pbs.twimg.com/media/private.png']){h.local['account:tester'].profile.avatar=url;assert.equal(await h.api.avatar('tester'),'');}assert.equal(h.requests.length,1);
});
