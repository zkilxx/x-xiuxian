/* Local panel capture and a compact summary of the same frozen snapshot. */
(() => {
  'use strict';
  const fmt=n=>Number.isFinite(n)?new Intl.NumberFormat('en-US').format(n):'—';
  const delta=track=>Number.isFinite(track?.delta)?`${track.approximate?'约':''}${track.delta>=0?'+':''}${fmt(track.delta)}`:'—';
  function text(data){
    const t=data.today,r=data.reward,previous=new Date(Date.parse(t.date+'T00:00:00Z')-86400000).toISOString().slice(0,10);
    const yesterday=data.history?.find(row=>row.date===previous)?.rewardTrack;
    return[
      `「@${data.profile.handle}·${t.date} 𝕏 修仙战报」`,
      '',
      '「今日修行」',
      `发推：${fmt(t.posts)}/${data.settings.posts}`,
      `回推：${fmt(t.replies)}/${data.settings.replies}`,
      '',
      '「天地灵气」',
      `今日总曝光：${fmt((data.studioToday||t.studio)?.totalViews)}`,
      '',
      '「道侣」',
      `粉丝总数：${fmt(data.profile.followers)}`,
      `今日净增：${Number.isFinite(t.followerDelta)?`${t.followerDelta>=0?'+':''}${fmt(t.followerDelta)}`:'—'}`,
      '',
      '「飞升进度」',
      `创作者曝光总进度：${r?.precision>1?'约':''}${r?.qualified90d==null?'—':(r.qualified90d/10000).toFixed(2)+'W'}/50W`,
      `昨日净增：${delta(yesterday)}`,
      `今日新增：${delta(t.rewardTrack)}`,
      '',
      '#𝕏修仙面板'
    ].join('\n');
  }
  function dataURL(blob){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('面板图片转换失败，请重试。'));reader.readAsDataURL(blob);});}
  async function capture(shell,avatarData=''){
    const main=shell.querySelector('main'),width=Math.ceil(shell.getBoundingClientRect().width);
    const footerHeight=shell.querySelector('footer')?.getBoundingClientRect().height||0;
    const versionHeight=shell.querySelector('#update-bar')?.getBoundingClientRect().height||0;
    const creditHeight=32;
    const height=Math.ceil(shell.getBoundingClientRect().height-main.clientHeight+main.scrollHeight-footerHeight-versionHeight+creditHeight);
    const clone=shell.cloneNode(true),originals=[shell,...shell.querySelectorAll('*')],copies=[clone,...clone.querySelectorAll('*')];
    const resources=new Map();
    async function inline(raw){
      if(raw.startsWith('data:'))return raw;
      const url=new URL(raw,location.href);
      if(url.origin!==location.origin)throw new Error('分享图片只能读取插件本地素材。');
      if(!resources.has(url.href))resources.set(url.href,fetch(url.href).then(async response=>{if(!response.ok)throw new Error('面板素材加载失败。');return dataURL(await response.blob());}));
      return resources.get(url.href);
    }
    const work=[];
    for(let i=0;i<originals.length;i++){
      const source=originals[i],target=copies[i],style=getComputedStyle(source);
      if(source.closest('footer,#update-bar')){target.remove();continue;}
      if(source.closest('.view')?.id&&source.closest('.view').id!=='home'){target.remove();continue;}
      for(const property of style)target.style.setProperty(property,style.getPropertyValue(property));
      target.style.animation='none';target.style.transition='none';
      for(const pseudo of ['::before','::after']){
        const decoration=getComputedStyle(source,pseudo);if(decoration.content==='none'||decoration.content==='normal'||decoration.display==='none')continue;
        const element=document.createElement('span');for(const property of decoration)element.style.setProperty(property,decoration.getPropertyValue(property));element.style.content='normal';
        if(pseudo==='::before')target.prepend(element);else target.append(element);
      }
      if(source.tagName==='PROGRESS'){
        const track=document.createElement('div'),fill=document.createElement('div');track.style.cssText=target.style.cssText;
        track.style.position='relative';track.style.background='#0b1718';fill.style.cssText=`height:100%;width:${Math.max(0,Math.min(100,source.value/source.max*100))}%;background:linear-gradient(90deg,#398b79,#84ddbd);border-radius:20px`;
        track.append(fill);target.replaceWith(track);
      }
      if(style.backgroundImage.includes('url('))work.push((async()=>{let value=style.backgroundImage;for(const match of [...value.matchAll(/url\(["']?([^"')]+)["']?\)/g)])value=value.replace(match[0],`url("${await inline(match[1])}")`);target.style.backgroundImage=value;})());
      if(source.tagName==='IMG'&&source.getAttribute('src')){
        if(source.id==='avatar'){
          work.push(Promise.resolve(avatarData).then(value=>{if(value)target.setAttribute('src',value);else{target.hidden=true;target.style.display='none';const fallback=clone.querySelector('#avatar-fallback');fallback.hidden=false;fallback.style.display='block';}}));
        }else work.push(inline(source.src).then(value=>target.setAttribute('src',value)));
      }
      if(source.localName==='image'&&source.getAttribute('href'))work.push(inline(source.getAttribute('href')).then(value=>target.setAttribute('href',value)));
    }
    clone.style.width=width+'px';clone.style.height=height+'px';clone.style.position='relative';clone.style.margin='0';
    const cloneMain=clone.querySelector('main');cloneMain.style.height=main.scrollHeight+'px';cloneMain.style.flex='none';cloneMain.style.overflow='visible';
    for(const id of ['notice','reminder-alert']){const element=clone.querySelector('#'+id);if(element){element.hidden=true;element.style.display='none';}}
    const credit=document.createElement('a');credit.href='https://github.com/zkilxx/x-xiuxian';
    const github=shell.querySelector('#author-github svg').cloneNode(true);github.style.cssText='width:14px;height:14px;flex-shrink:0;display:block;fill:currentColor';
    credit.append(github,document.createTextNode('github.com/zkilxx/x-xiuxian'));
    credit.style.cssText=`height:${creditHeight}px;min-height:${creditHeight}px;flex-shrink:0;display:flex;align-items:center;justify-content:center;gap:6px;text-decoration:none;margin:0 15px;border-top:1px solid #b29a5a35;color:#c5b589;font:11px/1.4 -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;white-space:nowrap`;
    clone.append(credit);
    await Promise.all(work);await document.fonts.ready;
    const wrapper=document.createElementNS('http://www.w3.org/1999/xhtml','div');wrapper.style.cssText=`width:${width}px;height:${height}px;background:#0b1a1b;border-radius:14px;overflow:hidden`;wrapper.append(clone);
    const xml=new XMLSerializer().serializeToString(wrapper);
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><foreignObject width="100%" height="100%">${xml}</foreignObject></svg>`;
    const image=new Image();image.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);await image.decode();
    const canvas=document.createElement('canvas');canvas.width=width*3;canvas.height=height*3;
    const context=canvas.getContext('2d');context.scale(3,3);context.drawImage(image,0,0,width,height);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw new Error('面板图片生成失败。');
    if(blob.size>5*1024*1024)throw new Error('面板图片超过 5MB，请稍后重试。');
    return{dataURL:await dataURL(blob),width:canvas.width,height:canvas.height};
  }
  const api={text,capture};globalThis.XianShare=api;if(typeof module!=='undefined')module.exports=api;
})();
