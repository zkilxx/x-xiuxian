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
