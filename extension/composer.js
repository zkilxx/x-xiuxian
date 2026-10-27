/* Attach only after an explicit share request. Never click the publish button. */
(() => {
  'use strict';
  const tasks=new Map(),pause=()=>new Promise(resolve=>setTimeout(resolve,200));
  const visible=e=>Boolean(e?.getClientRects().length);
  const normalize=value=>String(value||'').replace(/\r|\u200b/g,'').trim();
  const previews=root=>[...root.querySelectorAll('[data-testid="attachments"] img,[data-testid="attachments"] video,[data-testid="mediaPreview"]')].filter(visible);
  function identity(){
    const link=document.querySelector('[data-testid="AppTabBar_Profile_Link"]'),button=document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"]');
    const handle=(link?.getAttribute('href')||'').split('/')[1]?.toLowerCase(),shown=button?.innerText.match(/@([A-Za-z0-9_]{1,15})\b/)?.[1]?.toLowerCase();
    return handle&&button&&(!shown||shown===handle)?handle:null;
  }
  async function attach(request){
    if(!/^\/compose\/(post|tweet)\/?$/.test(location.pathname))throw new Error('请在新的 X 发帖编辑栏中分享。');
    if(!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(request.image?.dataURL||'')||request.image.dataURL.length>7*1024*1024||typeof request.text!=='string'||request.text.length>1000)throw new Error('分享内容无效，请重新生成。');
    const binary=atob(request.image.dataURL.split(',')[1]);if(binary.length>5*1024*1024)throw new Error('面板图片超过 5MB。');
    let editor,input,root;const deadline=Date.now()+20000;
    while(Date.now()<deadline){
      if(/\/i\/flow\/(login|signup)/.test(location.pathname))throw new Error('请先在新标签页登录 X，再回到面板重试。');
      const handle=identity();if(handle&&handle!==request.handle)throw new Error('新编辑栏登录账号与分享账号不一致，已停止填入。');
      editor=[...document.querySelectorAll('[data-testid^="tweetTextarea_"][contenteditable="true"]')].find(visible);
      if(editor&&handle===request.handle){root=editor.closest('[role="dialog"]')||editor.closest('form')||document;input=root.querySelector('input[type="file"][data-testid="fileInput"],input[type="file"][accept*="image"]');if(input&&!input.disabled)break;}
      await pause();
    }
    if(!editor||!input||input.disabled||identity()!==request.handle)throw new Error('未找到已确认账号的 X 编辑栏，请检查新标签页后重试。');
    if(normalize(editor.innerText)||input.files.length||previews(root).length)throw new Error('新编辑栏已有草稿或图片，请先处理现有内容，再重试。');
    editor.focus();if(!document.execCommand('insertText',false,request.text)||normalize(editor.innerText)!==normalize(request.text))throw new Error('未能完整填入文字，请检查新标签页后重试。');
    const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0)),transfer=new DataTransfer();
    transfer.items.add(new File([bytes],String(request.image.filename||'X修仙.png').replace(/[\\/]/g,'-'),{type:'image/png'}));
    input.files=transfer.files;input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));
    const previewDeadline=Date.now()+20000;
    while(Date.now()<previewDeadline){
      if(previews(root).length){if(normalize(editor.innerText)!==normalize(request.text))throw new Error('图片已添加，但文字发生变化，请在新标签页核对。');editor.focus();return{ok:true};}
      if([...root.querySelectorAll('[role="alert"]')].some(e=>visible(e)&&e.textContent.trim()))throw new Error('X 未能添加图片，请在新标签页查看提示。');
      await pause();
    }
    throw new Error('X 尚未显示图片预览，请检查新标签页，避免重复添加。');
  }
  chrome.runtime.onMessage.addListener((message,sender,respond)=>{
    if(sender.id!==chrome.runtime.id)return;
    if(message?.type==='XIAN_COMPOSER_PING'){respond({version:chrome.runtime.getManifest().version});return;}
    if(message?.type!=='XIAN_ATTACH_SHARE'||typeof message.id!=='string')return;
    if(!tasks.has(message.id)){tasks.set(message.id,attach(message));if(tasks.size>20)tasks.delete(tasks.keys().next().value);}
    tasks.get(message.id).then(respond).catch(error=>respond({ok:false,error:error.message}));return true;
  });
})();
