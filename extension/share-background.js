/* Shares are explicit user requests; only the new composer tab receives the PNG. */
(() => {
  'use strict';
  const pending=new Map(),pause=()=>new Promise(resolve=>setTimeout(resolve,250));
  async function avatar(handle){
    const account=(await chrome.storage.local.get('account:'+handle))['account:'+handle];
    let url;try{url=new URL(account?.profile.avatar);if(url.origin!=='https://pbs.twimg.com'||!url.pathname.startsWith('/profile_images/'))return'';}catch{return'';}
    try{
      const response=await fetch(url.href,{credentials:'omit',redirect:'error',signal:AbortSignal.timeout(8000)}),type=response.headers.get('content-type')?.split(';')[0];
      if(!response.ok||!['image/png','image/jpeg','image/webp','image/gif'].includes(type))return'';
      const bytes=new Uint8Array(await response.arrayBuffer());if(bytes.byteLength>3*1024*1024)return'';
      let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));return`data:${type};base64,${btoa(binary)}`;
    }catch{return'';}
  }
  async function open(request,sender){
    const handle=XianCore.handle(request.handle),id=sender.tab?.id;
    if(sender.id!==chrome.runtime.id||id==null||!/^https:\/\/(x|twitter)\.com\//.test(sender.tab.url||''))throw new Error('请从 X 页面的修仙面板分享。');
    const identity=(await chrome.storage.session.get('identity:'+id))['identity:'+id];
    if(!handle||identity!==handle)throw new Error('当前账号已变化，请确认账号后重试。');
    if(typeof request.text!=='string'||request.text.length>1000||!request.text.includes('@'+handle)||!/^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/=]+$/.test(request.image?.dataURL||'')||request.image.dataURL.length>7*1024*1024)throw new Error('分享内容无效，请重新生成。');
    if(pending.has(id))throw new Error('分享正在处理中，请稍候。');
    pending.set(id,true);
    try{
      const tab=await chrome.tabs.create({url:'https://x.com/compose/post',active:true});
      const deadline=Date.now()+30000;let ready=false;
      while(Date.now()<deadline){
        const current=await chrome.tabs.get(tab.id);
        if(/\/i\/flow\/(login|signup)/.test(current.url||''))throw new Error('请先在新标签页登录 X，再回到面板重试。');
        if(current.url&&!/^https:\/\/(x|twitter)\.com\//.test(current.url)&&current.url!=='about:blank')throw new Error('新标签页已离开 X，本次分享已停止。');
        try{const pong=await chrome.tabs.sendMessage(tab.id,{type:'XIAN_COMPOSER_PING'});if(pong?.version===chrome.runtime.getManifest().version){ready=true;break;}}catch{}
        await pause();
      }
      if(!ready)throw new Error('X 编辑栏加载超时，请检查新标签页后重试。');
      const destination=await chrome.tabs.get(tab.id);if(!/^https:\/\/(x|twitter)\.com\/compose\/(post|tweet)\/?(?:[?#]|$)/.test(destination.url||''))throw new Error('新标签页已离开发帖编辑栏，本次分享已停止。');
      const result=await chrome.tabs.sendMessage(tab.id,{type:'XIAN_ATTACH_SHARE',id:crypto.randomUUID(),handle,text:request.text,image:request.image});
      if(!result?.ok)throw new Error(result?.error||'X 未能添加分享内容，请检查新标签页。');
      return{ok:true};
    }finally{pending.delete(id);}
  }
  globalThis.XianSharing={avatar,open};
})();
