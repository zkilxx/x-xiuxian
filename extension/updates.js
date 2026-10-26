/* Public Release metadata only; no account data is sent to GitHub. */
(() => {
  'use strict';
  const repository='https://github.com/zkilxx/x-xiuxian';
  const endpoint='https://api.github.com/repos/zkilxx/x-xiuxian/releases/latest';
  const cacheKey='xianUpdateCheck',interval=6*60*60*1000,retryInterval=15*60*1000;
  let pending;
  function versionParts(value){
    if(typeof value!=='string'||!/^v?\d+(?:\.\d+){1,3}$/.test(value))return null;
    const parts=value.replace(/^v/,'').split('.').map(Number);
    return parts.every(Number.isSafeInteger)?parts:null;
  }
  function isNewerVersion(candidate,current){
    const a=versionParts(candidate),b=versionParts(current);if(!a||!b)return false;
    for(let i=0;i<4;i++)if((a[i]||0)!==(b[i]||0))return(a[i]||0)>(b[i]||0);
    return false;
  }
  function releaseInfo(value){
    if(!value||value.draft||value.prerelease||!versionParts(value.tag))return null;
    const version=value.tag.replace(/^v/,''),releaseURL=`${repository}/releases/tag/${encodeURIComponent(value.tag)}`;
    let downloadURL='';
    try{
      const url=new URL(value.downloadURL);
      if(url.origin==='https://github.com'&&!url.username&&!url.password&&!url.search&&!url.hash
        &&url.pathname===`/zkilxx/x-xiuxian/releases/download/${encodeURIComponent(value.tag)}/x-xiuxian-v${version}.zip`)downloadURL=url.href;
    }catch{}
    return{version,releaseURL,downloadURL};
  }
  async function check(force){
    const currentVersion=chrome.runtime.getManifest().version,now=Date.now();let cached;
    try{cached=(await chrome.storage.local.get(cacheKey))[cacheKey];}catch{}
    const info=releaseInfo(cached?.release);
    const result=(release,failed=false,checkedAt=null)=>({currentVersion,latestVersion:release?.version||'',
      status:release?(isNewerVersion(release.version,currentVersion)?'available':'current'):'error',
      releaseURL:release?.releaseURL||`${repository}/releases/latest`,downloadURL:release?.downloadURL||'',checkedAt,failed});
    const recent=(time,age)=>Number.isFinite(time)&&time>0&&now>=time&&now-time<age;
    if(!force&&(info||cached?.failed)&&recent(cached.attemptedAt,cached.failed?retryInterval:interval))return result(info,Boolean(cached.failed),cached.checkedAt);
    try{
      const response=await fetch(endpoint,{credentials:'omit',referrerPolicy:'no-referrer',redirect:'error',cache:'no-store',
        headers:{Accept:'application/vnd.github+json'},signal:AbortSignal.timeout(8000)});
      if(!response.ok)throw new Error('Release check failed');
      const data=await response.json(),version=typeof data.tag_name==='string'?data.tag_name.replace(/^v/,''):'';
      const asset=Array.isArray(data.assets)?data.assets.find(a=>a.name===`x-xiuxian-v${version}.zip`&&a.state==='uploaded'):null;
      const release={tag:data.tag_name,draft:data.draft,prerelease:data.prerelease,downloadURL:asset?.browser_download_url};
      const latest=releaseInfo(release);if(!latest)throw new Error('Invalid release');
      try{await chrome.storage.local.set({[cacheKey]:{release,attemptedAt:now,checkedAt:now,failed:false}});}catch{}
      return result(latest,false,now);
    }catch{
      try{await chrome.storage.local.set({[cacheKey]:{release:cached?.release,attemptedAt:now,checkedAt:cached?.checkedAt,failed:true}});}catch{}
      return result(info,true,cached?.checkedAt||null);
    }
  }
  function checkForUpdates(force=false){if(pending)return pending;pending=check(force).finally(()=>{pending=null;});return pending;}
  globalThis.XianUpdates={checkForUpdates,isNewerVersion,releaseInfo};
})();
