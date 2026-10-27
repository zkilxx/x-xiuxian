const {test}=require('node:test');const assert=require('node:assert/strict');
const C=require('../extension/core.js'),Share=require('../extension/share.js');
const now=Date.parse('2026-10-27T02:00:00Z');
function fixture(){
  const a=C.blank({handle:'tester',followers:100});C.ingest(a,{users:[{handle:'tester',followers:100}]},now-60000);C.ingest(a,{users:[{handle:'tester',followers:108}]},now);
  C.recordReward(a,{qualified90d:129400,precision:100},now-2*86400000);C.recordReward(a,{qualified90d:131900,precision:100},now-86400000);C.recordReward(a,{qualified90d:134600,precision:100},now);
  C.recordStudio(a,{date:'2026-10-27',taskTimeZone:'UTC',posts:2,replies:12,totalViews:16100},now);return a;
}
test('share summary contains the same dated counts, reward units and both daily deltas',()=>{
  const value=Share.text(C.snapshot(fixture(),now));assert.match(value,/2026-10-27.*UTC/);assert.match(value,/@tester/);assert.match(value,/发推 2\/3 · 回推 12\/20/);assert.match(value,/曝光 16,100 · 粉丝 108（观测\+8）/);assert.match(value,/飞升 约13.46W\/50W/);assert.match(value,/昨日净增 约\+2,500 · 今日新增 约\+2,700/);assert.ok(value.endsWith('https://github.com/zkilxx/x-xiuxian'));
});
test('share summary keeps missing data unknown, preserves zero and negative progress',()=>{
  const a=fixture();C.recordReward(a,{qualified90d:130900,precision:100},now+1000);const value=Share.text(C.snapshot(a,now+1000));assert.match(value,/今日新增 约-1,000/);
  const empty=Share.text(C.snapshot(C.blank({handle:'tester',followers:null}),now));assert.match(empty,/曝光 — · 粉丝 —/);assert.match(empty,/飞升 —\/50W/);assert.match(empty,/昨日净增 — · 今日新增 —/);
  C.recordReward(a,{qualified90d:131900,precision:100},now+2000);assert.match(Share.text(C.snapshot(a,now+2000)),/今日新增 约\+0/);
});
test('share summary labels partial readings and midnight never reuses yesterday as today',()=>{
  const a=C.blank({handle:'tester',followers:0});C.recordReward(a,{qualified90d:1000},now);assert.match(Share.text(C.snapshot(a,now)),/今日新增 \+0（首次观测后）/);
  const next=Share.text(C.snapshot(a,now+86400000));assert.match(next,/昨日净增 \+0（首次观测后） · 今日新增 —/);
  const otherDate=C.snapshot(fixture(),Date.parse('2026-10-27T23:00:00Z'));assert.match(Share.text(otherDate),/增量日期 2026-10-28（Asia\/Shanghai）/);
});
