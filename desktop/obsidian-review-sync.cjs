'use strict';
const validId=id=>typeof id==='string'&&/^[a-zA-Z0-9-]{1,100}$/.test(id);

// Review marks are additive. Only identities that have already been paired
// with a file in this dedicated folder may cross the application boundary.
function validateProgress(value){
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('回顾进度格式无效');
 const days=Object.keys(value);if(days.length>10000)throw Error('回顾进度过大');let total=0;
 for(const day of days){const ids=value[day];if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Array.isArray(ids)||ids.some(id=>!validId(id))||new Set(ids).size!==ids.length)throw Error('回顾进度格式无效');total+=ids.length;if(total>100000)throw Error('回顾进度过大');}
 return value;
}
function planReviewSync(fomo,obsidian,eligible){
 validateProgress(fomo);validateProgress(obsidian);if(!Array.isArray(eligible)||eligible.length>10000||eligible.some(id=>!validId(id))||new Set(eligible).size!==eligible.length)throw Error('同步笔记身份无效');
 const allowed=new Set(eligible),toFomo={},toObsidian={};
 for(const day of [...new Set([...Object.keys(fomo),...Object.keys(obsidian)])].sort()){
  const left=new Set(fomo[day]||[]),right=new Set(obsidian[day]||[]),fromRight=[...right].filter(id=>allowed.has(id)&&!left.has(id)).sort(),fromLeft=[...left].filter(id=>allowed.has(id)&&!right.has(id)).sort();
  if(fromRight.length)toFomo[day]=fromRight;if(fromLeft.length)toObsidian[day]=fromLeft;
 }
 return {toFomo,toObsidian};
}
module.exports={planReviewSync,validateProgress};
